import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeProtocolConfig, decodeRitual } from './accounts'
import { accountVectors, hexToBytes, ACCOUNT_VECTOR_OWNER } from './__fixtures__/accountVectors'
import { claimPda, eventPda, protocolConfigPda, ritualPda, CURRENT_CLAIM_VERSION } from './pdas'
import { createCurrentRitualsRpcReader, createRitualsRpcReader, RitualRpcError, type RitualRpcResponse } from './ritualsRpc'

const programId = new PublicKey(ACCOUNT_VECTOR_OWNER)
const configData = hexToBytes(accountVectors.protocolConfig.hex)
const ritualData = hexToBytes(accountVectors.ritual.hex)
const eventData = hexToBytes(accountVectors.ritualEvent.hex)
const claimData = hexToBytes(accountVectors.completionClaim.hex)
const config = { owner: programId, data: configData, executable: false }
const configView = decodeProtocolConfig(config, programId)
const ritualView = decodeRitual({ owner: programId, data: ritualData }, programId, configView.allowedStakeMint)
const [ritualAddress] = ritualPda(ritualView.creator, ritualView.nonce, programId)
const [configAddress] = protocolConfigPda(programId)
const [eventAddress] = eventPda(ritualAddress, 0, programId)
const claimant = new PublicKey(accountVectors.completionClaim.expected.claimant)
const [claimAddress] = claimPda(eventAddress, claimant, CURRENT_CLAIM_VERSION, programId)

const copy = (bytes: Uint8Array) => new Uint8Array(bytes)
const keyBytes = (key: PublicKey) => key.toBytes()
const putKey = (bytes: Uint8Array, offset: number, key: PublicKey) => bytes.set(keyBytes(key), offset)

type Scenario = { response?: unknown; keys?: PublicKey[]; reject?: unknown; notFoundAt?: 'event' | 'claim'; slot?: number }
class FakeTransport {
  calls: Array<{ keys: PublicKey[]; config: unknown }> = []
  constructor(private readonly scenario: Scenario = {}) {}
  async getMultipleAccountsInfoAndContext(keys: PublicKey[], requestConfig: unknown): Promise<RitualRpcResponse> {
    this.calls.push({ keys, config: requestConfig })
    if (this.scenario.reject !== undefined) throw this.scenario.reject
    if (this.scenario.response !== undefined) return this.scenario.response as RitualRpcResponse
    const values = (this.scenario.keys ?? keys).map(key => {
      if (this.scenario.notFoundAt === 'event' && key.equals(eventAddress)) return null
      if (this.scenario.notFoundAt === 'claim' && key.equals(claimAddress)) return null
      if (key.equals(configAddress)) return { owner: programId, data: copy(configData), executable: false }
      if (key.equals(ritualAddress)) return { owner: programId, data: copy(ritualData), executable: false }
      if (key.equals(eventAddress)) return { owner: programId, data: copy(eventData), executable: false }
      if (key.equals(claimAddress)) return { owner: programId, data: copy(claimData), executable: false }
      return null
    })
    return { context: { slot: this.scenario.slot ?? 100 }, value: values }
  }
}
const reader = (transport: object = new FakeTransport()) => createRitualsRpcReader(transport as never, programId)
const expectError = async (promise: Promise<unknown>, category: string) => expect(promise).rejects.toMatchObject({ category })

