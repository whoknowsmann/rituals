import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeProtocolConfig, decodeRitual } from './accounts'
import { accountVectors, hexToBytes, ACCOUNT_VECTOR_OWNER } from './__fixtures__/accountVectors'
import { claimPda, eventPda, protocolConfigPda, ritualPda } from './pdas'
import { createCurrentRitualsRpcReader, createRitualsRpcReader, RitualRpcError, type EventRead } from './ritualsRpc'

const programId = new PublicKey(ACCOUNT_VECTOR_OWNER)
const config = { owner: programId, data: hexToBytes(accountVectors.protocolConfig.hex), executable: false }
const configView = decodeProtocolConfig(config, programId)
const ritualBytes = hexToBytes(accountVectors.ritual.hex)
const ritualView = decodeRitual({ owner: programId, data: ritualBytes }, programId, configView.allowedStakeMint)
const [ritualAddress] = ritualPda(ritualView.creator, ritualView.nonce, programId)
const [protocolConfigAddress] = protocolConfigPda(programId)
const [eventAddress] = eventPda(ritualAddress, 0, programId)
const [claimAddress] = claimPda(eventAddress, new PublicKey(accountVectors.completionClaim.expected.claimant), 0, programId)
const event = { owner: programId, data: hexToBytes(accountVectors.ritualEvent.hex), executable: false }
const claim = { owner: programId, data: hexToBytes(accountVectors.completionClaim.hex), executable: false }

class FakeConnection {
  calls: Array<{ keys: string[]; config: unknown }> = []
  constructor(private readonly claimData = claim.data, private readonly slots = [42], private readonly sparse: false | 'hole' | 'undefined' = false) {}
  async getMultipleAccountsInfoAndContext(keys: PublicKey[], requestConfig: unknown) {
    this.calls.push({ keys: keys.map(key => key.toBase58()), config: requestConfig })
    const values = keys.map(key => {
      const address = key.toBase58()
      if (address === protocolConfigAddress.toBase58()) return config
      if (address === ritualAddress.toBase58()) return { owner: programId, data: ritualBytes, executable: false }
      if (address === eventAddress.toBase58()) return event
      if (address === claimAddress.toBase58()) return { owner: programId, data: this.claimData, executable: false }
      return null
    })
    const value = this.sparse ? Object.assign([], values, { length: values.length }) as typeof values : values
    if (this.sparse === 'hole') delete (value as unknown as Record<number, unknown>)[0]
    if (this.sparse === 'undefined') (value as unknown as Record<number, unknown>)[0] = undefined
    return { context: { slot: this.slots[Math.min(this.calls.length - 1, this.slots.length - 1)] }, value }
  }
}

const claimAt = (claimedAt: bigint): Uint8Array => {
  const bytes = new Uint8Array(claim.data)
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigInt64(112, claimedAt, true)
  return bytes
}

