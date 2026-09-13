import { describe, expect, it } from 'vitest'
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
} from './instructionData'

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
