import { requiredAdditionalConfirmations } from '../../../domain/rituals/threshold'
import type { ConfirmationMode } from '../../../domain/rituals/types'
import { derivePerEventAllocation, deriveGroupPool, quoteActivationFee } from '../../../domain/rituals/money'
import { formatTokenAmount, parseTokenAmount } from './decimal'

export type FeePayerMode = 'HOST' | 'SPLIT'
export interface RitualDraft {
  readonly title: string
  readonly requirement: string
  readonly memberCount: string
  readonly eventCount: string
  readonly memberTotalStake: string
  readonly confirmationMode: ConfirmationMode
  readonly feePayerMode: FeePayerMode
}
export const DEFAULT_RITUAL_DRAFT: RitualDraft = { title: 'A reading ritual', requirement: 'Read a few pages and share what stood out.', memberCount: '2', eventCount: '4', memberTotalStake: '20', confirmationMode: 'ONE_FRIEND', feePayerMode: 'HOST' }
export type ValidatedRitualDraft = Omit<RitualDraft, 'memberCount' | 'eventCount' | 'memberTotalStake'> & { readonly memberCount: number; readonly eventCount: number; readonly memberTotalStake: string; readonly memberTotalStakeAtomic: bigint; readonly additionalConfirmationThreshold: number }
export type DraftValidation = { readonly ok: true; readonly value: ValidatedRitualDraft } | { readonly ok: false; readonly errors: Readonly<Record<string, string>> }
const codepoints = (value: string) => Array.from(value).length
const integerField = (value: string, min: number, max: number, label: string) => {
  if (!/^\d+$/.test(value)) throw new RangeError(`${label} must be a whole number`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new RangeError(`${label} must be between ${min} and ${max}`)
  return parsed
}
export function validateRitualDraft(draft: RitualDraft): DraftValidation {
  const errors: Record<string, string> = {}
  if (typeof draft.title !== 'string' || draft.title.trim().length === 0 || codepoints(draft.title) > 80) errors.title = 'Title must be 1–80 characters.'
  if (typeof draft.requirement !== 'string' || draft.requirement.trim().length === 0 || codepoints(draft.requirement) > 280) errors.requirement = 'Requirement must be 1–280 characters.'
  let memberCount: number | undefined
  let eventCount: number | undefined
  let stake: bigint | undefined
  try { memberCount = integerField(draft.memberCount, 2, 6, 'Member count') } catch (e) { errors.memberCount = (e as Error).message }
  try { eventCount = integerField(draft.eventCount, 1, 16, 'Event count') } catch (e) { errors.eventCount = (e as Error).message }
  try { stake = parseTokenAmount(draft.memberTotalStake); if (stake <= 0n) throw new RangeError('Per-member stake must be greater than zero') } catch (e) { errors.memberTotalStake = (e as Error).message }
  if (memberCount !== undefined && eventCount !== undefined && stake !== undefined) {
    try { derivePerEventAllocation(stake, eventCount) } catch { errors.memberTotalStake = 'Per-member stake must divide evenly across events.' }
    try { requiredAdditionalConfirmations(draft.confirmationMode, memberCount) } catch { errors.confirmationMode = 'Choose a valid confirmation mode.' }
  }
  if (!['HOST', 'SPLIT'].includes(draft.feePayerMode)) errors.feePayerMode = 'Choose who pays the activation fee.'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { ...draft, memberCount: memberCount!, eventCount: eventCount!, memberTotalStakeAtomic: stake!, additionalConfirmationThreshold: requiredAdditionalConfirmations(draft.confirmationMode, memberCount!) } }
}

export function draftEconomics(draft: ValidatedRitualDraft) {
  const groupPool = deriveGroupPool(draft.memberTotalStakeAtomic, draft.memberCount)
  const fee = quoteActivationFee(groupPool, { basisPoints: 200, minimumFee: 500_000n, maximumFee: 5_000_000n, tokenDecimals: 6 })
  return { groupPool, perEvent: derivePerEventAllocation(draft.memberTotalStakeAtomic, draft.eventCount), fee, format: formatTokenAmount, parse: parseTokenAmount }
}
