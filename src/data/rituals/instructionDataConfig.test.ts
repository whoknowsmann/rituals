import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { encodeInitializeProtocolConfigData, encodeUpdateProtocolConfigData, INSTRUCTION_DISCRIMINATORS, RitualInstructionDataError } from './instructionData'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const base = () => ({ allowedStakeMint: key(1), feeRecipient: key(2), feeBasisPoints: 250, minimumFee: 11n, maximumFee: 999n, maximumMemberStake: 1000n })
const expectError = (fn: () => unknown, category: RitualInstructionDataError['category'] = 'input') => {
  try { fn(); throw new Error('expected encoder to throw') } catch (error) {
    expect(error).toBeInstanceOf(RitualInstructionDataError)
    expect((error as RitualInstructionDataError).category).toBe(category)
    expect(String(error)).not.toMatch(/TypeError|undefined|Cannot read|is not a function/)
  }
}

const u64 = (value: bigint) => Array.from({ length: 8 }, (_, i) => Number((value >> BigInt(i * 8)) & 255n))

describe('initialize_protocol_config adversarial input and byte boundaries', () => {
  it.each([
    ['zero (free protocol)', 0], ['minimum bps', 1], ['maximum bps', 10_000],
  ])('accepts %s fee basis points and encodes u16 LE', (_name, bps) => {
    const data = encodeInitializeProtocolConfigData({ ...base(), feeBasisPoints: bps })
    expect(data.slice(72, 74)).toEqual(Uint8Array.from([bps & 255, bps >>> 8]))
  })

  it.each([
    ['negative', -1], ['too high', 10_001], ['fraction', 1.5], ['NaN', NaN], ['infinity', Infinity], ['string', '250'],
  ])('rejects %s bps', (_name, value) => expectError(() => encodeInitializeProtocolConfigData({ ...base(), feeBasisPoints: value } as never)))

  it('accepts a free protocol (0 bps, 0 / 0 bounds) and still rejects a zero maximum member stake', () => {
    const free = encodeInitializeProtocolConfigData({ ...base(), feeBasisPoints: 0, minimumFee: 0n, maximumFee: 0n })
    expect(Array.from(free.slice(72, 90))).toEqual([0, 0, ...u64(0n), ...u64(0n)])
    expectError(() => encodeInitializeProtocolConfigData({ ...base(), maximumMemberStake: 0n }), 'invariant')
  })

  it.each([
    ['zero', 0n], ['maximum', 0xffffffffffffffffn], ['negative', -1n], ['above maximum', 0x10000000000000000n], ['number', 1], ['string', '1'],
  ])('handles minimumFee %s', (_name, value) => {
    if (_name === 'negative' || _name === 'above maximum' || _name === 'number' || _name === 'string') expectError(() => encodeInitializeProtocolConfigData({ ...base(), minimumFee: value } as never), 'overflow')
    else expect(encodeInitializeProtocolConfigData({ ...base(), minimumFee: value, maximumFee: value } as never)).toBeInstanceOf(Uint8Array)
  })

  it('rejects a minimum fee above the maximum', () => expectError(() => encodeInitializeProtocolConfigData({ ...base(), minimumFee: 1000n, maximumFee: 999n }), 'invariant'))

  it.each([
    ['maximumFee', 'maximumFee'], ['maximumMemberStake', 'maximumMemberStake'],
  ])('rejects wrong type for %s', (_label, field) => expectError(() => encodeInitializeProtocolConfigData({ ...base(), [field]: '1' } as never), 'overflow'))

  it.each([
    ['missing object', {}], ['null', null], ['undefined', undefined], ['primitive', 3], ['array', []],
  ])('rejects malformed input %s with a stable error', (_name, value) => expectError(() => encodeInitializeProtocolConfigData(value as never)))

  it.each(['allowedStakeMint', 'feeRecipient'])('rejects missing %s', field => {
    const input = base(); delete (input as Record<string, unknown>)[field]
    expectError(() => encodeInitializeProtocolConfigData(input as never))
  })

  it.each(['allowedStakeMint', 'feeRecipient'])('rejects non-PublicKey %s', field => expectError(() => encodeInitializeProtocolConfigData({ ...base(), [field]: 'not a key' } as never)))

  // Raw instruction encoding mirrors Rust; default-key policy belongs to the later builder.
  it.each([
    ['default allowed stake mint', PublicKey.default, key(2)],
    ['default fee recipient', key(1), PublicKey.default],
    ['both default keys', PublicKey.default, PublicKey.default],
  ])('serializes %s in the raw codec', (_name, allowedStakeMint, feeRecipient) => {
    const data = encodeInitializeProtocolConfigData({ ...base(), allowedStakeMint, feeRecipient })
    expect(data).toHaveLength(98)
    expect(data.slice(8, 40)).toEqual(allowedStakeMint.toBytes())
    expect(data.slice(40, 72)).toEqual(feeRecipient.toBytes())
  })

  it('converts each successful top-level property exactly once', () => {
    const input = base() as Record<string, unknown>
    for (const field of Object.keys(input)) {
      let reads = 0
      const value = input[field]
      Object.defineProperty(input, field, { configurable: true, get: () => { reads++; return value } })
      encodeInitializeProtocolConfigData(input as never)
      expect(reads, field).toBe(1)
    }
  })

  it.each(['allowedStakeMint', 'feeRecipient', 'feeBasisPoints', 'minimumFee', 'maximumFee', 'maximumMemberStake'])('normalizes a throwing %s getter', field => {
    const input = base() as Record<string, unknown>
    Object.defineProperty(input, field, { get: () => { throw new Error('hostile getter') } })
    expectError(() => encodeInitializeProtocolConfigData(input as never))
  })

  it('does not leak a PublicKey toBytes failure', () => {
    const original = PublicKey.prototype.toBytes
    Object.defineProperty(PublicKey.prototype, 'toBytes', { configurable: true, value: () => { throw new Error('hostile') } })
    try { expectError(() => encodeInitializeProtocolConfigData(base())) } finally { Object.defineProperty(PublicKey.prototype, 'toBytes', { configurable: true, value: original }) }
  })

  it('accepts equal positive fee bounds and writes exact u64 little endian fields', () => {
    const value = 0x123456789abcdef0n
    const data = encodeInitializeProtocolConfigData({ ...base(), minimumFee: value, maximumFee: value, maximumMemberStake: 0xffffffffffffffffn })
    expect(Array.from(data.slice(74, 82))).toEqual(u64(value))
    expect(Array.from(data.slice(82, 90))).toEqual(u64(value))
    expect(Array.from(data.slice(90, 98))).toEqual(u64(0xffffffffffffffffn))
    expect(data).toHaveLength(98)
  })

  it('rejects invalid fee ordering and zero bounds', () => {
    expectError(() => encodeInitializeProtocolConfigData({ ...base(), minimumFee: 1000n, maximumFee: 999n }), 'invariant')
    expectError(() => encodeInitializeProtocolConfigData({ ...base(), maximumFee: 0n }), 'invariant')
    expectError(() => encodeInitializeProtocolConfigData({ ...base(), maximumMemberStake: 0n }), 'invariant')
  })

  it('returns independent fresh output arrays', () => {
    const first = encodeInitializeProtocolConfigData(base()); const second = encodeInitializeProtocolConfigData(base())
    expect(first).not.toBe(second); first[0] ^= 255; expect(second[0]).toBe(28)
  })
})