// Keep these as separate named cases: each is a distinct hostile boundary input.
describe('Ritual RPC adversarial transport and input matrix', () => {
  it.each([
    ['null', null], ['primitive', 1], ['array', []], ['missing', {}],
    ['nonfunction', { getMultipleAccountsInfoAndContext: 1 }],
    ['getter throws', Object.defineProperty({}, 'getMultipleAccountsInfoAndContext', { get() { throw new Error('transport sentinel') } })],
  ])('rejects %s transport with stable input error', (_name, value) => {
    expect(() => createRitualsRpcReader(value as never, programId)).toThrowError(/read-only RPC transport is invalid/)
    try { createRitualsRpcReader(value as never, programId) } catch (error) { expect(error).toMatchObject({ category: 'input' }); expect(String(error)).not.toContain('sentinel') }
  })
  it.each([
    ['null', null], ['primitive', 3], ['default', PublicKey.default],
    ['wrong type', 'program'], ['toBytes throws', (() => { const key = new PublicKey(new Uint8Array(32).fill(7)); Object.defineProperty(key, 'toBytes', { value() { throw new Error('key sentinel') } }); return key })()],
  ])('rejects %s program id safely', (_name, value) => {
    expect(() => createRitualsRpcReader(new FakeTransport(), value as never)).toThrowError(RitualRpcError)
  })

  it('current factory rejects before touching a hostile proxy', () => {
    const transport = new Proxy({}, { get() { throw new Error('transport touched') } })
    expect(() => createCurrentRitualsRpcReader(transport as never)).toThrowError(/deployment/)
  })
  it.each([
    ['null', null], ['array', []], ['string', 'x'], ['negative', -1], ['fraction', 1.5], ['NaN', NaN], ['infinity', Infinity], ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects %s minContextSlot', async (_name, minContextSlot) => {
    await expectError(reader().getProtocolConfig({ minContextSlot } as never), 'input')
  })
  it.each([
    ['negative', -1], ['sixteen', 16], ['fraction', 1.1], ['NaN', NaN], ['string', '0'],
  ])('rejects %s event index', async (_name, index) => {
    const r = reader(); const ritual = await r.getRitual(ritualAddress)
    await expectError(r.getEvent(ritual, index as never), 'input')
  })
  it.each([
    ['null', null], ['default', PublicKey.default], ['string', 'claimant'],
  ])('rejects %s claimant', async (_name, value) => {
    const r = reader(); const ritual = await r.getRitual(ritualAddress); const event = await r.getEvent(ritual, 0)
    await expectError(r.getClaim(ritual, event, value as never), 'input')
  })

  it('uses exact confirmed request keys and copies them', async () => {
    const transport = new FakeTransport(); const r = reader(transport)
    await r.getRitual(ritualAddress)
    expect(transport.calls[0].keys.map(key => key.toBase58())).toEqual([configAddress.toBase58(), ritualAddress.toBase58()])
    expect(transport.calls[0].config).toEqual({ commitment: 'confirmed' })
    transport.calls[0].keys[0] = PublicKey.default
    expect(r.protocolConfigAddress.equals(configAddress)).toBe(true)
  })
  it('passes only the validated minimum to commitment reads', async () => {
    const transport = new FakeTransport(); const r = reader(transport)
    await r.getProtocolConfig({ minContextSlot: 0 }); expect(transport.calls[0].config).toEqual({ commitment: 'confirmed', minContextSlot: 0 })
  })

  it.each([
    ['null', null], ['primitive', 1], ['array', []], ['missing context', { value: [null] }],
    ['null context', { context: null, value: [null] }], ['array context', { context: [], value: [null] }],
    ['bad slot', { context: { slot: -1 }, value: [null] }], ['fraction slot', { context: { slot: 1.2 }, value: [null] }],
    ['NaN slot', { context: { slot: NaN }, value: [null] }], ['string slot', { context: { slot: '1' }, value: [null] }],
    ['missing value', { context: { slot: 1 } }], ['wrong count', { context: { slot: 1 }, value: [] }],
    ['account primitive', { context: { slot: 1 }, value: [1] }], ['account array', { context: { slot: 1 }, value: [[]] }],
  ])('rejects malformed response: %s', async (_name, response) => {
    await expectError(reader(new FakeTransport({ response })).getProtocolConfig(), 'rpc')
  })
  it.each([
    ['owner missing', { data: configData, executable: false }], ['owner wrong', { owner: 'owner', data: configData, executable: false }],
    ['data missing', { owner: programId, executable: false }], ['data string', { owner: programId, data: 'bytes', executable: false }],
    ['executable missing', { owner: programId, data: configData }], ['executable true', { owner: programId, data: configData, executable: true }],
    ['executable string', { owner: programId, data: configData, executable: 'false' }], ['explicit undefined', undefined],
  ])('rejects malformed account: %s', async (_name, account) => {
    await expectError(reader(new FakeTransport({ response: { context: { slot: 1 }, value: [account] } })).getProtocolConfig(), 'rpc')
  })
  it('reads response getters once and snapshots account fields once', async () => {
    let contextReads = 0; let valueReads = 0; let ownerReads = 0; let dataReads = 0; let executableReads = 0
    const account = {
      get owner() { ownerReads++; return programId }, get data() { dataReads++; return configData }, get executable() { executableReads++; return false },
    }
    const response = { get context() { contextReads++; return { slot: 1 } }, get value() { valueReads++; return [account] } }
    await reader(new FakeTransport({ response })).getProtocolConfig()
    expect({ contextReads, valueReads, ownerReads, dataReads, executableReads }).toEqual({ contextReads: 1, valueReads: 1, ownerReads: 1, dataReads: 1, executableReads: 1 })
  })

  it.each([
    ['rejection', { reject: new Error('rpc sentinel') }], ['null response', { response: null }],
  ])('does not expose transport failure details: %s', async (_name, scenario) => {
    const result = reader(new FakeTransport(scenario as Scenario)).getProtocolConfig()
    await expect(result).rejects.toMatchObject({ category: 'rpc' })
    await expect(result).rejects.not.toThrow(/sentinel/)
  })

  it.each([
    ['short', configData.slice(0, -1)], ['long', new Uint8Array([...configData, 0])],
    ['discriminator', (() => { const b = copy(configData); b[0] ^= 1; return b })()],
    ['schema', (() => { const b = copy(configData); b[8] = 2; return b })()],
  ])('surfaces config decoder failure as safe decode error: %s', async (_name, data) => {
    const response = { context: { slot: 1 }, value: [{ owner: programId, data, executable: false }] }
    const result = reader(new FakeTransport({ response })).getProtocolConfig()
    await expect(result).rejects.toMatchObject({ category: 'decode' })
    await expect(result).rejects.not.toThrow(/sentinel|expected 135/)
  })

  it('returns frozen, detached address values', () => {
    const r = reader(); const a = r.protocolConfigAddress; expect(a).not.toBe(r.protocolConfigAddress); expect(Object.isFrozen(a)).toBe(false)
  })

  it('accepts a real Connection-shaped transport at the type boundary', () => {
    const connectionLike: { getMultipleAccountsInfoAndContext: FakeTransport['getMultipleAccountsInfoAndContext'] } = new FakeTransport()
    const transport: import('./ritualsRpc').RitualRpcTransport = connectionLike
    expect(typeof transport.getMultipleAccountsInfoAndContext).toBe('function')
  })
  it.each([
    ['context getter', { get context() { throw new Error('context sentinel') }, value: [null] }],
    ['value getter', { context: { slot: 1 }, get value() { throw new Error('value sentinel') } }],
    ['slot getter', { context: { get slot() { throw new Error('slot sentinel') } }, value: [null] }],
  ])('converts throwing response getter to safe rpc error: %s', async (_name, response) => {
    const result = reader(new FakeTransport({ response })).getProtocolConfig()
    await expect(result).rejects.toMatchObject({ category: 'rpc', message: 'Rituals RPC response is malformed' })
    await expect(result).rejects.not.toThrow(/sentinel/)
  })
  it.each([
    ['owner getter', { get owner() { throw new Error('owner sentinel') }, data: configData, executable: false }],
    ['data getter', { owner: programId, get data() { throw new Error('data sentinel') }, executable: false }],
    ['executable getter', { owner: programId, data: configData, get executable() { throw new Error('exec sentinel') } }],
    ['owner toBytes', { owner: (() => { const k = new PublicKey(programId.toBytes()); Object.defineProperty(k, 'toBytes', { value() { throw new Error('bytes sentinel') } }); return k })(), data: configData, executable: false }],
  ])('converts throwing account field to safe rpc error: %s', async (_name, account) => {
    const result = reader(new FakeTransport({ response: { context: { slot: 1 }, value: [account] } })).getProtocolConfig()
    await expect(result).rejects.toMatchObject({ category: 'rpc' })
    await expect(result).rejects.not.toThrow(/sentinel/)
  })
  it.each([
    ['config', () => reader(new FakeTransport({ response: { context: { slot: 1 }, value: [null] } })).getProtocolConfig()],
    ['ritual', async () => { const r = reader(new FakeTransport({ response: { context: { slot: 1 }, value: [null, null] } })); return r.getRitual(ritualAddress) }],
    ['event', async () => { const r = reader(new FakeTransport({ notFoundAt: 'event' })); const ritual = await r.getRitual(ritualAddress); return r.getEvent(ritual, 0, { minContextSlot: 100 }) }],
    ['claim', async () => { const r = reader(new FakeTransport({ notFoundAt: 'claim' })); const ritual = await r.getRitual(ritualAddress); const event = await r.getEvent(ritual, 0); return r.getClaim(ritual, event, claimant) }],
  ])('reports not-found without invoking a decoder: %s', async (_name, operation) => {
    if (_name === 'event') {
      const r = reader(new FakeTransport({ notFoundAt: 'event' })); const ritual = await r.getRitual(ritualAddress); await expectError(r.getEvent(ritual, 0), 'not-found')
    } else if (_name === 'claim') {
      const r = reader(new FakeTransport({ notFoundAt: 'claim' })); const ritual = await r.getRitual(ritualAddress); const event = await r.getEvent(ritual, 0); await expectError(r.getClaim(ritual, event, claimant), 'not-found')
    } else await expectError(Promise.resolve(operation()).then(value => value), 'not-found')
  })
  it.each([
    ['zero', 0], ['max safe', Number.MAX_SAFE_INTEGER],
  ])('accepts valid minimum context slot: %s', async (_name, minContextSlot) => {
    const transport = new FakeTransport({ slot: minContextSlot }); await reader(transport).getProtocolConfig({ minContextSlot }); expect(transport.calls[0].config).toEqual({ commitment: 'confirmed', minContextSlot })
  })
  it('detaches account bytes before the transport can mutate them', async () => {
    const bytes = copy(configData)
    const response = { context: { slot: 1 }, value: [{ owner: programId, data: bytes, executable: false }] }
    const result = await reader(new FakeTransport({ response })).getProtocolConfig(); bytes[8] = 99
    expect(result.account.schemaVersion).toBe(1)
  })
  it.each([
    ['null ritual', null], ['array ritual', []], ['unfrozen ritual', { slot: 100 }],
    ['wrong ritual config', Object.freeze({ slot: 100, address: ritualAddress, protocolConfigAddress: PublicKey.default, protocolConfig: configView, account: ritualView })],
    ['wrong ritual address', Object.freeze({ slot: 100, address: PublicKey.default, protocolConfigAddress: configAddress, protocolConfig: configView, account: ritualView })],
  ])('rejects unsafe supplied ritual context: %s', async (_name, supplied) => {
    const r = reader()
    await expectError(r.getEvent(supplied as never, 0), ['wrong ritual config', 'wrong ritual address'].includes(_name) ? 'canonical' : 'input')
  })
})

