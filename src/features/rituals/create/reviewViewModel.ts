import { requiredAdditionalConfirmations } from '../../../domain/rituals/threshold'
import { draftEconomics, type RitualDraft, validateRitualDraft } from './draftForm'
import type { ConfirmationMode } from '../../../domain/rituals/types'

const CONFIRMATION_LABELS: Record<ConfirmationMode, string> = {
  HONOR: 'Honor system',
  ONE_FRIEND: 'One friend',
  MAJORITY: 'Majority',
  UNANIMOUS: 'Unanimous',
}

export interface ReviewViewModel {
  readonly title: string
  readonly requirement: string
  readonly members: string
  readonly events: string
  readonly perMemberTotal: string
  readonly perEventAllocation: string
  readonly groupPool: string
  readonly activationFee: string
  readonly confirmationMode: string
  readonly confirmationThreshold: string
  readonly feePayer: string
  readonly disclosures: readonly string[]
}

export function buildReviewViewModel(input: RitualDraft): ReviewViewModel
export function buildReviewViewModel(input: unknown): ReviewViewModel | null
export function buildReviewViewModel(input: unknown): ReviewViewModel | null {
  const validated = validateRitualDraft(input)
  if (!validated.ok) return null

  const value = validated.value
  const economics = draftEconomics(value)
  const threshold = requiredAdditionalConfirmations(value.confirmationMode, value.memberCount)
  const confirmationThreshold = value.confirmationMode === 'HONOR'
    ? 'No friend confirmation required'
    : `${threshold} friend confirmation${threshold === 1 ? '' : 's'} beyond the claimant`

  return {
    title: value.title,
    requirement: value.requirement,
    members: `${value.memberCount} members`,
    events: `${value.eventCount} events`,
    perMemberTotal: `${economics.format(value.memberTotalStakeAtomic)} TEST`,
    perEventAllocation: `${economics.format(economics.perEvent)} TEST`,
    groupPool: `${economics.format(economics.groupPool)} TEST`,
    activationFee: `${economics.format(economics.fee)} TEST`,
    confirmationMode: CONFIRMATION_LABELS[value.confirmationMode],
    confirmationThreshold,
    feePayer: value.feePayerMode === 'HOST'
      ? 'Host pays activation fee'
      : 'Split activation fee · Activation fee split deterministically across members',
    disclosures: [
      'Stake remains refundable before activation; after activation each event allocation follows completion/settlement rules.',
      'Activation fee is nonrefundable.',
      'Creating the ritual costs about 0.01 devnet SOL in network fees and rent.',
      'TEST is a devnet token with no real value.',
      'Nothing is signed or locked until you create the ritual from the funding lobby.',
    ],
  }
}
