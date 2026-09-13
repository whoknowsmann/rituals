import { requiredAdditionalConfirmations } from '../../../domain/rituals/threshold'
import type { ClaimStatus, ConfirmationMode, EventStatus, RitualStatus, TokenAtomicUnits } from '../../../domain/rituals/types'

export interface RitualDetailInput { ritualId: string; title: string; status: RitualStatus; requirement: string; nextClaimWindow: string; stakeAtomicUnits: bigint; tokenDecimals: number; tokenSymbol: string; confirmationMode: ConfirmationMode }
export interface RitualDetailViewModel extends RitualDetailInput { readonly statusLabel: string; readonly stake: string; readonly confirmationLabel: string; readonly ctaLabel: string }
export interface ClaimCompletionViewModel { readonly walletSignature: string; readonly friendConfirmations: string; readonly ctaLabel: string; readonly canClaim: boolean }
export interface ConfirmationInboxInput { claimant: string; ritualTitle: string; eventLabel: string; requirement: string; threshold: number; confirmations: number; claimStatus: ClaimStatus; viewer: string; action: ConfirmationAction }
export interface ConfirmationInboxViewModel extends ConfirmationInboxInput { readonly progress: string; readonly statusCopy: string; readonly outcomeCopy?: string; readonly canConfirm: boolean; readonly canQuestion: boolean; readonly confirmDisabledReason?: string }
export type ConfirmationAction = 'idle' | 'in-flight' | 'confirmed' | 'questioned'
export type ConfirmationReducerAction = { readonly type: 'CONFIRM' | 'QUESTION' | 'START' }
export function confirmationInboxReducer(state: Pick<ConfirmationInboxInput, 'action'>, action: ConfirmationReducerAction): Pick<ConfirmationInboxInput, 'action'> {
  if (state.action !== 'idle' && state.action !== 'in-flight') return state
  if (action.type === 'START') return { action: 'in-flight' }
  if (state.action === 'in-flight') return { action: action.type === 'CONFIRM' ? 'confirmed' : 'questioned' }
  if (action.type !== 'CONFIRM' && action.type !== 'QUESTION') return state
  return { action: action.type === 'CONFIRM' ? 'confirmed' : 'questioned' }
}
export type MemberOutcome = 'CONFIRMED' | 'UNCLAIMED'
export interface SettlementReceiptInput {
  status: EventStatus
  eventAllocation: TokenAtomicUnits
  memberOutcome: MemberOutcome
  principal: bigint
  bonus: bigint
  forfeiture: bigint
  futureStake: bigint
  activationFee: bigint
  tokenDecimals: number
  tokenSymbol: string
  settlement: { kind: 'SETTLED' } | { kind: 'VOIDED'; reason: string }
}
export interface SettlementReceiptViewModel { readonly status: 'settled' | 'voided' | 'invalid'; readonly explanation: string; readonly lines: readonly (readonly [string, string])[] }

const labels: Record<ConfirmationMode, string> = { HONOR: 'Honor system', ONE_FRIEND: 'One friend confirms', MAJORITY: 'Majority confirms', UNANIMOUS: 'Everyone confirms' }
const invalidReceipt = (explanation = 'This receipt preview is unavailable because its financial data is invalid.'): SettlementReceiptViewModel => ({ status: 'invalid', explanation, lines: [] })
function format(amount: bigint, decimals: number, symbol: string): string {
  if (amount < 0n) return 'Invalid amount'
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  const fraction = amount % base
  return `${whole}${decimals === 0 ? '' : `.${fraction.toString().padStart(decimals, '0')}`} ${symbol}`
}
function validMoney(input: SettlementReceiptInput): boolean {
  return Number.isInteger(input.tokenDecimals) && input.tokenDecimals >= 0 && input.tokenDecimals <= 255
    && /^[A-Z0-9]{1,12}$/.test(input.tokenSymbol)
    && [input.eventAllocation, input.principal, input.bonus, input.forfeiture, input.futureStake, input.activationFee]
      .every((value) => typeof value === 'bigint' && value >= 0n && value <= 18_446_744_073_709_551_615n)
}

