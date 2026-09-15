import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeProtocolConfig, decodeRitual } from './accounts'
import { accountVectors, hexToBytes, ACCOUNT_VECTOR_OWNER } from './__fixtures__/accountVectors'
import { claimPda, eventPda, protocolConfigPda, ritualPda, CURRENT_CLAIM_VERSION } from './pdas'
import { createRitualsRpcReader, type RitualRpcResponse } from './ritualsRpc'

const pid = new PublicKey(ACCOUNT_VECTOR_OWNER)
const env = (data: Uint8Array) => ({ owner: pid, data, executable: false })
const copy = (data: Uint8Array) => new Uint8Array(data)
const cfg = hexToBytes(accountVectors.protocolConfig.hex)
const base = hexToBytes(accountVectors.ritual.hex)
const event0 = hexToBytes(accountVectors.ritualEvent.hex)
const claim0 = hexToBytes(accountVectors.completionClaim.hex)
const configView = decodeProtocolConfig(env(cfg), pid)
const ritualView = decodeRitual(env(base), pid, configView.allowedStakeMint)
const [ritual] = ritualPda(ritualView.creator, ritualView.nonce, pid)
const config = protocolConfigPda(pid)[0]
const members = ritualView.members
const put = (b: Uint8Array, o: number, v: number) => { b[o] = v }
const i64 = (b: Uint8Array, o: number, v: bigint) => new DataView(b.buffer).setBigInt64(o, v, true)
const key = (b: Uint8Array, o: number, k: PublicKey) => b.set(k.toBytes(), o)
const ritualState = (status: 0 | 1 | 2 | 3, current = 0) => { const b = copy(base); put(b, 440, status); put(b, 441, current); put(b, 442, current); if (status === 0) { put(b, 422, 0); put(b, 423, 0); i64(b, 424, 0n); i64(b, 432, 0n); i64(b, 451, 0n); i64(b, 459, 0n); i64(b, 467, 0n); put(b, 475, 0) } if (status === 1 && current === 1) i64(b, 424, 300n); if (status === 2) { put(b, 441, 2); put(b, 442, 2); i64(b, 424, 0n); i64(b, 451, 20n); i64(b, 459, 700n); i64(b, 467, 601n) } return b }
const terminalEvent = (voided = false) => { const b = copy(event0); put(b, 41, 0); put(b, 67, voided ? 4 : 3); put(b, 68, voided ? 0 : 7); put(b, 69, voided ? 0 : 7); put(b, 70, 0); i64(b, 79, 601n); put(b, 87, 1); put(b, 88, voided ? 1 : 0); new DataView(b.buffer).setBigUint64(89, 300n, true); new DataView(b.buffer).setBigUint64(105, voided ? 0n : 300n, true); new DataView(b.buffer).setBigUint64(113, voided ? 300n : 0n, true); put(b, 121, voided ? 0 : 3); put(b, 138, eventPda(ritual, 0, pid)[1]); return b }
const pendingEvent = () => { const b = copy(event0); put(b, 67, 1); put(b, 68, 0); put(b, 69, 0); put(b, 70, 0); return b }
const claim = (eventIndex = 0) => { const b = copy(claim0); const [ea] = eventPda(ritual, eventIndex, pid); key(b, 41, ea); put(b, 73, eventIndex); key(b, 74, members[0]); put(b, 106, 0); put(b, 108, 0); put(b, 110, 1); put(b, 111, 1); i64(b, 112, 150n); put(b, 120, claimPda(ea, members[0], CURRENT_CLAIM_VERSION, pid)[1]); return b }
const confirmedClaim = (index: number, approvals: number) => { const b = copy(claim0); const [ea] = eventPda(ritual, 0, pid); key(b, 41, ea); put(b, 73, 0); key(b, 74, members[index]); put(b, 106, index); put(b, 108, 1); put(b, 110, approvals); put(b, 111, 2); i64(b, 112, 150n); put(b, 120, claimPda(ea, members[index], CURRENT_CLAIM_VERSION, pid)[1]); return b }

