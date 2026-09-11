import { PublicKey } from '@solana/web3.js'
import { MAX_U64 } from './money'
import { assertValidAdditionalConfirmationThreshold } from './threshold'
import {
  CLAIM_STATUSES,
  EVENT_STATUSES,
  RITUAL_STATUSES,
  type ClaimStatus,
  type EventStatus,
  type PublicKeyText,
  type RitualStatus,
} from './types'

export class LifecycleGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LifecycleGuardError'
  }
}

const fail = (message: string): never => { throw new LifecycleGuardError(message) }
const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value)
const safe = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(`${name} must be a nonnegative safe integer`)
  return value as number
}
const status = <T extends string>(values: readonly T[], value: unknown, name: string): T =>
  isOneOf(values, value) ? value : fail(`${name} is invalid`)
const count = (value: unknown, name: string, min: number, max: number): number => {
  const n = safe(value, name)
  if (n < min || n > max) fail(`${name} must be an integer in the range ${min}..${max}`)
  return n
}
const threshold = (value: number, memberCount: number): void => {
  try { assertValidAdditionalConfirmationThreshold(value, memberCount) } catch { fail('invalid additional confirmation threshold') }
}

function snapshotArray(value: unknown, min: number, max: number, name: string): unknown[] {
  if (!Array.isArray(value)) fail(`${name} must be an array`)
  const length = Object.getOwnPropertyDescriptor(value, 'length')
  if (!length || !('value' in length)) fail(`${name} must contain ${min}..${max} entries`)
  const lengthValue = (length as PropertyDescriptor & { value: number }).value
  if (lengthValue < min || lengthValue > max || !Number.isSafeInteger(lengthValue)) fail(`${name} must contain ${min}..${max} entries`)
  const keys = Reflect.ownKeys(value as object)
  if (keys.length !== lengthValue + 1 || !keys.includes('length') || keys.some((k) => k !== 'length' && (typeof k !== 'string' || !/^\d+$/.test(k) || Number(k) >= lengthValue))) fail(`${name} must be dense and have no extra fields`)
  return Array.from({ length: lengthValue }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i))
    if (!d || !('value' in d) || !d.enumerable) fail(`${name} indices must be enumerable data properties`)
    return (d as PropertyDescriptor & { value: unknown }).value
  })
}
function canonical(value: unknown, name: string): PublicKeyText {
  if (typeof value !== 'string') fail(`${name} must be a canonical Solana public key`)
  try { const key = new PublicKey(value as string); if (key.toBase58() !== value) fail(`${name} must be canonical`); return value as PublicKeyText } catch { fail(`${name} must be a canonical Solana public key`) }
  return fail(`${name} must be a canonical Solana public key`)
}
function keys(value: unknown, name: string): PublicKeyText[] {
  const result = snapshotArray(value, 2, 6, name).map((v) => canonical(v, `${name} member`))
  if (new Set(result).size !== result.length) fail(`${name} must be unique`)
  return result
}

export function assertCanEditRitualTerms(statusValue: RitualStatus): void {
  status(RITUAL_STATUSES, statusValue, 'ritual status')
  if (statusValue !== 'DRAFT') fail('ritual terms can only be edited in DRAFT')
}

export function assertCanActivateRitual(input: { status: RitualStatus; acceptedMemberCount: number; fundedMemberCount: number }): void {
  status(RITUAL_STATUSES, input.status, 'ritual status')
  if (input.status !== 'FUNDING') fail('ritual must be FUNDING to activate')
  const accepted = count(input.acceptedMemberCount, 'acceptedMemberCount', 2, 6)
  const funded = count(input.fundedMemberCount, 'fundedMemberCount', 0, accepted)
  if (funded !== accepted) fail('all accepted members must be funded before activation')
}

export function openCompletionClaim(input: { ritualStatus: RitualStatus; eventStatus: EventStatus; currentClaimStatus: ClaimStatus; now: number; claimOpensAt: number; claimDeadlineAt: number; requiredAdditionalConfirmations: number; fundedMemberCount: number }): ClaimStatus {
  status(RITUAL_STATUSES, input.ritualStatus, 'ritual status'); status(EVENT_STATUSES, input.eventStatus, 'event status'); status(CLAIM_STATUSES, input.currentClaimStatus, 'claim status')
  if (input.ritualStatus !== 'ACTIVE' || input.eventStatus !== 'CLAIMING' || input.currentClaimStatus !== 'UNCLAIMED') fail('claim cannot be opened in the current state')
  const now = safe(input.now, 'now'); const opens = safe(input.claimOpensAt, 'claimOpensAt'); const deadline = safe(input.claimDeadlineAt, 'claimDeadlineAt')
  if (opens >= deadline || now < opens || now > deadline) fail('claim is outside its inclusive window')
  threshold(input.requiredAdditionalConfirmations, input.fundedMemberCount)
  return input.requiredAdditionalConfirmations === 0 ? 'CONFIRMED' : 'PENDING'
}

