import { describe, expect, it } from 'vitest'
import { encodeApproveClaimData, encodeQuestionClaimData, encodeInitializeCurrentEventData, encodeFinalizeEventData, encodeClaimCompletionData, encodeFundMemberData, encodeActivateRitualData, encodeCancelUnactivatedData, encodeCloseTerminalVaultsData, RitualInstructionDataError, INSTRUCTION_DISCRIMINATORS } from './instructionData'
import { CURRENT_CLAIM_VERSION } from './pdas'

const expectInputError = (fn: () => unknown) => {
  try { fn(); throw new Error('expected throw') } catch (error) {
    expect(error).toBeInstanceOf(RitualInstructionDataError)
    expect((error as RitualInstructionDataError).category).toBe('input')
    expect(String(error)).not.toMatch(/TypeError|Cannot read|is not a function/)
  }
}

describe('fixed and event Ritual instruction encoders', () => {
  it.each([
    ['initialize current event', encodeInitializeCurrentEventData, INSTRUCTION_DISCRIMINATORS.initialize_current_event, 9],
    ['finalize event', encodeFinalizeEventData, INSTRUCTION_DISCRIMINATORS.finalize_event, 9],
    ['claim completion', encodeClaimCompletionData, INSTRUCTION_DISCRIMINATORS.claim_completion, 10],
  ] as const)('encodes %s at event boundaries', (_name, encode, discriminator, length) => {
    for (const index of [0, 15]) {
      const data = encode(index)
      expect(data).toHaveLength(length)
      expect(Array.from(data.slice(0, 8))).toEqual(discriminator)
      expect(data[8]).toBe(index)
      if (length === 10) expect(data[9]).toBe(CURRENT_CLAIM_VERSION)
    }
  })

  it.each([
    ['negative', -1], ['sixteen', 16], ['fraction', 1.5], ['NaN', NaN], ['infinity', Infinity], ['string', '1'], ['bigint', 1n],
  ])('rejects %s event index for every event encoder', (_name, index) => {
    expectInputError(() => encodeInitializeCurrentEventData(index as never))
    expectInputError(() => encodeFinalizeEventData(index as never))
    expectInputError(() => encodeClaimCompletionData(index as never))
  })

  it.each([
    ['approve', encodeApproveClaimData, INSTRUCTION_DISCRIMINATORS.approve_claim],
    ['question', encodeQuestionClaimData, INSTRUCTION_DISCRIMINATORS.question_claim],
  ] as const)('encodes fixed %s claim version', (_name, encode, discriminator) => {
    const first = encode(); const second = encode()
    expect(first).toHaveLength(9); expect(Array.from(first.slice(0, 8))).toEqual(discriminator); expect(first[8]).toBe(CURRENT_CLAIM_VERSION)
    expect(second).not.toBe(first); first[0] ^= 255; expect(second[0]).toBe(discriminator[0])
  })

  it('does not accept caller-supplied ignored arguments as API inputs', () => {
    expect(encodeApproveClaimData.length).toBe(0)
    expect(encodeQuestionClaimData.length).toBe(0)
    expect((encodeApproveClaimData as unknown as (...args: unknown[]) => Uint8Array)(99)).toEqual(encodeApproveClaimData())
    expect((encodeQuestionClaimData as unknown as (...args: unknown[]) => Uint8Array)(99)).toEqual(encodeQuestionClaimData())
  })

  it('keeps all fixed empty encoders exact and fresh', () => {
    for (const encode of [encodeFundMemberData, encodeActivateRitualData, encodeCancelUnactivatedData, encodeCloseTerminalVaultsData]) {
      const a = encode(); const b = encode(); expect(a).toHaveLength(8); expect(b).not.toBe(a); a[0] ^= 255; expect(a).not.toEqual(b)
    }
  })
})
