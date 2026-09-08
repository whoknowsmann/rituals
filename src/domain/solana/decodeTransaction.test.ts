import { Buffer } from 'buffer'
import {
  AddressLookupTableAccount,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import {
  AuthorityType,
  createApproveInstruction,
  createCloseAccountInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { describe, expect, it } from 'vitest'
import { decodeBase64Transaction, MAX_TRANSACTION_BYTES } from './decodeTransaction'

const payer = new PublicKey(new Uint8Array(32).fill(1))
const recipient = new PublicKey(new Uint8Array(32).fill(2))
const sourceTokenAccount = new PublicKey(new Uint8Array(32).fill(3))
const destinationTokenAccount = new PublicKey(new Uint8Array(32).fill(4))
const mint = new PublicKey(new Uint8Array(32).fill(5))
const blockhash = new PublicKey(new Uint8Array(32).fill(9)).toBase58()

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function legacyTransaction(...instructions: TransactionInstruction[]): string {
  const transaction = new Transaction({ feePayer: payer, recentBlockhash: blockhash })
  transaction.add(...instructions)
  return toBase64(
    transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
  )
}

function versionedTransaction(
  instructions: TransactionInstruction[],
  lookupTables: AddressLookupTableAccount[] = [],
): string {
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(lookupTables)
  return toBase64(new VersionedTransaction(message).serialize())
}

describe('decodeBase64Transaction', () => {
  it('decodes a legacy System Program transfer into exact observed movement', () => {
    const encoded = legacyTransaction(
      SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports: 1_500_000n }),
    )

    const decoded = decodeBase64Transaction(encoded)

    expect(decoded.messageVersion).toBe('legacy')
    expect(decoded.feePayer).toBe(payer.toBase58())
    expect(decoded.requiredSigners).toContain(payer.toBase58())
    expect(decoded.instructions).toEqual([
      expect.objectContaining({
        index: 0,
        programId: SystemProgram.programId.toBase58(),
        status: 'DECODED',
        type: 'SYSTEM_TRANSFER',
      }),
    ])
    expect(decoded.evidence.assetMovements).toEqual([
      {
        asset: 'SOL',
        amount: '0.0015',
        from: payer.toBase58(),
        to: recipient.toBase58(),
      },
    ])
    expect(decoded.evidence.evidenceComplete).toBe(true)
  })

  it('decodes a v0 SPL transfer-checked without requiring account state', () => {
    const instruction = createTransferCheckedInstruction(
      sourceTokenAccount,
      mint,
      destinationTokenAccount,
      payer,
      1_250_000n,
      6,
    )

    const decoded = decodeBase64Transaction(versionedTransaction([instruction]))

    expect(decoded.messageVersion).toBe(0)
    expect(decoded.instructions[0]).toMatchObject({
      programId: TOKEN_PROGRAM_ID.toBase58(),
      status: 'DECODED',
      type: 'SPL_TRANSFER_CHECKED',
    })
    expect(decoded.evidence.assetMovements).toEqual([
      {
        asset: mint.toBase58(),
        amount: '1.25',
        from: sourceTokenAccount.toBase58(),
        to: destinationTokenAccount.toBase58(),
      },
    ])
  })

  it('reports address lookup tables as unresolved rather than inventing accounts', () => {
    const lookupKey = new PublicKey(new Uint8Array(32).fill(6))
    const lookupTable = new AddressLookupTableAccount({
      key: lookupKey,
      state: {
        deactivationSlot: 0xffffffffffffffffn,
        lastExtendedSlot: 1,
        lastExtendedSlotStartIndex: 0,
        authority: payer,
        addresses: [recipient],
      },
    })
    const encoded = versionedTransaction(
      [SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports: 1n })],
      [lookupTable],
    )

    const decoded = decodeBase64Transaction(encoded)

    expect(decoded.addressLookupTables).toEqual([lookupKey.toBase58()])
    expect(decoded.evidence.evidenceComplete).toBe(false)
    expect(decoded.evidence.unresolvedElements).toContain(
      `ADDRESS_LOOKUP_TABLE:${lookupKey.toBase58()}`,
    )
  })

  it('decodes SPL delegate approval as an observed non-severe authority change', () => {
    const delegate = recipient
    const encoded = legacyTransaction(
      createApproveInstruction(sourceTokenAccount, delegate, payer, 500n),
    )

    const decoded = decodeBase64Transaction(encoded)

    expect(decoded.instructions[0]).toMatchObject({
      status: 'DECODED',
      type: 'SPL_APPROVE',
    })
    expect(decoded.evidence.authorityChanges).toEqual([
      {
        account: sourceTokenAccount.toBase58(),
        kind: 'DELEGATE_CHANGE',
        severity: 'NON_SEVERE',
        authority: delegate.toBase58(),
      },
    ])
  })

  it('records SPL authority reassignment without declaring it malicious', () => {
    const encoded = legacyTransaction(
      createSetAuthorityInstruction(
        sourceTokenAccount,
        payer,
        AuthorityType.AccountOwner,
        recipient,
      ),
    )

    const decoded = decodeBase64Transaction(encoded)

    expect(decoded.instructions[0]).toMatchObject({
      status: 'DECODED',
      type: 'SPL_SET_AUTHORITY',
    })
    expect(decoded.evidence.authorityChanges).toEqual([
      {
        account: sourceTokenAccount.toBase58(),
        kind: 'AUTHORITY_CHANGE',
        severity: 'NON_SEVERE',
        authority: recipient.toBase58(),
      },
    ])
  })

  it('detects an SPL token-account close instruction without inventing rent movement', () => {
    const encoded = legacyTransaction(
      createCloseAccountInstruction(sourceTokenAccount, recipient, payer),
    )

    const decoded = decodeBase64Transaction(encoded)

    expect(decoded.instructions[0]).toMatchObject({
      status: 'DECODED',
      type: 'SPL_CLOSE_ACCOUNT',
    })
    expect(decoded.evidence.assetMovements).toEqual([])
  })

  it('marks an unknown program as uncertainty instead of decoding intent', () => {
    const unknownProgram = new PublicKey(new Uint8Array(32).fill(7))
    const instruction = new TransactionInstruction({
      programId: unknownProgram,
      keys: [],
      data: Buffer.from([1, 2, 3]),
    })

    const decoded = decodeBase64Transaction(legacyTransaction(instruction))

    expect(decoded.instructions[0]).toMatchObject({ status: 'UNSUPPORTED' })
    expect(decoded.evidence.programs).toContainEqual({
      programId: unknownProgram.toBase58(),
      support: 'UNKNOWN',
    })
    expect(decoded.evidence.evidenceComplete).toBe(false)
  })

  it.each(['', 'not base64!', 'AAAA'])('rejects malformed transaction input: %s', (input) => {
    expect(() => decodeBase64Transaction(input)).toThrow(/transaction|base64/i)
  })

  it('rejects decoded payloads over the Solana transaction size limit', () => {
    const oversized = toBase64(new Uint8Array(MAX_TRANSACTION_BYTES + 1))

    expect(() => decodeBase64Transaction(oversized)).toThrow(/size/i)
  })
})