// Canonical mutations are made on valid serialized allocations, so decoder success
// is distinct from the RPC reader's cross-account binding checks.
describe('Ritual RPC canonical bindings', () => {
  const canonical = async (eventBytes = eventData, claimBytes = claimData) => {
    const transport = new FakeTransport({ response: { context: { slot: 100 }, value: [{ owner: programId, data: copy(ritualData), executable: false }] } })
    const r = reader(new class extends FakeTransport {
      async getMultipleAccountsInfoAndContext(keys: PublicKey[], cfg: unknown): Promise<RitualRpcResponse> {
        this.calls.push({ keys, config: cfg })
        const values = keys.map(key => key.equals(configAddress) ? config : key.equals(ritualAddress) ? { owner: programId, data: ritualData, executable: false } : key.equals(eventAddress) ? { owner: programId, data: eventBytes, executable: false } : { owner: programId, data: claimBytes, executable: false })
        return { context: { slot: 100 }, value: values }
      }
    }())
    return { r, ritual: await r.getRitual(ritualAddress), eventBytes, claimBytes }
  }
  it.each([
    ['event ritual', (b: Uint8Array) => { putKey(b, 9, new PublicKey(new Uint8Array(32).fill(8))) }],
    ['event index', (b: Uint8Array) => { b[41] = 1 }],
    ['event window', (b: Uint8Array) => { b[42] = 101 }],
    ['event member count', (b: Uint8Array) => { b[66] = 2 }],
    ['event bump', (b: Uint8Array) => { b[138] ^= 1 }],
  ])('rejects locally decodable event mutation: %s', async (_name, mutate) => {
    const b = copy(eventData); mutate(b); const { r, ritual } = await canonical(b); await expectError(r.getEvent(ritual, 0), 'canonical')
  })
  it.each([
    ['claim ritual', (b: Uint8Array) => { putKey(b, 9, new PublicKey(new Uint8Array(32).fill(8))) }],
    ['claim event', (b: Uint8Array) => { putKey(b, 41, new PublicKey(new Uint8Array(32).fill(8))) }],
    ['claim member index', (b: Uint8Array) => { b[106] = 2 }],
    ['claim bump', (b: Uint8Array) => { b[120] ^= 1 }],
    ['claim timestamp', (b: Uint8Array) => { new DataView(b.buffer).setBigInt64(112, 99n, true) }],
    ['claim timestamp after window', (b: Uint8Array) => { new DataView(b.buffer).setBigInt64(112, 201n, true) }],
  ])('rejects locally decodable claim mutation: %s', async (_name, mutate) => {
    const b = copy(claimData); mutate(b); const { r, ritual } = await canonical(eventData, b); const event = await r.getEvent(ritual, 0)
    await expectError(r.getClaim(ritual, event, claimant), 'canonical')
  })
})
