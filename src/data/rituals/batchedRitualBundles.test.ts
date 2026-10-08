import { describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeCompletionClaim, decodeRitual, type RitualAccountView } from './accounts'
import { accountVectors, hexToBytes } from './__fixtures__/accountVectors'
import { batchRitualReads, readRitualBundlesBatched } from './batchedRitualBundles'
import { createLocalTestRitualClient } from './ritualClient'
import { RitualsRpcReader, type RitualRpcAccountInfo, type RitualRpcTransport } from './ritualsRpc'
import { CURRENT_CLAIM_VERSION, claimPda, eventPda, feeVaultPda, protocolConfigPda, ritualPda, stakeVaultPda } from './pdas'
import { ejectProgramId as programId, ritualBytes, soloAccount, eventBytes, soloEvent } from './ejectTestHelpers'
import { withReadRetry } from '../../features/rituals/client/resilientRead'

const envelope = (data: Uint8Array): RitualRpcAccountInfo => ({ owner: programId, data, executable: false })

function fakeConnection(count: number, status: 'Active' | 'Ended' = 'Active') {
  const accounts = new Map<string, RitualRpcAccountInfo>([[protocolConfigPda(programId)[0].toBase58(), envelope(hexToBytes(accountVectors.protocolConfig.hex))]])
  const rituals = Array.from({ length: count }, (_, index) => {
    const nonce = BigInt(index + 100)
    const base = soloAccount()
    const [address, bump] = ritualPda(base.creator, nonce, programId)
    const [stakeVault, stakeVaultBump] = stakeVaultPda(address, programId)
    const [feeVault, feeVaultBump] = feeVaultPda(address, programId)
    const account: RitualAccountView = { ...base, nonce, bump, stakeVault, stakeVaultBump, feeVault, feeVaultBump, status,
      ...(status === 'Ended' ? { vaultsClosed: true, completedAt: 990n, fundedStakeTotal: 0n } : {}),
    }
    accounts.set(address.toBase58(), envelope(ritualBytes(account)))
    const [eventAddress, eventBump] = eventPda(address, 0, programId)
    accounts.set(eventAddress.toBase58(), envelope(eventBytes(soloEvent(0, { ritual: address, bump: eventBump, status: 'Scheduled' }))))
    return { address, account, eventAddress }
  })
  const getMultipleAccountsInfoAndContext = vi.fn<RitualRpcTransport['getMultipleAccountsInfoAndContext']>(async (keys) => ({ context: { slot: 50 }, value: keys.map((key) => accounts.get(key.toBase58()) ?? null) }))
  return { accounts, rituals, addresses: rituals.map((ritual) => ritual.address), getMultipleAccountsInfoAndContext }
}

