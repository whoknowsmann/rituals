import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import {
  ACCOUNT_DATA_LENGTHS,
  ACCOUNT_DISCRIMINATORS,
  RitualAccountDecodeError,
  decodeProtocolConfig,
} from './accounts'
import { ACCOUNT_VECTOR_OWNER, accountVectors, hexToBytes } from './__fixtures__/accountVectors'

export const PROTOCOL_CONFIG_OFFSETS = Object.freeze({
  discriminator: 0,
  schemaVersion: 8,
  authority: 9,
  allowedStakeMint: 41,
  feeRecipient: 73,
  feeBasisPoints: 105,
  minimumFee: 107,
  maximumFee: 115,
  maximumMemberStake: 123,
  maxMembers: 131,
  maxEvents: 132,
  paused: 133,
  bump: 134,
})

const programId = new PublicKey(ACCOUNT_VECTOR_OWNER)
const key = (value: number) => new PublicKey(new Uint8Array(32).fill(value))
const validBytes = () => hexToBytes(accountVectors.protocolConfig.hex)
const validEnvelope = (data = validBytes()): { owner: PublicKey; data: Uint8Array } => ({ owner: programId, data })
const decode = (data = validBytes()) => decodeProtocolConfig(validEnvelope(data), programId)

function expectCategory(action: () => unknown, category: string): void {
  try { action(); throw new Error('expected decoder to reject') } catch (error) {
    expect(error).toBeInstanceOf(RitualAccountDecodeError)
    expect((error as RitualAccountDecodeError).category).toBe(category)
  }
}
function writeU16(bytes: Uint8Array, offset: number, value: number): void {
  expect(bytes[offset]).toBeDefined(); expect(bytes[offset + 1]).toBeDefined()
  bytes[offset] = value & 0xff; bytes[offset + 1] = value >>> 8
}
function writeU64(bytes: Uint8Array, offset: number, value: bigint): void {
  for (let index = 0; index < 8; index += 1) { expect(bytes[offset + index]).toBeDefined(); bytes[offset + index] = Number((value >> BigInt(index * 8)) & 0xffn) }
}
function writeKey(bytes: Uint8Array, offset: number, value: PublicKey): void {
  const keyBytes = value.toBytes(); expect(bytes.slice(offset, offset + 32)).toHaveLength(32); bytes.set(keyBytes, offset)
}

