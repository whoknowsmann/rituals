import { describe, expect, it } from 'vitest'
import { Keypair, PublicKey, Transaction } from '@solana/web3.js'

import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import { RitualActionPreparer, type RitualPreparationTransport } from './ritualPreparedAction'
import { RitualActionSubmitter, type RitualWalletSubmissionTransport } from './ritualSubmission'
import type { BuildCreateRitualArgs } from './instructionsLifecycle'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const payer = Keypair.fromSeed(new Uint8Array(32).fill(7))
const args: BuildCreateRitualArgs = {
  programId: LOCAL_PLACEHOLDER_PROGRAM_ID, creator: payer.publicKey, stakeMint: key(2), feeRecipientToken: key(3),
  ritual: { nonce: 7n, ruleDigest: '1f'.repeat(32) as never, members: [payer.publicKey, key(4)], memberTotalStake: 100n,
    schedule: [{ opens: 10n, deadline: 20n, resolution: 30n }], additionalConfirmationThreshold: 1, feePayerMode: 'HOST' },
}
class PreparationTransport implements RitualPreparationTransport {
  async getLatestBlockhashAndContext() { return { context: { slot: 12 }, value: { blockhash: key(9).toBase58(), lastValidBlockHeight: 100 } } }
  async getFeeForMessage() { return { context: { slot: 12 }, value: 5000 } }
  async getMinimumBalanceForRentExemption(length: number) { return length }
}
const base58 = (bytes: Uint8Array) => {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let digits = [0]
  for (const byte of bytes) { let carry = byte; for (let i = 0; i < digits.length; i++) { const value = digits[i] * 256 + carry; digits[i] = value % 58; carry = Math.floor(value / 58) }; while (carry) { digits.push(carry % 58); carry = Math.floor(carry / 58) } }
  let result = ''; for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += '1'; for (let i = digits.length - 1; i >= 0; i--) result += alphabet[digits[i]]; return result
}

describe('Ritual action submission', () => {
  it('binds a wallet signature to the exact prepared message before confirmation', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)

    const walletCalls: unknown[] = []
    const wallet: RitualWalletSubmissionTransport = { signAndSendTransaction: async (transaction, slot) => { walletCalls.push(transaction, slot); transaction.partialSign(payer); return base58(transaction.signatures[0].signature as Uint8Array) } }
    const confirmed = { marker: 'authoritative' }
    const confirmer = { confirmAndReadRitual: async (action: unknown) => { expect(action).toMatchObject({ signature: expect.any(String), submittedContextSlot: prepared.blockhashContextSlot }); return confirmed as never } }
    const submitter = new RitualActionSubmitter(preparer, confirmer as never, wallet)
    const result = await submitter.submitAndConfirm(prepared)
    expect(result).toMatchObject({ actionKind: 'create', expectationKind: 'created', confirmed })
    expect(Object.isFrozen(result)).toBe(true)
    expect(walletCalls).toHaveLength(2)
    expect(walletCalls[0]).toBeInstanceOf(Object)
    expect(walletCalls[1]).toBe(12)
  })

  it('rejects malformed wallet signatures before confirmation', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    let confirmations = 0
    const submitter = new RitualActionSubmitter(preparer, { confirmAndReadRitual: async () => { confirmations += 1; return null as never } } as never, { signAndSendTransaction: async () => 'not-a-signature' })
    await expect(submitter.submitAndConfirm(prepared)).rejects.toMatchObject({ category: 'signature' })
    expect(confirmations).toBe(0)
  })

  it('rejects a valid signature made for a different message', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    let confirmations = 0
    const submitter = new RitualActionSubmitter(preparer, { confirmAndReadRitual: async () => { confirmations += 1; return null as never } } as never, { signAndSendTransaction: async (transaction: Transaction) => { const changed = new Transaction({ feePayer: payer.publicKey, blockhash: key(8).toBase58(), lastValidBlockHeight: 100 }); changed.add(transaction.instructions[0]); changed.partialSign(payer); return base58(changed.signatures[0].signature as Uint8Array) } })
    await expect(submitter.submitAndConfirm(prepared)).rejects.toMatchObject({ category: 'signature' })
    expect(confirmations).toBe(0)
  })

  it('rejects wallet message mutation after handoff without confirmation', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    let confirmations = 0
    const submitter = new RitualActionSubmitter(preparer, { confirmAndReadRitual: async () => { confirmations += 1; return null as never } } as never, { signAndSendTransaction: async (transaction: Transaction) => { transaction.recentBlockhash = key(8).toBase58(); return '11111111111111111111111111111111111111111111111111111111111111111' } })
    await expect(submitter.submitAndConfirm(prepared)).rejects.toMatchObject({ category: 'mutation' })
    expect(confirmations).toBe(0)
  })

  it('rejects actions from another preparer before touching the wallet', async () => {
    const first = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const second = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await first.prepareCreate(args)
    let calls = 0
    const submitter = new RitualActionSubmitter(second, { confirmAndReadRitual: async () => null as never } as never, { signAndSendTransaction: async () => { calls += 1; return '' } })
    await expect(submitter.submitAndConfirm(prepared)).rejects.toMatchObject({ category: 'input' })
    expect(calls).toBe(0)
  })
})
