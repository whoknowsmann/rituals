import { describe, expect, it } from 'vitest'
import { ComputeBudgetProgram, Keypair, Message, PublicKey, Transaction } from '@solana/web3.js'
import { RitualActionPreparer, RITUAL_COMPUTE_UNIT_LIMIT, RITUAL_COMPUTE_UNIT_PRICE_MICROLAMPORTS } from './ritualPreparedAction'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import type { BuildCreateRitualArgs } from './instructionsLifecycle'

// Regression for the 2026-09-25 Seeker run: Phantom inserts its own
// SetComputeUnitLimit/SetComputeUnitPrice into any transaction that has none,
// signs that rewritten message, and sends it. Our exact-bytes signature check
// then rejected a Create that had landed on devnet (tx 4RbVZJqL…). Phantom
// documents that it leaves a transaction alone when the dapp already declares
// a compute budget, so every prepared action must carry both instructions.

const COMPUTE_BUDGET = ComputeBudgetProgram.programId
const blockhash = new PublicKey(new Uint8Array(32).fill(9)).toBase58()
const host = Keypair.generate()
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const args = (): BuildCreateRitualArgs => ({
  programId: LOCAL_PLACEHOLDER_PROGRAM_ID, creator: host.publicKey, stakeMint: key(2), feeRecipientToken: key(3),
  ritual: { nonce: 7n, ruleDigest: '1f'.repeat(32) as never, members: [host.publicKey, key(4)], memberTotalStake: 100n,
    schedule: [{ opens: 10n, deadline: 20n, resolution: 30n }], additionalConfirmationThreshold: 1, feePayerMode: 'HOST' },
})
const transport = () => {
  const feeMessages: Message[] = []
  return {
    feeMessages,
    getLatestBlockhashAndContext: async () => ({ context: { slot: 12 }, value: { blockhash, lastValidBlockHeight: 100 } }),
    getFeeForMessage: async (m: Message) => { feeMessages.push(m); return { context: { slot: 12 }, value: 5000 } },
    getMinimumBalanceForRentExemption: async (n: number) => n,
  }
}

/** Phantom's documented rule, modelled independently of the preparer. */
function phantomWouldRewrite(tx: Transaction): boolean {
  return !tx.instructions.some(ix => ix.programId.equals(COMPUTE_BUDGET))
}

describe('prepared transactions declare their own compute budget (Phantom rewrite guard)', () => {
  it('Create carries exactly one limit and one price instruction with the documented values', async () => {
    const t = transport(); const preparer = new RitualActionPreparer(t, LOCAL_PLACEHOLDER_PROGRAM_ID)
    const wallet = preparer.getTransactionForWallet(await preparer.prepareCreate(args()))
    const budget = wallet.transaction.instructions.filter(ix => ix.programId.equals(COMPUTE_BUDGET))
    expect(budget).toHaveLength(2)
    const limit = ComputeBudgetProgram.setComputeUnitLimit({ units: RITUAL_COMPUTE_UNIT_LIMIT })
    const price = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: RITUAL_COMPUTE_UNIT_PRICE_MICROLAMPORTS })
    expect(budget.map(ix => Buffer.from(ix.data).toString('hex'))).toEqual([Buffer.from(limit.data).toString('hex'), Buffer.from(price.data).toString('hex')])
    expect(budget.every(ix => ix.keys.length === 0)).toBe(true)
    // The program instruction stays first so index-based readers keep working.
    expect(wallet.transaction.instructions[0].programId.equals(LOCAL_PLACEHOLDER_PROGRAM_ID)).toBe(true)
    expect(phantomWouldRewrite(wallet.transaction)).toBe(false)
  })

  it('fee estimation sees the same message the wallet will sign (priority fee included)', async () => {
    const t = transport(); const preparer = new RitualActionPreparer(t, LOCAL_PLACEHOLDER_PROGRAM_ID)
    const wallet = preparer.getTransactionForWallet(await preparer.prepareCreate(args()))
    expect(Buffer.from(t.feeMessages[0].serialize()).equals(Buffer.from(wallet.transaction.serializeMessage()))).toBe(true)
  })

  it('a wallet that signs the prepared bytes verbatim produces a verifying signature', async () => {
    const t = transport(); const preparer = new RitualActionPreparer(t, LOCAL_PLACEHOLDER_PROGRAM_ID)
    const action = await preparer.prepareCreate(args()); const wallet = preparer.getTransactionForWallet(action)
    wallet.transaction.sign(host)
    expect(wallet.transaction.verifySignatures(true)).toBe(true)
    preparer.assertWalletTransactionUnchanged(action, wallet.transaction)
  })

  it('a wallet-side budget rewrite is still detected as a different message', async () => {
    const t = transport(); const preparer = new RitualActionPreparer(t, LOCAL_PLACEHOLDER_PROGRAM_ID)
    const action = await preparer.prepareCreate(args()); const wallet = preparer.getTransactionForWallet(action)
    const rewritten = new Transaction({ feePayer: host.publicKey, blockhash, lastValidBlockHeight: 100 })
    rewritten.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), wallet.transaction.instructions[0])
    expect(() => preparer.assertWalletTransactionUnchanged(action, rewritten)).toThrow(/mutated/)
  })
})