describe('update_protocol_config (authority-only fee change)', () => {
  it('encodes discriminator + u16 bps + u64 min + u64 max, and 0 / 0 / 0 makes the protocol free', () => {
    const data = encodeUpdateProtocolConfigData({ feeBasisPoints: 0, minimumFee: 0n, maximumFee: 0n })
    expect(data).toHaveLength(26)
    expect(Array.from(data)).toEqual([...INSTRUCTION_DISCRIMINATORS.update_protocol_config, 0, 0, ...u64(0n), ...u64(0n)])
    const live = encodeUpdateProtocolConfigData({ feeBasisPoints: 200, minimumFee: 500_000n, maximumFee: 5_000_000n })
    expect(Array.from(live.slice(8))).toEqual([200, 0, ...u64(500_000n), ...u64(5_000_000n)])
  })
  it.each([
    ['negative bps', { feeBasisPoints: -1, minimumFee: 0n, maximumFee: 0n }, 'input'],
    ['bps above 10000', { feeBasisPoints: 10_001, minimumFee: 0n, maximumFee: 0n }, 'input'],
    ['reversed bounds', { feeBasisPoints: 0, minimumFee: 2n, maximumFee: 1n }, 'invariant'],
    ['negative minimum', { feeBasisPoints: 0, minimumFee: -1n, maximumFee: 1n }, 'overflow'],
    ['string maximum', { feeBasisPoints: 0, minimumFee: 0n, maximumFee: '1' }, 'overflow'],
    ['missing fields', {}, 'input'],
    ['null', null, 'input'],
  ] as const)('rejects %s', (_name, input, category) => expectError(() => encodeUpdateProtocolConfigData(input as never), category))
})
