import { describe, expect, it } from 'vitest'
import { ACCOUNT_SIZE } from '@solana/spl-token'
import { PublicKey, Transaction } from '@solana/web3.js'
import { sha256 } from '@noble/hashes/sha256'
import { ACCOUNT_DATA_LENGTHS } from './accounts'
import { createCurrentRitualActionPreparer, RitualActionPreparer, RitualPreparationError } from './ritualPreparedAction'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import type { BuildCreateRitualArgs } from './instructionsLifecycle'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const args: BuildCreateRitualArgs = {
  programId: LOCAL_PLACEHOLDER_PROGRAM_ID,
  creator: key(1), stakeMint: key(2), feeRecipientToken: key(3),
  ritual: { nonce: 7n, ruleDigest: '1f'.repeat(32) as never, members: [key(1), key(4)], memberTotalStake: 100n,
    schedule: [{ opens: 10n, deadline: 20n, resolution: 30n }], additionalConfirmationThreshold: 1, feePayerMode: 'HOST' },
}
class FakeTransport {
  readonly rentLengths: number[] = []
  async getLatestBlockhashAndContext() { return { context: { slot: 12 }, value: { blockhash: key(9).toBase58(), lastValidBlockHeight: 100 } } }
  async getFeeForMessage() { return { context: { slot: 12 }, value: 5000 } }
  async getMinimumBalanceForRentExemption(length: number) { this.rentLengths.push(length); return length }
}

describe('opaque prepared Create Ritual actions', () => {
  it('summarizes the exact compiled message and reconstructs clean wallet copies', async () => {
    const transport = new FakeTransport()
    const preparer = new RitualActionPreparer(transport, LOCAL_PLACEHOLDER_PROGRAM_ID)
    const action = await preparer.prepareCreate(args)
    expect(Object.isFrozen(action)).toBe(true)
    expect(action.summary).toMatchObject({ clusterLabel: 'local/test-unconfigured', tokenOutflow: 0n, stakeOutflow: 0n, activationFeeOutflow: 0n, estimatedNetworkFeeLamports: 5000n, estimatedRentLamports: BigInt(ACCOUNT_DATA_LENGTHS.Ritual + ACCOUNT_SIZE * 2), totalEstimatedLamportOutflow: 5000n + BigInt(ACCOUNT_DATA_LENGTHS.Ritual + ACCOUNT_SIZE * 2) })
    expect(transport.rentLengths).toEqual([909, 165, 165])
    expect('transaction' in action).toBe(false)
    const first = preparer.getTransactionForWallet(action)
    const second = preparer.getTransactionForWallet(action)
    expect(first.transaction).not.toBe(second.transaction)
    expect(Buffer.from(first.transaction.serializeMessage()).equals(Buffer.from(second.transaction.serializeMessage()))).toBe(true)
    const digest = Buffer.from(sha256(first.transaction.serializeMessage())).toString('hex')
    expect(action.messageDigest).toBe(digest)
    expect(first.blockhash).toBe(key(9).toBase58())
    preparer.assertWalletTransactionUnchanged(action, first.transaction)
    const mutations: Array<(transaction: Transaction) => void> = [
      transaction => { transaction.recentBlockhash = key(8).toBase58() },
      transaction => { transaction.recentBlockhash = key(9).toBase58(); transaction.lastValidBlockHeight = (transaction.lastValidBlockHeight ?? 0) + 1 },
      transaction => { transaction.lastValidBlockHeight = (transaction.lastValidBlockHeight ?? 0) - 1 },
      transaction => { transaction.lastValidBlockHeight = undefined },
    ]
    for (const mutate of mutations) {
      const walletTransaction = preparer.getTransactionForWallet(action).transaction
      mutate(walletTransaction)
      expect(() => preparer.assertWalletTransactionUnchanged(action, walletTransaction)).toThrowError(RitualPreparationError)
      try { preparer.assertWalletTransactionUnchanged(action, walletTransaction) } catch (error) { expect(error).toMatchObject({ category: 'mutation' }) }
    }
  })

  it('rejects prepared objects without this preparer provenance', async () => {
    const transport = new FakeTransport()
    const preparer = new RitualActionPreparer(transport, LOCAL_PLACEHOLDER_PROGRAM_ID)
    const action = await preparer.prepareCreate(args)
    expect(() => preparer.getTransactionForWallet({ ...action })).toThrowError(/provenance/)
    expect(() => new RitualActionPreparer(transport, LOCAL_PLACEHOLDER_PROGRAM_ID).getTransactionForWallet(action)).toThrowError(/provenance/)
    expect(() => new RitualActionPreparer(transport, key(8)).getTransactionForWallet(action)).toThrowError(/provenance/)
  })

  it('rejects the current factory before inspecting hostile transport dependencies', () => {
    const hostile = new Proxy({}, { get: () => { throw new Error('transport touched') } })
    expect(() => createCurrentRitualActionPreparer(hostile as never)).toThrowError(RitualPreparationError)
    try { createCurrentRitualActionPreparer(hostile as never) } catch (error) { expect(error).toMatchObject({ category: 'deployment' }) }
  })
})
