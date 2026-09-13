import { requiredAdditionalConfirmations } from '../../../domain/rituals/threshold'
import { draftEconomics, type RitualDraft, validateRitualDraft } from './draftForm'
import type { ConfirmationMode } from '../../../domain/rituals/types'

const CONFIRMATION_LABELS: Record<ConfirmationMode, string> = {
  HONOR: 'Honor system', ONE_FRIEND: 'One friend', MAJORITY: 'Majority', UNANIMOUS: 'Unanimous',
}
export interface ReviewViewModel {
  readonly title: string; readonly requirement: string; readonly members: string; readonly events: string
  readonly perMemberTotal: string; readonly perEventAllocation: string; readonly groupPool: string; readonly activationFee: string
  readonly confirmationMode: string; readonly confirmationThreshold: string; readonly feePayer: string; readonly disclosures: readonly string[]
}
export function buildReviewViewModel(draft: RitualDraft): ReviewViewModel {
  const validated = validateRitualDraft(draft)
  if (!validated.ok) throw new RangeError(Object.values(validated.errors).join(' '))
  const value = validated.value; const economics = draftEconomics(value)
  const threshold = requiredAdditionalConfirmations(value.confirmationMode, value.memberCount)
  return {
    title: value.title, requirement: value.requirement, members: `${value.memberCount} members`, events: `${value.eventCount} events`,
    perMemberTotal: `${economics.format(value.memberTotalStakeAtomic)} TEST`, perEventAllocation: `${economics.format(economics.perEvent)} TEST`,
    groupPool: `${economics.format(economics.groupPool)} TEST`, activationFee: `${economics.format(economics.fee)} TEST`,
    confirmationMode: CONFIRMATION_LABELS[value.confirmationMode],
    confirmationThreshold: `${threshold} friend confirmation${threshold === 1 ? '' : 's'} beyond the claimant`,
    feePayer: value.feePayerMode === 'HOST' ? 'Host pays activation fee' : 'Split activation fee',
    disclosures: ['Refundable stake', 'Nonrefundable activation fee', 'Network fee: unknown until a wallet is connected', 'TEST on devnet is a fixture with no real value', 'Terms are locked for review'],
  }
}