describe('confirmed read-only Rituals RPC reader', () => {
  it('reads the config, ritual, event, and claim using confirmed snapshots', async () => {
    const connection = new FakeConnection()
    const reader = createRitualsRpcReader(connection, programId)
    const protocol = await reader.getProtocolConfig({ minContextSlot: 40 })
    const ritual = await reader.getRitual(ritualAddress, { minContextSlot: 40 })
    const eventRead = await reader.getEvent(ritual, 0, { minContextSlot: 40 })
    const claimRead = await reader.getClaim(ritual, eventRead, new PublicKey(accountVectors.completionClaim.expected.claimant), { minContextSlot: 40 })
    expect(protocol.address.equals(protocolConfigAddress)).toBe(true)
    expect(ritual.address.equals(ritualAddress)).toBe(true)
    expect(eventRead.address.equals(eventAddress)).toBe(true)
    expect(claimRead.address.equals(claimAddress)).toBe(true)
    expect(connection.calls).toHaveLength(4)
    expect(connection.calls.map(call => call.config)).toEqual([
      { commitment: 'confirmed', minContextSlot: 40 },
      { commitment: 'confirmed', minContextSlot: 40 },
      { commitment: 'confirmed', minContextSlot: 42 },
      { commitment: 'confirmed', minContextSlot: 42 },
    ])
    expect(Object.isFrozen(protocol)).toBe(true)
    expect(Object.isFrozen(ritual)).toBe(true)
    expect(Object.isFrozen(eventRead)).toBe(true)
    expect(Object.isFrozen(claimRead)).toBe(true)
  })

  it('rejects the current not-deployed configuration before touching the transport', () => {
    let called = false
    const connection = { getMultipleAccountsInfoAndContext: async () => { called = true; return { context: { slot: 1 }, value: [] } } }
    expect(() => createCurrentRitualsRpcReader(connection)).toThrowError(RitualRpcError)
    expect(() => createCurrentRitualsRpcReader(connection)).toThrowError(/deployment/)
    expect(called).toBe(false)
  })

  it('does not expose signing or transaction methods', () => {
    const reader = createRitualsRpcReader(new FakeConnection(), programId) as unknown as Record<string, unknown>
    expect(Object.keys(reader).some(key => /sign|send|transaction/i.test(key))).toBe(false)
  })

  it.each([
    ['at opens', 100n, false],
    ['at deadline', 200n, false],
    ['before opens', 99n, true],
    ['after deadline', 201n, true],
  ])('accepts only claim timestamps in the canonical claim window: %s', async (_name, claimedAt, rejects) => {
    const reader = createRitualsRpcReader(new FakeConnection(claimAt(claimedAt)), programId)
    const ritual = await reader.getRitual(ritualAddress)
    const eventRead = await reader.getEvent(ritual, 0)
    const result = reader.getClaim(ritual, eventRead, new PublicKey(accountVectors.completionClaim.expected.claimant))
    if (rejects) await expect(result).rejects.toMatchObject({ category: 'canonical', message: 'Completion claim does not match canonical Ritual, event, member, or window' })
    else await expect(result).resolves.toBeDefined()
  })

  it('carries the confirmed snapshot slot monotonically into event and claim reads', async () => {
    const connection = new FakeConnection(claim.data, [42, 50, 50])
    const reader = createRitualsRpcReader(connection, programId)
    const ritual = await reader.getRitual(ritualAddress)
    const eventRead = await reader.getEvent(ritual, 0)
    await reader.getClaim(ritual, eventRead, new PublicKey(accountVectors.completionClaim.expected.claimant), { minContextSlot: 10 })
    expect(connection.calls.map(call => call.config)).toEqual([
      { commitment: 'confirmed' },
      { commitment: 'confirmed', minContextSlot: 42 },
      { commitment: 'confirmed', minContextSlot: 50 },
    ])
  })

  it('rejects an event snapshot below the ritual snapshot', async () => {
    const connection = new FakeConnection(claim.data, [42, 41])
    const reader = createRitualsRpcReader(connection, programId)
    const ritual = await reader.getRitual(ritualAddress)
    await expect(reader.getEvent(ritual, 0)).rejects.toMatchObject({ category: 'stale', message: 'Rituals RPC context is older than requested' })
  })

  it('rejects a supplied event context below its ritual snapshot', async () => {
    const connection = new FakeConnection()
    const reader = createRitualsRpcReader(connection, programId)
    const ritual = await reader.getRitual(ritualAddress)
    const eventRead = await reader.getEvent(ritual, 0)
    const staleEvent = Object.freeze({ ...eventRead, slot: 41 })
    await expect(reader.getClaim(ritual, staleEvent, new PublicKey(accountVectors.completionClaim.expected.claimant))).rejects.toMatchObject({ category: 'input', message: 'event read context is not produced by this reader' })
  })

  it.each([
    ['member count', (event: EventRead) => Object.freeze({ ...event, account: Object.freeze({ ...event.account, memberCount: event.account.memberCount + 1 }) })],
    ['window', (event: EventRead) => Object.freeze({ ...event, account: Object.freeze({ ...event.account, window: Object.freeze({ ...event.account.window, opens: event.account.window.opens + 1n }) }) })],
    ['bump', (event: EventRead) => Object.freeze({ ...event, account: Object.freeze({ ...event.account, bump: event.account.bump ^ 1 }) })],
    ['event index', (event: EventRead) => Object.freeze({ ...event, account: Object.freeze({ ...event.account, eventIndex: 1 }) })],
    ['account ritual', (event: EventRead) => Object.freeze({ ...event, account: Object.freeze({ ...event.account, ritual: PublicKey.unique() }) })],
    ['wrapper address', (event: EventRead) => Object.freeze({ ...event, address: PublicKey.unique() })],
  ])('rejects a frozen supplied event with a non-canonical %s before fetching a claim', async (_name, forge) => {
    const connection = new FakeConnection()
    const reader = createRitualsRpcReader(connection, programId)
    const ritual = await reader.getRitual(ritualAddress)
    const eventRead = await reader.getEvent(ritual, 0)
    const forgedEvent = forge(eventRead)

    await expect(reader.getClaim(ritual, forgedEvent, new PublicKey(accountVectors.completionClaim.expected.claimant))).rejects.toMatchObject({ category: 'input', message: 'event read context is not produced by this reader' })
    expect(connection.calls).toHaveLength(2)
  })

  it('lets a higher user minimum override every snapshot slot', async () => {
    const connection = new FakeConnection(claim.data, [42, 60, 60])
    const reader = createRitualsRpcReader(connection, programId)
    const ritual = await reader.getRitual(ritualAddress)
    const eventRead = await reader.getEvent(ritual, 0, { minContextSlot: 60 })
    await reader.getClaim(ritual, eventRead, new PublicKey(accountVectors.completionClaim.expected.claimant), { minContextSlot: 60 })
    expect(connection.calls.map(call => call.config)).toEqual([
      { commitment: 'confirmed' },
      { commitment: 'confirmed', minContextSlot: 60 },
      { commitment: 'confirmed', minContextSlot: 60 },
    ])
  })

  it('reads an authoritative same-slot ritual/event/claim bundle in member order', async () => {
    const connection = new FakeConnection()
    const reader = createRitualsRpcReader(connection, programId)
    const bundle = await reader.getRitualBundle(ritualAddress, { minContextSlot: 40 })
    expect(bundle.slot).toBe(42)
    expect(bundle.ritual.slot).toBe(42)
    expect(bundle.event?.slot).toBe(42)
    expect(bundle.claims).toHaveLength(3)
    expect(bundle.claims.map(item => item.memberIndex)).toEqual([0, 1, 2])
    expect(bundle.claims[1].account?.status).toBe('Pending')
    expect(bundle.claims[0].account).toBeNull()
    expect(bundle.claims[2].account).toBeNull()
    expect(Object.isFrozen(bundle)).toBe(true)
    expect(Object.isFrozen(bundle.claims)).toBe(true)
    expect(connection.calls.map(call => call.config)).toEqual([
      { commitment: 'confirmed', minContextSlot: 40 },
      { commitment: 'confirmed', minContextSlot: 42 },
    ])
  })

  it('registers bundle event contexts for subsequent claim reads', async () => {
    const connection = new FakeConnection()
    const reader = createRitualsRpcReader(connection, programId)
    const bundle = await reader.getRitualBundle(ritualAddress)
    if (bundle.event === null) throw new Error('expected event')
    const result = await reader.getClaim(bundle.ritual, bundle.event, new PublicKey(accountVectors.completionClaim.expected.claimant))
    expect(result.account.status).toBe('Pending')
  })

  it('rejects a confirmed RPC response with a sparse account value array', async () => {
    const reader = createRitualsRpcReader(new FakeConnection(claim.data, [42], 'hole'), programId)
    await expect(reader.getProtocolConfig()).rejects.toMatchObject({ category: 'rpc', message: 'Rituals RPC account value is missing' })
  })

  it('rejects an explicit undefined account value before decoding', async () => {
    const reader = createRitualsRpcReader(new FakeConnection(claim.data, [42], 'undefined'), programId)
    await expect(reader.getProtocolConfig()).rejects.toMatchObject({ category: 'rpc', message: 'Rituals RPC account is malformed' })
  })
})