// These cases were RED against the pre-hardening decoder: appended zero bytes were accepted,
// and hostile accessors leaked their sentinel/TypeError instead of the stable decode error.
describe('ProtocolConfig framing and envelope mutation matrix', () => {
  it('rejects any allocation length other than the exact Rust allocation', () => {
    expect(ACCOUNT_DATA_LENGTHS.ProtocolConfig).toBe(135)
    expectCategory(() => decode(new Uint8Array([...validBytes(), 0])), 'size')
    expectCategory(() => decode(validBytes().slice(0, -1)), 'size')
  })

  it('fails closed for malformed envelopes without leaking raw errors', () => {
    for (const input of [null, undefined, 1, 'account', true, [], [validEnvelope()]]) expectCategory(() => decodeProtocolConfig(input, programId), 'input')
    expectCategory(() => decodeProtocolConfig({}, programId), 'owner')
    expectCategory(() => decodeProtocolConfig({ owner: key(8), data: validBytes() }, programId), 'owner')
    expectCategory(() => decodeProtocolConfig({ owner: programId, data: new Uint8Array(validBytes()).buffer }, programId), 'input')
    expectCategory(() => decodeProtocolConfig(validEnvelope(), key(8) as unknown as PublicKey), 'owner')
    expectCategory(() => decodeProtocolConfig(validEnvelope(), undefined as unknown as PublicKey), 'input')
    const ownerGetter = { get owner(): never { throw new Error('owner sentinel') }, data: validBytes() }
    const dataGetter = { owner: programId, get data(): never { throw new TypeError('data sentinel') } }
    expectCategory(() => decodeProtocolConfig(ownerGetter, programId), 'owner')
    expectCategory(() => decodeProtocolConfig(dataGetter, programId), 'input')
    const hostile = new Proxy({}, { ownKeys: () => { throw new Error('own sentinel') }, get: () => { throw new Error('get sentinel') } })
    expectCategory(() => decodeProtocolConfig(hostile, programId), 'owner')
  })

  it('reads owner and data exactly once before parsing', () => {
    let ownerReads = 0; let dataReads = 0
    const input = { get owner() { ownerReads += 1; return programId }, get data() { dataReads += 1; return validBytes() } }
    decodeProtocolConfig(input, programId)
    expect(ownerReads).toBe(1); expect(dataReads).toBe(1)
  })

  it('rejects each discriminator byte mutation with the discriminator category', () => {
    for (const offset of Object.keys(ACCOUNT_DISCRIMINATORS.ProtocolConfig).map(Number)) {
      const bytes = validBytes(); bytes[offset] ^= 0xff
      expectCategory(() => decode(bytes), 'discriminator')
    }
  })

  it.each([
    ['schema 0', PROTOCOL_CONFIG_OFFSETS.schemaVersion, 0, 'schema'],
    ['schema 2', PROTOCOL_CONFIG_OFFSETS.schemaVersion, 2, 'schema'],
    ['paused 0', PROTOCOL_CONFIG_OFFSETS.paused, 0, undefined],
    ['paused 1', PROTOCOL_CONFIG_OFFSETS.paused, 1, undefined],
    ['invalid bool 2', PROTOCOL_CONFIG_OFFSETS.paused, 2, 'invalid-bool'],
    ['invalid bool 255', PROTOCOL_CONFIG_OFFSETS.paused, 255, 'invalid-bool'],
    ['max members 5', PROTOCOL_CONFIG_OFFSETS.maxMembers, 5, 'invariant'],
    ['max members 7', PROTOCOL_CONFIG_OFFSETS.maxMembers, 7, 'invariant'],
    ['max events 15', PROTOCOL_CONFIG_OFFSETS.maxEvents, 15, 'invariant'],
    ['max events 17', PROTOCOL_CONFIG_OFFSETS.maxEvents, 17, 'invariant'],
    ['maximum stake zero', PROTOCOL_CONFIG_OFFSETS.maximumMemberStake, 0n, 'invariant'],
    ['minimum above maximum', PROTOCOL_CONFIG_OFFSETS.minimumFee, 1000n, 'invariant'],
  ])('%s has the stable category', (_label, offset, value, category) => {
    const bytes = validBytes()
    if (typeof value === 'bigint') writeU64(bytes, offset, value)
    else bytes[offset] = value
    if (category) expectCategory(() => decode(bytes), category)
    else expect(decode(bytes).paused).toBe(bytes[offset] === 1)
  })

  it('covers fee boundaries and all three default public keys', () => {
    for (const basisPoints of [0, 10000]) { const bytes = validBytes(); writeU16(bytes, PROTOCOL_CONFIG_OFFSETS.feeBasisPoints, basisPoints); expect(decode(bytes).feeBasisPoints).toBe(basisPoints) }
    const tooHigh = validBytes(); writeU16(tooHigh, PROTOCOL_CONFIG_OFFSETS.feeBasisPoints, 10001); expectCategory(() => decode(tooHigh), 'invariant')
    const maxU16 = validBytes(); writeU16(maxU16, PROTOCOL_CONFIG_OFFSETS.feeBasisPoints, 0xffff); expectCategory(() => decode(maxU16), 'invariant')
    const equal = validBytes(); writeU64(equal, PROTOCOL_CONFIG_OFFSETS.minimumFee, 999n); expect(decode(equal).minimumFee).toBe(999n)
    const minStake = validBytes(); writeU64(minStake, PROTOCOL_CONFIG_OFFSETS.maximumMemberStake, 1n); expect(decode(minStake).maximumMemberStake).toBe(1n)
    const maxStake = validBytes(); writeU64(maxStake, PROTOCOL_CONFIG_OFFSETS.maximumMemberStake, 0xffffffffffffffffn); expect(decode(maxStake).maximumMemberStake).toBe(0xffffffffffffffffn)
    for (const offset of [PROTOCOL_CONFIG_OFFSETS.authority, PROTOCOL_CONFIG_OFFSETS.allowedStakeMint, PROTOCOL_CONFIG_OFFSETS.feeRecipient]) { const bytes = validBytes(); writeKey(bytes, offset, PublicKey.default); expectCategory(() => decode(bytes), 'unusable') }
  })

  it('does not reject arbitrary structural bump bytes and returns immutable independent output', () => {
    const bytes = validBytes(); bytes[PROTOCOL_CONFIG_OFFSETS.bump] = 0
    const output = decode(bytes); const second = decode()
    expect(output.bump).toBe(0); expect(Object.isFrozen(output)).toBe(true); expect(output).not.toBe(second)
  })
})