export function buildRitualDetailViewModel(input: RitualDetailInput): RitualDetailViewModel { return { ...input, statusLabel: input.status === 'ACTIVE' ? 'Active ritual' : input.status, stake: format(input.stakeAtomicUnits, input.tokenDecimals, input.tokenSymbol), confirmationLabel: labels[input.confirmationMode], ctaLabel: 'I did it · Preview claim' } }
export function buildClaimCompletionViewModel(input: { claimant: string; friendConfirmations: number; threshold: number }): ClaimCompletionViewModel { return { walletSignature: 'No wallet signature · not connected (fixture preview)', friendConfirmations: `${input.friendConfirmations} of ${input.threshold} friend confirmations locked`, ctaLabel: 'Preview claim · no signature', canClaim: true } }
export function buildConfirmationInboxViewModel(input: ConfirmationInboxInput): ConfirmationInboxViewModel {
  const self = input.viewer === input.claimant
  const busy = input.action !== 'idle'
  const available = !self && !busy && input.claimStatus === 'PENDING'
  const outcomeCopy = input.action === 'confirmed' ? 'Confirmed locally in this preview. No claim was submitted.' : input.action === 'questioned' ? 'Questioned locally in this preview. The outcome remains neutral for review.' : undefined
  return { ...input, progress: `${Math.min(input.confirmations, input.threshold)} of ${input.threshold} confirmations`, statusCopy: input.claimStatus === 'QUESTIONED' ? 'Questioned · waiting for review. This preview keeps the outcome open.' : input.claimStatus === 'PENDING' ? 'Pending · waiting for the required confirmations.' : 'Confirmation recorded in this fixture preview.', outcomeCopy, canConfirm: available, canQuestion: available, confirmDisabledReason: self ? 'The claimant cannot confirm their own claim.' : busy ? 'Action already in progress or complete.' : undefined }
}
export function buildSettlementReceiptViewModel(input: SettlementReceiptInput): SettlementReceiptViewModel {
  if (!input || typeof input !== 'object' || !input.settlement || typeof input.settlement !== 'object' || !validMoney(input)
    || (input.status !== 'SETTLED' && input.status !== 'VOIDED') || input.status !== input.settlement.kind
    || (input.status === 'SETTLED' && (
      (input.memberOutcome === 'CONFIRMED' && (input.principal !== input.eventAllocation || input.forfeiture !== 0n))
      || (input.memberOutcome === 'UNCLAIMED' && (input.principal !== 0n || input.bonus !== 0n || input.forfeiture !== input.eventAllocation))
      || (input.memberOutcome !== 'CONFIRMED' && input.memberOutcome !== 'UNCLAIMED')
    ))
    || (input.status === 'VOIDED' && (input.principal !== input.eventAllocation || input.bonus !== 0n || input.forfeiture !== 0n))) return invalidReceipt()
  const voided = input.settlement.kind === 'VOIDED'
  const reason = input.settlement.kind === 'VOIDED' ? input.settlement.reason : ''
  const zero = `0 ${input.tokenSymbol}`
  const totalReceived = input.principal + input.bonus
  if (totalReceived > 18_446_744_073_709_551_615n) return invalidReceipt()
  const lines: [string, string][] = [
    ['Principal returned', format(input.principal, input.tokenDecimals, input.tokenSymbol)],
    ['Bonus', voided && input.bonus === 0n ? zero : format(input.bonus, input.tokenDecimals, input.tokenSymbol)],
    ['Total received', format(totalReceived, input.tokenDecimals, input.tokenSymbol)],
    ['Forfeiture', voided && input.forfeiture === 0n ? zero : format(input.forfeiture, input.tokenDecimals, input.tokenSymbol)],
    ['Future stake', format(input.futureStake, input.tokenDecimals, input.tokenSymbol)],
    ['Activation fee', `${format(input.activationFee, input.tokenDecimals, input.tokenSymbol)} · paid separately`],
    ['Network fee', 'Unknown'], ['Platform share', zero],
  ]
  return { status: voided ? 'voided' : 'settled', explanation: voided ? `Event voided (${reason}); unresolved claims return the exact principal. Bonus and forfeiture are zero.` : 'Event settled in fixture preview. No transfer or state change occurred.', lines }
}
export function confirmationThreshold(mode: ConfirmationMode, fundedMembers: number): number { return requiredAdditionalConfirmations(mode, fundedMembers) }