export function approveCompletionClaim(input: { claimant: PublicKeyText; approver: PublicKeyText; eligibleFundedMembers: readonly PublicKeyText[]; existingApprovals: readonly PublicKeyText[]; requiredAdditionalConfirmations: number; claimStatus: ClaimStatus }): { readonly claimStatus: 'PENDING' | 'CONFIRMED'; readonly approvals: readonly PublicKeyText[]; readonly thresholdReachedNow: boolean } {
  const eligible = keys(input.eligibleFundedMembers, 'eligibleFundedMembers'); const claimant = canonical(input.claimant, 'claimant'); const approver = canonical(input.approver, 'approver')
  const existing = snapshotArray(input.existingApprovals, 0, 5, 'existingApprovals').map((v) => canonical(v, 'approval'))
  if (new Set(existing).size !== existing.length || existing.some((v) => !eligible.includes(v) || v === claimant)) fail('existing approvals are invalid')
  if (!eligible.includes(claimant)) fail('claimant must be eligible'); if (!eligible.includes(approver) || approver === claimant) fail('approver must be a different eligible member')
  status(CLAIM_STATUSES, input.claimStatus, 'claim status'); if (input.claimStatus !== 'PENDING') fail('only PENDING claims can be approved')
  threshold(input.requiredAdditionalConfirmations, eligible.length)
  if (input.requiredAdditionalConfirmations === 0) fail('honor claims do not require approval')
  if (existing.length >= input.requiredAdditionalConfirmations) fail('pending claim has already reached its threshold')
  if (existing.includes(approver)) fail('approver has already approved')
  const approvals = [...existing, approver]; const reached = approvals.length === input.requiredAdditionalConfirmations
  return { claimStatus: reached ? 'CONFIRMED' : 'PENDING', approvals, thresholdReachedNow: reached }
}

export function deriveSafeEventFinalizationKind(claimStatuses: readonly ClaimStatus[]): 'SETTLE' | 'VOID' {
  const claims = snapshotArray(claimStatuses, 2, 6, 'claimStatuses').map((v) => status(CLAIM_STATUSES, v, 'claim status'))
  return claims.every((v) => v === 'CONFIRMED' || v === 'UNCLAIMED') && claims.some((v) => v === 'CONFIRMED') ? 'SETTLE' : 'VOID'
}
export function assertCanFinalizeAsSettled(claimStatuses: readonly ClaimStatus[]): void { if (deriveSafeEventFinalizationKind(claimStatuses) !== 'SETTLE') fail('event cannot be finalized as settled') }

export function assertEventTransition(from: EventStatus, to: EventStatus): void {
  status(EVENT_STATUSES, from, 'from event status'); status(EVENT_STATUSES, to, 'to event status')
  if (!((from === 'SCHEDULED' && to === 'CLAIMING') || (from === 'CLAIMING' && to === 'RESOLVING') || (from === 'RESOLVING' && (to === 'SETTLED' || to === 'VOIDED')))) fail('invalid event transition')
}

export function assertCanCloseRitual(input: { ritualStatus: RitualStatus; settledEventCount: number; eventCount: number; vaultBalance: bigint }): void {
  status(RITUAL_STATUSES, input.ritualStatus, 'ritual status'); if (input.ritualStatus !== 'COMPLETED') fail('ritual must be COMPLETED to close')
  const events = count(input.eventCount, 'eventCount', 1, 16); const settled = safe(input.settledEventCount, 'settledEventCount'); if (settled !== events) fail('all events must be settled before closure')
  if (typeof input.vaultBalance !== 'bigint' || input.vaultBalance < 0n || input.vaultBalance > MAX_U64) fail('vaultBalance must be a u64 bigint')
  if (input.vaultBalance !== 0n) fail('vault must be empty before closure')
}
