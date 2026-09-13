import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PublicKey } from '@solana/web3.js'
import { RITUAL_INSTRUCTION_RUST_VECTORS as V } from './instructionData.fixture'
import {
  encodeInitializeProtocolConfigData,
  encodeCreateRitualData,
  encodeFundMemberData,
  encodeActivateRitualData,
  encodeCancelUnactivatedData,
  encodeInitializeCurrentEventData,
  encodeClaimCompletionData,
  encodeApproveClaimData,
  encodeQuestionClaimData,
  encodeFinalizeEventData,
  encodeCloseTerminalVaultsData,
  RitualInstructionDataError,
  INSTRUCTION_DISCRIMINATORS,
} from './instructionData'
import { CURRENT_CLAIM_VERSION } from './pdas'

describe('Ritual instruction data encoders', () => {
  it('encodes empty instructions as fresh discriminators', () => {
    const first = encodeFundMemberData()
    const second = encodeFundMemberData()
    expect(first).toHaveLength(8)
    expect(second).not.toBe(first)
    first[0] ^= 0xff
    expect(second[0]).not.toBe(first[0])
    expect(encodeActivateRitualData()).toHaveLength(8)
    expect(encodeCancelUnactivatedData()).toHaveLength(8)
    expect(encodeCloseTerminalVaultsData()).toHaveLength(8)
  })

  it('keeps discriminator constants deeply immutable and independent of encoder output', () => {
    expect(Object.isFrozen(INSTRUCTION_DISCRIMINATORS)).toBe(true)
    for (const discriminator of Object.values(INSTRUCTION_DISCRIMINATORS)) {
      expect(Object.isFrozen(discriminator)).toBe(true)
      expect(Reflect.set(discriminator, 0, 0)).toBe(false)
    }
    const before = encodeFundMemberData()
    expect(Reflect.set(INSTRUCTION_DISCRIMINATORS, 'fund_member', [0, 0, 0, 0, 0, 0, 0, 0])).toBe(false)
    expect(encodeFundMemberData()).toEqual(before)
  })

  it('rejects group stake pool overflow rather than only per-event overflow', () => {
    const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
    expect(() => encodeCreateRitualData({ nonce: 1n, ruleDigest: ('1f'.repeat(32)) as never, members: [key(1), key(2)], memberTotalStake: 0x8000000000000000n, schedule: [{ opens: 1n, deadline: 2n, resolution: 3n }, { opens: 4n, deadline: 5n, resolution: 6n }], additionalConfirmationThreshold: 0, feePayerMode: 'HOST' })).toThrowError(/overflow: group stake pool exceeds u64/)
    expect(() => encodeCreateRitualData({ nonce: 1n, ruleDigest: ('1f'.repeat(32)) as never, members: [key(1), key(2)], memberTotalStake: 0x7ffffffffffffffen, schedule: [{ opens: 1n, deadline: 2n, resolution: 3n }], additionalConfirmationThreshold: 0, feePayerMode: 'HOST' })).not.toThrow()
  })

  it('uses the shared current claim version and writes large i64 values in little endian', () => {
    const data = encodeClaimCompletionData(3)
    expect(data[9]).toBe(CURRENT_CLAIM_VERSION)
    const value = 0x123456789abcden
    const encoded = encodeCreateRitualData({ nonce: 1n, ruleDigest: ('1f'.repeat(32)) as never, members: [new PublicKey(new Uint8Array(32).fill(1)), new PublicKey(new Uint8Array(32).fill(2))], memberTotalStake: 2n, schedule: [{ opens: value, deadline: value + 1n, resolution: value + 2n }], additionalConfirmationThreshold: 0, feePayerMode: 'HOST' })
    expect(Array.from(encoded.slice(-26, -18))).toEqual([0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12, 0])
    const maxI64 = 0x7fffffffffffffffn
    const maxEncoded = encodeCreateRitualData({ nonce: 1n, ruleDigest: ('1f'.repeat(32)) as never, members: [new PublicKey(new Uint8Array(32).fill(1)), new PublicKey(new Uint8Array(32).fill(2))], memberTotalStake: 2n, schedule: [{ opens: 0n, deadline: maxI64 - 1n, resolution: maxI64 }], additionalConfirmationThreshold: 0, feePayerMode: 'HOST' })
    expect(Array.from(maxEncoded.slice(-10, -2))).toEqual([255, 255, 255, 255, 255, 255, 255, 127])
    expect(() => encodeCreateRitualData({ nonce: 1n, ruleDigest: ('1f'.repeat(32)) as never, members: [new PublicKey(new Uint8Array(32).fill(1)), new PublicKey(new Uint8Array(32).fill(2))], memberTotalStake: 2n, schedule: [{ opens: -0x8000000000000000n, deadline: 0n, resolution: 1n }], additionalConfirmationThreshold: 0, feePayerMode: 'HOST' })).toThrowError(/invariant/)
    expect(fs.readFileSync(path.resolve(__dirname, 'instructionData.ts'), 'utf8')).not.toMatch(/setBig(?:U|)Int64|setBigUint64/)
  })

  it('matches the frozen Rust vectors for all eleven instructions', () => {
    const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
    const actual: Record<string, Uint8Array> = {
      activate_ritual: encodeActivateRitualData(), fund_member: encodeFundMemberData(), cancel_unactivated: encodeCancelUnactivatedData(), close_terminal_vaults: encodeCloseTerminalVaultsData(),
      approve_claim: encodeApproveClaimData(), question_claim: encodeQuestionClaimData(), initialize_current_event: encodeInitializeCurrentEventData(3), finalize_event: encodeFinalizeEventData(3), claim_completion: encodeClaimCompletionData(3),
      initialize_protocol_config: encodeInitializeProtocolConfigData({ allowedStakeMint: key(22), feeRecipient: key(23), feeBasisPoints: 250, minimumFee: 11n, maximumFee: 999n, maximumMemberStake: 1000n }),
      create_ritual: encodeCreateRitualData({ nonce: 7n, ruleDigest: ('1f'.repeat(32)) as never, members: [key(11), key(12), key(13)], memberTotalStake: 200n, schedule: [{ opens: 100n, deadline: 200n, resolution: 300n }, { opens: 400n, deadline: 500n, resolution: 600n }], additionalConfirmationThreshold: 2, feePayerMode: 'HOST' }),
    }
    for (const [name, hex] of Object.entries(V)) expect(Buffer.from(actual[name]).toString('hex')).toBe(hex)
  })

  it('rejects unsafe structural and boundary inputs with the stable error type', () => {
    expect(() => encodeInitializeCurrentEventData(-1)).toThrowError(/input:/)
    expect(() => encodeInitializeCurrentEventData(16)).toThrowError(/input:/)
    expect(() => encodeCreateRitualData({} as never)).toThrowError(RitualInstructionDataError)
  })

  it('exposes the typed encoder surface', () => {
    const key = new PublicKey(new Uint8Array(32).fill(22))
    const digest = ('1f'.repeat(32)) as never
    expect(encodeInitializeProtocolConfigData({ allowedStakeMint: key, feeRecipient: key, feeBasisPoints: 250, minimumFee: 11n, maximumFee: 999n, maximumMemberStake: 1000n })).toBeInstanceOf(Uint8Array)
    expect(encodeCreateRitualData({ nonce: 7n, ruleDigest: digest, members: [key, new PublicKey(new Uint8Array(32).fill(12))], memberTotalStake: 200n, schedule: [{ opens: 100n, deadline: 200n, resolution: 300n }], additionalConfirmationThreshold: 1, feePayerMode: 'HOST' })).toBeInstanceOf(Uint8Array)
    expect(encodeInitializeCurrentEventData(3)).toBeInstanceOf(Uint8Array)
    expect(encodeClaimCompletionData(3)).toBeInstanceOf(Uint8Array)
    expect(encodeApproveClaimData()).toBeInstanceOf(Uint8Array)
    expect(encodeQuestionClaimData()).toBeInstanceOf(Uint8Array)
    expect(encodeFinalizeEventData(3)).toBeInstanceOf(Uint8Array)
  })
})
