import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { encodeCreateRitualData, RitualInstructionDataError, INSTRUCTION_DISCRIMINATORS } from './instructionData'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const digest = '1f'.repeat(32)
const base = () => ({ nonce: 7n, ruleDigest: digest as never, members: [key(1), key(2), key(3)], memberTotalStake: 300n, schedule: [{ opens: 100n, deadline: 200n, resolution: 300n }, { opens: 400n, deadline: 500n, resolution: 600n }], additionalConfirmationThreshold: 2, feePayerMode: 'HOST' as const })
const expectError = (fn: () => unknown, category?: RitualInstructionDataError['category']) => {
  try { fn(); throw new Error('expected throw') } catch (error) {
    expect(error).toBeInstanceOf(RitualInstructionDataError)
    if (category) expect((error as RitualInstructionDataError).category).toBe(category)
    expect(String(error)).not.toMatch(/TypeError|Cannot read|is not a function|undefined/)
  }
}
const le = (v: bigint, bytes: number) => Array.from({ length: bytes }, (_, i) => Number((v >> BigInt(i * 8)) & 255n))

describe('create_ritual adversarial input and byte boundaries', () => {
  it('matches discriminator, nonce/digest, vector layout, LE fields, and enum bytes', () => {
    const data = encodeCreateRitualData(base())
    expect(Array.from(data.slice(0, 8))).toEqual(INSTRUCTION_DISCRIMINATORS.create_ritual)
    expect(Array.from(data.slice(8, 16))).toEqual(le(7n, 8))
    expect(Array.from(data.slice(16, 48))).toEqual(new Array(32).fill(0x1f))
    expect(Array.from(data.slice(48, 52))).toEqual([3, 0, 0, 0])
    expect(Array.from(data.slice(52, 84))).toEqual(Array.from(key(1).toBytes()))
    expect(Array.from(data.slice(148, 156))).toEqual(le(300n, 8))
    expect(Array.from(data.slice(156, 160))).toEqual([2, 0, 0, 0])
    expect(data[208]).toBe(2); expect(data[209]).toBe(0)
    expect(encodeCreateRitualData({ ...base(), feePayerMode: 'SPLIT' }).at(-1)).toBe(1)
  })

  it('distinguishes plausible wrong argument order and big endian bytes', () => {
    const data = encodeCreateRitualData(base())
    expect(Array.from(data.slice(8, 16))).not.toEqual(le(0x0700000000000000n, 8))
    expect(Array.from(data.slice(8, 16))).toEqual([7, 0, 0, 0, 0, 0, 0, 0])
    expect(Array.from(data.slice(148, 156))).not.toEqual([0, 0, 0, 0, 0, 0, 1, 44])
  })

  it.each([['zero', 0n], ['max', 0xffffffffffffffffn]])('accepts nonce %s', (_name, nonce) => expect(encodeCreateRitualData({ ...base(), nonce })).toBeInstanceOf(Uint8Array))
  it.each([['negative', -1n], ['above u64', 0x10000000000000000n], ['number', 1], ['string', '1']])('rejects nonce %s', (_name, nonce) => expectError(() => encodeCreateRitualData({ ...base(), nonce } as never), 'overflow'))

  it.each([['short', '1f'.repeat(31)], ['long', '1f'.repeat(33)], ['uppercase', '1F'.repeat(32)], ['nonhex', 'gg'.repeat(32)], ['zero', '00'.repeat(32)], ['nonstring', 1]])('rejects %s digest', (_name, ruleDigest) => expectError(() => encodeCreateRitualData({ ...base(), ruleDigest } as never)))
  it.each([['first', '00' + '1f'.repeat(31)], ['last', '1f'.repeat(31) + '00']])('preserves digest %s byte exactly', (_name, ruleDigest) => expect(encodeCreateRitualData({ ...base(), ruleDigest: ruleDigest as never }).slice(16, 48)).toEqual(Uint8Array.from(Buffer.from(ruleDigest, 'hex'))))

  it.each([['not array', {}], ['sparse', Object.assign([], { length: 3 })], ['one', [key(1)]], ['seven', [key(1), key(2), key(3), key(4), key(5), key(6), key(7)]], ['duplicate', [key(1), key(1), key(2)]], ['default', [key(1), PublicKey.default, key(2)]], ['wrong type', [key(1), 'bad', key(2)]]])('rejects malformed members: %s', (_name, members) => expectError(() => encodeCreateRitualData({ ...base(), members } as never)))
  it.each([2, 6])('accepts exactly %s distinct members', count => expect(encodeCreateRitualData({ ...base(), members: Array.from({ length: count }, (_, i) => key(i + 1)), additionalConfirmationThreshold: count - 1 })).toBeInstanceOf(Uint8Array))

  it('reads each top-level property once and member keys once on success', () => {
    const input = base() as Record<string, unknown>; const reads: Record<string, number> = {}
    for (const field of Object.keys(input)) { const value = input[field]; reads[field] = 0; Object.defineProperty(input, field, { configurable: true, get: () => { reads[field]++; return value } }) }
    encodeCreateRitualData(input as never)
    for (const field of Object.keys(input)) expect(reads[field], field).toBe(1)
  })

  it.each(['nonce', 'ruleDigest', 'members', 'memberTotalStake', 'schedule', 'additionalConfirmationThreshold', 'feePayerMode'])('normalizes throwing top-level getter %s', field => {
    const input = base() as Record<string, unknown>; Object.defineProperty(input, field, { get: () => { throw new Error('hostile') } }); expectError(() => encodeCreateRitualData(input as never))
  })

  it.each([['negative', -1n], ['zero', 0n], ['above u64', 0x10000000000000000n], ['number', 1], ['string', '1']])('rejects member stake %s', (_name, memberTotalStake) => expectError(() => encodeCreateRitualData({ ...base(), memberTotalStake } as never), _name === 'zero' ? 'invariant' : 'overflow'))
  it('accepts the largest valid N2 stake divisible by event count', () => expect(encodeCreateRitualData({ ...base(), members: [key(1), key(2)], memberTotalStake: 0x7ffffffffffffffen, additionalConfirmationThreshold: 0 })).toBeInstanceOf(Uint8Array))

  it.each([['not array', {}], ['sparse', Object.assign([], { length: 2 })], ['zero', []], ['seventeen', Array(17)]])('rejects schedule %s', (_name, schedule) => expectError(() => encodeCreateRitualData({ ...base(), schedule } as never)))
  it('accepts a strict valid sixteen-window schedule with divisible stake', () => {
    const schedule = Array.from({ length: 16 }, (_, i) => ({ opens: BigInt(i * 3), deadline: BigInt(i * 3 + 1), resolution: BigInt(i * 3 + 2) }))
    expect(encodeCreateRitualData({ ...base(), schedule, memberTotalStake: 160n })).toBeInstanceOf(Uint8Array)
  })
  it.each([['opens negative', { opens: -1n, deadline: 2n, resolution: 3n }], ['deadline equal opens', { opens: 1n, deadline: 1n, resolution: 3n }], ['resolution equal deadline', { opens: 1n, deadline: 2n, resolution: 2n }], ['overlap', [{ opens: 1n, deadline: 2n, resolution: 4n }, { opens: 4n, deadline: 5n, resolution: 6n }]], ['wrong type', { opens: 1, deadline: 2n, resolution: 3n }], ['missing', { opens: 1n, deadline: 2n }]])('rejects malformed window: %s', (_name, window) => expectError(() => encodeCreateRitualData({ ...base(), schedule: Array.isArray(window) ? window : [window] } as never)))
  it('accepts adjacent windows only when next opens is after prior resolution', () => {
    expectError(() => encodeCreateRitualData({ ...base(), schedule: [{ opens: 1n, deadline: 2n, resolution: 3n }, { opens: 3n, deadline: 4n, resolution: 5n }] }))
    expect(encodeCreateRitualData({ ...base(), schedule: [{ opens: 1n, deadline: 2n, resolution: 3n }, { opens: 4n, deadline: 5n, resolution: 6n }] })).toBeInstanceOf(Uint8Array)
  })
  it.each(['opens', 'deadline', 'resolution'])('normalizes throwing window getter %s', field => {
    const window = { opens: 1n, deadline: 2n, resolution: 3n } as Record<string, unknown>; Object.defineProperty(window, field, { get: () => { throw new Error('hostile') } }); expectError(() => encodeCreateRitualData({ ...base(), schedule: [window] } as never))
  })

  it.each([['negative', -1], ['zero', 0], ['N-1', 2], ['N', 3], ['fraction', 1.5], ['NaN', NaN], ['string', '2']])('handles threshold %s', (_name, additionalConfirmationThreshold) => {
    const input = { ...base(), additionalConfirmationThreshold } as never
    if (_name === 'zero' || _name === 'N-1') expect(encodeCreateRitualData(input)).toBeInstanceOf(Uint8Array)
    else expectError(() => encodeCreateRitualData(input))
  })
  it.each(['HOST', 'SPLIT'])('accepts fee mode %s', feePayerMode => expect(encodeCreateRitualData({ ...base(), feePayerMode: feePayerMode as never })).toBeInstanceOf(Uint8Array))
  it.each(['Host', 'Split', 'host', 'other', 1, null])('rejects fee mode %s', feePayerMode => expectError(() => encodeCreateRitualData({ ...base(), feePayerMode } as never)))

  it('copies member keys before callers can mutate their input array', () => {
    const members = [key(1), key(2), key(3)]; const data = encodeCreateRitualData({ ...base(), members }); members[0] = key(9); expect(data.slice(52, 84)).toEqual(Uint8Array.from(key(1).toBytes()))
  })
  it('returns fresh independent outputs', () => { const a = encodeCreateRitualData(base()); const b = encodeCreateRitualData(base()); expect(a).not.toBe(b); a[0] ^= 255; expect(a).not.toEqual(b) })
})
