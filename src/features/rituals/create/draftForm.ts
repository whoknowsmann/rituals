import { requiredAdditionalConfirmations } from '../../../domain/rituals/threshold'
import type { ConfirmationMode } from '../../../domain/rituals/types'
import { derivePerEventAllocation, deriveGroupPool, quoteActivationFee, type FeeConfig } from '../../../domain/rituals/money'
import { formatTokenAmount, parseTokenAmount } from './decimal'

export type FeePayerMode = 'HOST' | 'SPLIT'

export interface RitualDraft {
  title: string
  requirement: string
  memberCount: string
  eventCount: string
  memberTotalStake: string
  confirmationMode: ConfirmationMode
  feePayerMode: FeePayerMode
}

export const DEFAULT_RITUAL_DRAFT: RitualDraft = {
  title: 'A reading ritual',
  requirement: 'Read a few pages and share what stood out.',
  memberCount: '2',
  eventCount: '4',
  memberTotalStake: '20',
  confirmationMode: 'ONE_FRIEND',
  feePayerMode: 'HOST',
}

export const RITUAL_FEE_CONFIG: Readonly<FeeConfig> = Object.freeze({
  basisPoints: 200,
  minimumFee: 500_000n,
  maximumFee: 5_000_000n,
  tokenDecimals: 6,
})

export type ValidatedRitualDraft = Omit<RitualDraft, 'memberCount' | 'eventCount' | 'memberTotalStake'> & {
  readonly memberCount: number
  readonly eventCount: number
  readonly memberTotalStake: string
  readonly memberTotalStakeAtomic: bigint
  readonly additionalConfirmationThreshold: number
}

export type DraftParseResult =
  | { readonly ok: true; readonly value: RitualDraft }
  | { readonly ok: false; readonly error: 'Invalid ritual draft.' }

export type DraftValidation =
  | { readonly ok: true; readonly value: ValidatedRitualDraft }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>> }

const DRAFT_KEYS = [
  'title',
  'requirement',
  'memberCount',
  'eventCount',
  'memberTotalStake',
  'confirmationMode',
  'feePayerMode',
] as const
const CONFIRMATION_MODES = ['HONOR', 'ONE_FRIEND', 'MAJORITY', 'UNANIMOUS'] as const
const FEE_PAYER_MODES = ['HOST', 'SPLIT'] as const

export const limitCodePoints = (value: string, max: number): string => Array.from(value).slice(0, max).join('')

export const clearFieldError = (
  errors: Readonly<Record<string, string>>,
  key: string,
): Readonly<Record<string, string>> => {
  const next = { ...errors }
  delete next[key]
  return next
}

export function parseRitualDraft(value: unknown): DraftParseResult {
  try {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      return { ok: false, error: 'Invalid ritual draft.' }
    }
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (keys.length !== DRAFT_KEYS.length || DRAFT_KEYS.some((key) => !keys.includes(key))) {
      return { ok: false, error: 'Invalid ritual draft.' }
    }
    const values: Record<string, string> = {}
    for (const key of DRAFT_KEYS) {
      const descriptor = descriptors[key]
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string') {
        return { ok: false, error: 'Invalid ritual draft.' }
      }
      values[key] = descriptor.value
    }
    if (!CONFIRMATION_MODES.includes(values.confirmationMode as ConfirmationMode)
      || !FEE_PAYER_MODES.includes(values.feePayerMode as FeePayerMode)) {
      return { ok: false, error: 'Invalid ritual draft.' }
    }
    return {
      ok: true,
      value: {
        title: values.title,
        requirement: values.requirement,
        memberCount: values.memberCount,
        eventCount: values.eventCount,
        memberTotalStake: values.memberTotalStake,
        confirmationMode: values.confirmationMode as ConfirmationMode,
        feePayerMode: values.feePayerMode as FeePayerMode,
      },
    }
  } catch {
    return { ok: false, error: 'Invalid ritual draft.' }
  }
}

const integerField = (value: string, min: number, max: number, label: string): number => {
  if (!/^\d+$/.test(value)) throw new RangeError(`${label} must be a whole number`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new RangeError(`${label} must be between ${min} and ${max}`)
  }
  return parsed
}

const errorMessage = (error: unknown, fallback: string): string => (
  error instanceof Error ? error.message : fallback
)

export function validateRitualDraft(input: unknown): DraftValidation {
  const parsed = parseRitualDraft(input)
  if (!parsed.ok) return { ok: false, errors: { form: 'Invalid ritual link.' } }

  const draft = parsed.value
  const errors: Record<string, string> = {}
  if (draft.title.trim().length === 0 || Array.from(draft.title).length > 80) {
    errors.title = 'Title must be 1–80 characters.'
  }
  if (draft.requirement.trim().length === 0 || Array.from(draft.requirement).length > 280) {
    errors.requirement = 'Requirement must be 1–280 characters.'
  }

  let memberCount: number | undefined
  let eventCount: number | undefined
  let memberTotalStakeAtomic: bigint | undefined
  try {
    memberCount = integerField(draft.memberCount, 2, 6, 'Member count')
  } catch (error) {
    errors.memberCount = errorMessage(error, 'Member count is invalid.')
  }
  try {
    eventCount = integerField(draft.eventCount, 1, 16, 'Event count')
  } catch (error) {
    errors.eventCount = errorMessage(error, 'Event count is invalid.')
  }
  try {
    memberTotalStakeAtomic = parseTokenAmount(draft.memberTotalStake)
    if (memberTotalStakeAtomic <= 0n) throw new RangeError('Per-member stake must be greater than zero')
  } catch (error) {
    errors.memberTotalStake = errorMessage(error, 'Per-member stake is invalid.')
  }

  if (memberCount !== undefined && eventCount !== undefined && memberTotalStakeAtomic !== undefined) {
    try {
      derivePerEventAllocation(memberTotalStakeAtomic, eventCount)
    } catch (error) {
      errors.memberTotalStake = errorMessage(error, 'Per-member stake must divide evenly across events.')
    }
    try {
      requiredAdditionalConfirmations(draft.confirmationMode, memberCount)
    } catch {
      errors.confirmationMode = 'Choose a valid confirmation mode.'
    }
    if (!errors.memberTotalStake) {
      try {
        const groupPool = deriveGroupPool(memberTotalStakeAtomic, memberCount)
        quoteActivationFee(groupPool, RITUAL_FEE_CONFIG)
      } catch (error) {
        errors.memberTotalStake = errorMessage(error, 'Per-member stake is too large for this group.')
      }
    }
  }
  if (!FEE_PAYER_MODES.includes(draft.feePayerMode)) {
    errors.feePayerMode = 'Choose who pays the activation fee.'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  if (memberCount === undefined || eventCount === undefined || memberTotalStakeAtomic === undefined) {
    return { ok: false, errors: { form: 'Ritual draft is incomplete.' } }
  }
  return {
    ok: true,
    value: {
      ...draft,
      memberCount,
      eventCount,
      memberTotalStakeAtomic,
      additionalConfirmationThreshold: requiredAdditionalConfirmations(draft.confirmationMode, memberCount),
    },
  }
}

export function draftEconomics(draft: ValidatedRitualDraft) {
  const groupPool = deriveGroupPool(draft.memberTotalStakeAtomic, draft.memberCount)
  const fee = quoteActivationFee(groupPool, RITUAL_FEE_CONFIG)
  return {
    groupPool,
    perEvent: derivePerEventAllocation(draft.memberTotalStakeAtomic, draft.eventCount),
    fee,
    format: formatTokenAmount,
    parse: parseTokenAmount,
  }
}