describe('batched authoritative ritual bundles', () => {
  it('reads N ended rituals in one batched RPC call, not N calls, through the client facade', async () => {
    const connection = fakeConnection(10, 'Ended')
    const unused = vi.fn(async () => { throw new Error('Non-read transport touched') })
    const client = createLocalTestRitualClient({ ...connection, getLatestBlockhashAndContext: unused, getFeeForMessage: unused, getMinimumBalanceForRentExemption: unused, confirmTransaction: unused }, { signAndSendTransaction: unused }, programId)
    const results = await client.getRitualBundles(connection.addresses)
    expect(results).toHaveLength(connection.addresses.length)
    expect(results.every((result) => result.status === 'fulfilled' && result.value.ritual.account.status === 'Ended' && result.value.event === null)).toBe(true)
    expect(connection.getMultipleAccountsInfoAndContext).toHaveBeenCalledTimes(1)
    expect(connection.getMultipleAccountsInfoAndContext.mock.calls[0][0]).toHaveLength(connection.addresses.length + 1)
    expect(unused).not.toHaveBeenCalled()
  })

  it('uses one discovery batch and one full snapshot for N active rituals, preserving bundle contents', async () => {
    const connection = fakeConnection(10)
    const results = await readRitualBundlesBatched(connection, programId, connection.addresses)
    expect(connection.getMultipleAccountsInfoAndContext).toHaveBeenCalledTimes(2)
    const [discovery, bundles] = connection.getMultipleAccountsInfoAndContext.mock.calls
    expect(discovery[0]).toHaveLength(connection.addresses.length + 1)
    expect(discovery[1]).toEqual({ commitment: 'confirmed' })
    expect(bundles[0]).toHaveLength(connection.addresses.length * 3 + 1)
    expect(bundles[1]).toEqual({ commitment: 'confirmed', minContextSlot: 50 })
    const reader = new RitualsRpcReader(connection, programId)
    const individual = await Promise.allSettled(connection.addresses.map((address) => reader.getRitualBundle(address)))
    expect(results).toEqual(individual)
    expect(results.every((result) => result.status === 'fulfilled' && Object.isFrozen(result.value) && Object.isFrozen(result.value.claims))).toBe(true)
  })

  it('decodes the existing group event/claim vectors with the same bitmap checks', async () => {
    const connection = fakeConnection(2)
    const ritualRaw = envelope(hexToBytes(accountVectors.ritual.hex))
    const account = decodeRitual(ritualRaw, programId)
    const address = ritualPda(account.creator, account.nonce, programId)[0]
    const eventAddress = eventPda(address, account.currentEventIndex, programId)[0]
    const claimRaw = envelope(hexToBytes(accountVectors.completionClaim.hex))
    const claim = decodeCompletionClaim(claimRaw, programId)
    connection.accounts.set(address.toBase58(), ritualRaw)
    connection.accounts.set(eventAddress.toBase58(), envelope(hexToBytes(accountVectors.ritualEvent.hex)))
    connection.accounts.set(claimPda(eventAddress, claim.claimant, CURRENT_CLAIM_VERSION, programId)[0].toBase58(), claimRaw)
    const results = await readRitualBundlesBatched(connection, programId, [...connection.addresses, address])
    expect(connection.getMultipleAccountsInfoAndContext).toHaveBeenCalledTimes(2)
    expect(results[2]).toEqual({ status: 'fulfilled', value: await new RitualsRpcReader(connection, programId).getRitualBundle(address) })
    connection.accounts.delete(claimPda(eventAddress, claim.claimant, CURRENT_CLAIM_VERSION, programId)[0].toBase58())
    const broken = await readRitualBundlesBatched(connection, programId, [address])
    expect(broken[0]).toMatchObject({ status: 'rejected', reason: { category: 'canonical' } })
  })

  it('chunks to <=100 keys and never splits a ritual/event/claims snapshot across chunks', async () => {
    const connection = fakeConnection(105)
    const results = await readRitualBundlesBatched(connection, programId, connection.addresses)
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
    for (const [keys] of connection.getMultipleAccountsInfoAndContext.mock.calls) {
      expect(keys.length).toBeLessThanOrEqual(100)
      expect(new Set(keys.map((key) => key.toBase58())).size).toBe(keys.length)
      for (const ritual of connection.rituals) if (keys.some((key) => key.equals(ritual.eventAddress))) {
        expect(keys.some((key) => key.equals(ritual.address))).toBe(true)
        expect(keys.some((key) => key.equals(claimPda(ritual.eventAddress, ritual.account.creator, CURRENT_CLAIM_VERSION, programId)[0]))).toBe(true)
      }
    }
  })

  it('does no work for an empty list and retains per-ritual missing/decode errors in order', async () => {
    const connection = fakeConnection(3, 'Ended')
    expect(await readRitualBundlesBatched(connection, programId, [])).toEqual([])
    expect(connection.getMultipleAccountsInfoAndContext).not.toHaveBeenCalled()
    connection.accounts.delete(connection.addresses[0].toBase58())
    connection.accounts.set(connection.addresses[1].toBase58(), envelope(new Uint8Array(0)))
    const results = await readRitualBundlesBatched(connection, programId, connection.addresses)
    expect(results[0]).toMatchObject({ status: 'rejected', reason: { category: 'not-found' } })
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { category: 'decode' } })
    expect(results[2]).toMatchObject({ status: 'fulfilled', value: { ritual: { address: connection.addresses[2] } } })
  })

  it('retains the existing lifecycle retry if a week advances between batched snapshots', async () => {
    const connection = fakeConnection(2)
    const first = connection.rituals[0]
    const read = connection.getMultipleAccountsInfoAndContext.getMockImplementation()!
    connection.getMultipleAccountsInfoAndContext.mockImplementation(async (keys, config) => {
      if (connection.getMultipleAccountsInfoAndContext.mock.calls.length === 2) {
        const next = { ...first.account, currentEventIndex: 1, settledEventCount: 1, fundedStakeTotal: first.account.perEventAllocation * 2n }
        connection.accounts.set(first.address.toBase58(), envelope(ritualBytes(next)))
        const [address, bump] = eventPda(first.address, 1, programId)
        connection.accounts.set(address.toBase58(), envelope(eventBytes(soloEvent(1, { ritual: first.address, bump, status: 'Scheduled' }))))
      }
      return read(keys, config)
    })
    const results = await readRitualBundlesBatched(connection, programId, connection.addresses)
    expect(results[0]).toMatchObject({ status: 'fulfilled', value: { ritual: { account: { currentEventIndex: 1 } }, event: { account: { eventIndex: 1 } } } })
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: { ritual: { account: { currentEventIndex: 0 } } } })
    expect(connection.getMultipleAccountsInfoAndContext).toHaveBeenCalledTimes(3)
  })

  it('keeps the existing bounded read retry/backoff under the batch', async () => {
    const connection = fakeConnection(10, 'Ended')
    connection.getMultipleAccountsInfoAndContext.mockRejectedValueOnce(new Error('429'))
    const sleep = vi.fn(async () => undefined)
    const transport = { getMultipleAccountsInfoAndContext: withReadRetry(connection.getMultipleAccountsInfoAndContext, { attempts: 2, sleep }) }
    const results = await readRitualBundlesBatched(transport, programId, connection.addresses)
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
    expect(connection.getMultipleAccountsInfoAndContext).toHaveBeenCalledTimes(2)
    expect(connection.getMultipleAccountsInfoAndContext.mock.calls[1]).toEqual(connection.getMultipleAccountsInfoAndContext.mock.calls[0])
    expect(sleep).toHaveBeenCalledWith(400)
  })

  it('retains stale and RPC errors rather than passing partial or guessed bundles', async () => {
    const connection = fakeConnection(2, 'Ended')
    const stale = await readRitualBundlesBatched(connection, programId, connection.addresses, { minContextSlot: 51 })
    expect(stale.every((result) => result.status === 'rejected' && result.reason.category === 'stale')).toBe(true)
    connection.getMultipleAccountsInfoAndContext.mockRejectedValueOnce(new Error('offline'))
    const failed = await readRitualBundlesBatched(connection, programId, connection.addresses)
    expect(failed.every((result) => result.status === 'rejected' && result.reason.category === 'rpc')).toBe(true)
    connection.getMultipleAccountsInfoAndContext.mockResolvedValueOnce({ context: { slot: 50 }, value: [] })
    const truncated = await readRitualBundlesBatched(connection, programId, connection.addresses)
    expect(truncated.every((result) => result.status === 'rejected' && result.reason.category === 'rpc')).toBe(true)
  })

  it('deduplicates keys and applies the strongest minimum slot without altering request order', async () => {
    const connection = fakeConnection(2, 'Ended')
    const batched = batchRitualReads(connection)
    const [a, b] = connection.addresses
    const results = await Promise.all([
      batched.getMultipleAccountsInfoAndContext([a, b], { commitment: 'confirmed', minContextSlot: 42 }),
      batched.getMultipleAccountsInfoAndContext([b, a, b], { commitment: 'confirmed', minContextSlot: 45 }),
    ])
    expect(connection.getMultipleAccountsInfoAndContext).toHaveBeenCalledExactlyOnceWith([a, b], { commitment: 'confirmed', minContextSlot: 45 })
    expect(results[1].value).toEqual([results[0].value[1], results[0].value[0], results[0].value[1]])
  })
})