type Snapshot = { ritual: Uint8Array; event: Uint8Array | null; claims: (Uint8Array | null)[]; slot?: number }
class Transport {
  calls: Array<{ keys: PublicKey[]; minContextSlot?: number }> = []
  constructor(private readonly snapshot: Snapshot) {}
  async getMultipleAccountsInfoAndContext(keys: PublicKey[], options: { minContextSlot?: number }): Promise<RitualRpcResponse> {
    this.calls.push({ keys, minContextSlot: options.minContextSlot })
    const eventAddresses = [eventPda(ritual, 0, pid)[0], eventPda(ritual, 1, pid)[0]]
    const eventPosition = keys.findIndex(k => eventAddresses.some(e => k.equals(e)))
    const values = keys.map(k => k.equals(config) ? env(copy(cfg)) : k.equals(ritual) ? env(copy(this.snapshot.ritual)) : eventPosition >= 0 && k.equals(eventAddresses[0]) ? (this.snapshot.event ? env(copy(this.snapshot.event)) : null) : eventPosition >= 0 && k.equals(eventAddresses[1]) ? (this.snapshot.event ? env(copy(this.snapshot.event)) : null) : null)
    if (eventPosition >= 0) for (let i = 0; i < this.snapshot.claims.length; i += 1) values[eventPosition + 1 + i] = this.snapshot.claims[i] ? env(copy(this.snapshot.claims[i]!)) : null
    return { context: { slot: this.snapshot.slot ?? 80 }, value: values }
  }
}
const reader = (snapshot: Snapshot) => { const transport = new Transport(snapshot); return { reader: createRitualsRpcReader(transport, pid), transport } }
const reject = (promise: Promise<unknown>, category: string) => expect(promise).rejects.toMatchObject({ category })

describe('indexed Ritual event bundles', () => {
  it('reads the requested current event at one same-slot request with ordered detached claims', async () => {
    const x = reader({ ritual: base, event: pendingEvent(), claims: [null, null, null] })
    const result = await x.reader.getEventBundle(ritual, 0, { minContextSlot: 80 })
    expect(x.transport.calls).toHaveLength(2)
    expect(x.transport.calls[1].keys.slice(0, 3)).toEqual([config, ritual, eventPda(ritual, 0, pid)[0]])
    expect(x.transport.calls[1].minContextSlot).toBe(80)
    expect(result.claims.map(c => c.memberIndex)).toEqual([0, 1, 2])
    expect(result.claims[0].account).toBeNull()
    expect(Object.isFrozen(result) && Object.isFrozen(result.claims) && Object.isFrozen(result.claims[0])).toBe(true)

  })
  it.each([false, true])('reads terminal historical event without moving to current (%s)', async (voided) => {
    const x = reader({ ritual: ritualState(1, 1), event: terminalEvent(voided), claims: voided ? [null, null, null] : [confirmedClaim(0, 6), confirmedClaim(1, 5), confirmedClaim(2, 3)] })
    const result = await x.reader.getEventBundle(ritual, 0)
    expect(result.event?.account.status).toBe(voided ? 'Voided' : 'Settled')
    expect(x.transport.calls[1].keys[2].equals(eventPda(ritual, 0, pid)[0])).toBe(true)
    expect(x.transport.calls).toHaveLength(2)
  })
  it('rejects future, out-of-schedule, missing, and nonterminal historical events', async () => {
    await reject(reader({ ritual: base, event: pendingEvent(), claims: [null, null, null] }).reader.getEventBundle(ritual, 1), 'canonical')
    await reject(reader({ ritual: base, event: pendingEvent(), claims: [null, null, null] }).reader.getEventBundle(ritual, 16), 'input')
    await reject(reader({ ritual: base, event: null, claims: [] }).reader.getEventBundle(ritual, 0), 'not-found')
    await reject(reader({ ritual: ritualState(1, 1), event: pendingEvent(), claims: [null, null, null] }).reader.getEventBundle(ritual, 0), 'canonical')
  })
  it('rejects lifecycle and bitmap drift while preserving explicit index', async () => {
    await reject(reader({ ritual: ritualState(0), event: null, claims: [] }).reader.getEventBundle(ritual, 0), 'canonical')
    const bad = pendingEvent(); put(bad, 68, 1)
    await reject(reader({ ritual: base, event: bad, claims: [null, null, null] }).reader.getEventBundle(ritual, 0), 'canonical')
  })
})
