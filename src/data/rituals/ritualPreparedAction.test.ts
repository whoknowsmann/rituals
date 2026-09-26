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
    expect(transport.rentLengths).toEqual([977, 165, 165])
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

  it('rejects array-shaped RPC envelopes and array transports without leaking raw errors', async () => {
    const transport = new FakeTransport()
    transport.getLatestBlockhashAndContext = async () => [] as never
    const preparer = new RitualActionPreparer(transport, LOCAL_PLACEHOLDER_PROGRAM_ID)
    await expect(preparer.prepareCreate(args)).rejects.toMatchObject({ category: 'rpc' })

    expect(() => new RitualActionPreparer([] as never, LOCAL_PLACEHOLDER_PROGRAM_ID)).toThrowError(RitualPreparationError)
    try { new RitualActionPreparer([] as never, LOCAL_PLACEHOLDER_PROGRAM_ID) } catch (error) { expect(error).toMatchObject({ category: 'input' }) }
  })

  it('rejects a fee transport that mutates the compiled message', async () => {
    class MutatingFeeTransport extends FakeTransport {
      async getFeeForMessage(...input: Parameters<FakeTransport['getFeeForMessage']>) {
        const [message] = input as unknown as [import('@solana/web3.js').Message]
        message.instructions.length = 0
        return { context: { slot: 12 }, value: 5000 }
      }
    }
    const preparer = new RitualActionPreparer(new MutatingFeeTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    await expect(preparer.prepareCreate(args)).rejects.toMatchObject({ category: 'fee' })
  })

  it('sanitizes revoked prepared and wallet transaction proxies', async () => {
    const preparer = new RitualActionPreparer(new FakeTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const action = await preparer.prepareCreate(args)
    const actionProxy = Proxy.revocable(action, {})
    actionProxy.revoke()
    expect(() => preparer.getTransactionForWallet(actionProxy.proxy)).toThrowError(RitualPreparationError)

    const wallet = preparer.getTransactionForWallet(action).transaction
    const walletProxy = Proxy.revocable(wallet, {})
    walletProxy.revoke()
    expect(() => preparer.assertWalletTransactionUnchanged(action, walletProxy.proxy)).toThrowError(RitualPreparationError)
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

  const malformedLatest: unknown[] = [
    null, undefined, 1, 'latest', [], Proxy.revocable({}, {}).proxy,
    {}, { context: null }, { context: [] }, { context: {}, value: {} },
    { context: { slot: -1 }, value: {} }, { context: { slot: 0.5 }, value: {} },
    { context: { slot: Number.NaN }, value: {} }, { context: { slot: Number.MAX_SAFE_INTEGER + 1 }, value: {} },
    { context: { slot: '12' }, value: {} }, { context: { slot: 12 }, value: null },
    { context: { slot: 12 }, value: [] }, { context: { slot: 12 }, value: { blockhash: '' } },
    { context: { slot: 12 }, value: { blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 100 } },
    { context: { slot: 12 }, value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 100 } },
    { context: { slot: 12 }, value: { blockhash: key(9).toBase58(), lastValidBlockHeight: -1 } },
    { context: { slot: 12 }, value: { blockhash: key(9).toBase58(), lastValidBlockHeight: 0.5 } },
    { context: { slot: 12 }, value: { blockhash: key(9).toBase58(), lastValidBlockHeight: Number.NaN } },
    { context: { slot: 12 }, value: { blockhash: key(9).toBase58(), lastValidBlockHeight: Number.MAX_SAFE_INTEGER + 1 } },
    { context: { slot: 12 }, value: { blockhash: key(9).toBase58(), lastValidBlockHeight: '100' } },
  ]
  it.each(malformedLatest)('maps malformed latest response %# to rpc', async (latest) => {
    const transport = new FakeTransport()
    transport.getLatestBlockhashAndContext = async () => latest as never
    await expect(new RitualActionPreparer(transport, LOCAL_PLACEHOLDER_PROGRAM_ID).prepareCreate(args)).rejects.toMatchObject({ category: 'rpc' })
  })

  const malformedFee: unknown[] = [
    null, undefined, 1, 'fee', [], {}, { context: null }, { context: [] },
    { context: {}, value: 1 }, { context: { slot: -1 }, value: 1 },
    { context: { slot: 11 }, value: 1 }, { context: { slot: 12 }, value: null },
    { context: { slot: 12 }, value: -1 }, { context: { slot: 12 }, value: 0.5 },
    { context: { slot: 12 }, value: Number.NaN }, { context: { slot: 12 }, value: Number.MAX_SAFE_INTEGER + 1 },
    { context: { slot: 12 }, value: '5000' },
    ...Array.from({ length: 21 }, (_, index) => ({ context: { slot: 12 }, value: { nested: index } })),
  ]
  it.each(malformedFee)('maps malformed fee response %# to fee', async (fee) => {
    class FeeTransport extends FakeTransport {
      async getFeeForMessage(): Promise<any> { return fee }
    }
    await expect(new RitualActionPreparer(new FeeTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID).prepareCreate(args)).rejects.toMatchObject({ category: 'fee' })
  })

  const malformedRent: unknown[] = [undefined, null, {}, [], '165', -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 1n, ...Array.from({ length: 21 }, (_, index) => -index - 2)]
  it.each(malformedRent)('maps malformed rent %# to rent and produces no action', async (rent) => {
    class RentTransport extends FakeTransport {
      calls = 0
      async getMinimumBalanceForRentExemption(): Promise<any> { this.calls += 1; return rent }
    }
    const transport = new RentTransport()
    await expect(new RitualActionPreparer(transport, LOCAL_PLACEHOLDER_PROGRAM_ID).prepareCreate(args)).rejects.toMatchObject({ category: 'rent' })
    expect(transport.calls).toBe(1)
  })
})
