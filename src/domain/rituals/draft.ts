import { sha256 } from '@noble/hashes/sha256'
import { PublicKey } from '@solana/web3.js'
import { derivePerEventAllocation, MAX_U64 } from './money'
import { requiredAdditionalConfirmations } from './threshold'
import { CONFIRMATION_MODES, DEVNET_CLUSTER, type ConfirmationMode, type PublicKeyText, type RuleDigest } from './types'

export const RITUAL_RULE_SCHEMA_VERSION = 1 as const
export const FEE_PAYER_MODES = ['HOST', 'SPLIT'] as const
export type FeePayerMode = typeof FEE_PAYER_MODES[number]

export interface RitualScheduleEntry {
  readonly eventIndex: number
  readonly claimOpensAt: number
  readonly claimDeadlineAt: number
  readonly resolutionDeadlineAt: number
}

export interface LockedRitualRules {
  readonly schemaVersion: 1
  readonly cluster: 'devnet'
  readonly title: string
  readonly requirement: string
  readonly schedule: readonly RitualScheduleEntry[]
  readonly members: readonly PublicKeyText[]
  readonly memberTotalStake: bigint
  readonly stakeMint: PublicKeyText
  readonly tokenDecimals: number
  readonly confirmationMode: ConfirmationMode
  readonly additionalConfirmationThreshold: number
  readonly activationFee: bigint
  readonly feePayerMode: FeePayerMode
}

const RULE_KEYS = ['schemaVersion', 'cluster', 'title', 'requirement', 'schedule', 'members', 'memberTotalStake', 'stakeMint', 'tokenDecimals', 'confirmationMode', 'additionalConfirmationThreshold', 'activationFee', 'feePayerMode'] as const
const SCHEDULE_KEYS = ['eventIndex', 'claimOpensAt', 'claimDeadlineAt', 'resolutionDeadlineAt'] as const

function fail(message: string): never { throw new TypeError(message) }
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
function snapshotRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!isPlainObject(value)) fail(`${label} must be a plain object`)
  const actualKeys = Reflect.ownKeys(value)
  if (actualKeys.some((key) => typeof key !== 'string')) fail(`${label} has unexpected or missing fields`)
  const actual = (actualKeys as string[]).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} has unexpected or missing fields`)
  const snapshot: Record<string, unknown> = {}
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail(`${label} fields must be enumerable data properties`)
    // Descriptor values are the consistency snapshot; this is not blanket Proxy trust.
    snapshot[key] = descriptor.value
  }
  return snapshot
}
function snapshotArray(value: unknown, min: number, max: number, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`)
  const keys = Reflect.ownKeys(value)
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (!lengthDescriptor || !('value' in lengthDescriptor) || lengthDescriptor.enumerable || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < min || lengthDescriptor.value > max) fail(`${label} must contain ${min}..${max} entries`)
  const length = lengthDescriptor.value
  if (keys.length !== length + 1 || !keys.includes('length') || keys.some((key) => key !== 'length' && (typeof key !== 'string' || !/^\d+$/.test(key) || Number(key) >= length))) fail(`${label} must be dense and have no extra fields`)
  const snapshot: unknown[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail(`${label} indices must be enumerable data properties`)
    snapshot.push(descriptor.value)
  }
  return snapshot
}
function stringLength(value: string): number { return Array.from(value).length }
function canonicalAddress(value: unknown, name: string): PublicKeyText {
  if (typeof value !== 'string') fail(`${name} must be a string`)
  try {
    const parsed = new PublicKey(value)
    if (parsed.toBase58() !== value) fail(`${name} must be canonical`)
    return value as PublicKeyText
  } catch { fail(`${name} must be a canonical Solana public key`) }
}
function safeNonnegativeInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(`${name} must be a nonnegative safe integer`)
  return value
}
function u64(value: unknown, name: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > MAX_U64) fail(`${name} must be a nonnegative u64 bigint`)
  return value
}

export function parseLockedRitualRules(value: unknown): LockedRitualRules {
  const rules = snapshotRecord(value, RULE_KEYS, 'rules')
  if (rules.schemaVersion !== RITUAL_RULE_SCHEMA_VERSION) fail('unsupported schema version')
  if (rules.cluster !== DEVNET_CLUSTER) fail('cluster must be devnet')
  if (typeof rules.title !== 'string' || rules.title.trim().length === 0 || stringLength(rules.title) > 80) fail('title is invalid')
  if (typeof rules.requirement !== 'string' || rules.requirement.trim().length === 0 || stringLength(rules.requirement) > 280) fail('requirement is invalid')
  const scheduleValues = snapshotArray(rules.schedule, 1, 16, 'schedule')
  const schedule: RitualScheduleEntry[] = []
  let previousResolution = -1
  for (let index = 0; index < scheduleValues.length; index += 1) {
    const entry = snapshotRecord(scheduleValues[index], SCHEDULE_KEYS, 'schedule entry')
    if (entry.eventIndex !== index) fail('eventIndex must be contiguous')
    const opens = safeNonnegativeInteger(entry.claimOpensAt, 'claimOpensAt')
    const deadline = safeNonnegativeInteger(entry.claimDeadlineAt, 'claimDeadlineAt')
    const resolution = safeNonnegativeInteger(entry.resolutionDeadlineAt, 'resolutionDeadlineAt')
    if (!(opens < deadline && deadline < resolution)) fail('schedule timestamps must be ordered')
    if (index > 0 && opens <= previousResolution) fail('events must be strictly chronological')
    previousResolution = resolution
    schedule.push({ eventIndex: entry.eventIndex as number, claimOpensAt: opens, claimDeadlineAt: deadline, resolutionDeadlineAt: resolution })
  }
  const memberValues = snapshotArray(rules.members, 2, 6, 'members')
  const members = memberValues.map((member) => canonicalAddress(member, 'member'))
  if (new Set(members).size !== members.length) fail('members must be unique')
  const memberTotalStake = u64(rules.memberTotalStake, 'memberTotalStake')
  try { derivePerEventAllocation(memberTotalStake, schedule.length) } catch { fail('memberTotalStake must divide across schedule events') }
  const activationFee = u64(rules.activationFee, 'activationFee')
  if ((memberTotalStake === 0n) !== (activationFee === 0n)) fail('free rituals require zero fee and funded rituals require a positive fee')
  const stakeMint = canonicalAddress(rules.stakeMint, 'stakeMint')
  if (typeof rules.tokenDecimals !== 'number' || !Number.isInteger(rules.tokenDecimals) || rules.tokenDecimals < 0 || rules.tokenDecimals > 255) fail('tokenDecimals is invalid')
  if (typeof rules.confirmationMode !== 'string' || !(CONFIRMATION_MODES as readonly string[]).includes(rules.confirmationMode)) fail('confirmationMode is invalid')
  let required: number
  try { required = requiredAdditionalConfirmations(rules.confirmationMode as ConfirmationMode, members.length) } catch { fail('confirmationMode is invalid') }
  if (rules.additionalConfirmationThreshold !== required) fail('additionalConfirmationThreshold is invalid')
  if (typeof rules.feePayerMode !== 'string' || !(FEE_PAYER_MODES as readonly string[]).includes(rules.feePayerMode)) fail('feePayerMode is invalid')
  return { schemaVersion: 1, cluster: 'devnet', title: rules.title, requirement: rules.requirement, schedule, members, memberTotalStake, stakeMint, tokenDecimals: rules.tokenDecimals, confirmationMode: rules.confirmationMode as ConfirmationMode, additionalConfirmationThreshold: required, activationFee, feePayerMode: rules.feePayerMode as FeePayerMode }
}

export function assertValidLockedRitualRules(value: unknown): asserts value is LockedRitualRules {
  // Use parseLockedRitualRules when an untrusted stable snapshot is needed.
  parseLockedRitualRules(value)
}

function canonicalValue(rules: LockedRitualRules): Record<string, unknown> {
  return {
    schemaVersion: rules.schemaVersion,
    cluster: rules.cluster,
    title: rules.title,
    requirement: rules.requirement,
    schedule: rules.schedule.map((entry) => ({ eventIndex: entry.eventIndex, claimOpensAt: entry.claimOpensAt, claimDeadlineAt: entry.claimDeadlineAt, resolutionDeadlineAt: entry.resolutionDeadlineAt })),
    members: [...rules.members],
    memberTotalStake: rules.memberTotalStake.toString(10),
    stakeMint: rules.stakeMint,
    tokenDecimals: rules.tokenDecimals,
    confirmationMode: rules.confirmationMode,
    additionalConfirmationThreshold: rules.additionalConfirmationThreshold,
    activationFee: rules.activationFee.toString(10),
    feePayerMode: rules.feePayerMode,
  }
}

export function canonicalizeRules(rules: LockedRitualRules): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(canonicalValue(parseLockedRitualRules(rules))))
}
function toHex(bytes: Uint8Array): string { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') }
function digestRulesImpl(rules: LockedRitualRules): RuleDigest {
  return toHex(sha256(new TextEncoder().encode(JSON.stringify(canonicalValue(parseLockedRitualRules(rules)))))) as RuleDigest
}
export async function digestRules(rules: LockedRitualRules): Promise<RuleDigest> { return digestRulesImpl(rules) }

export function digestRulesSync(rules: LockedRitualRules): RuleDigest { return digestRulesImpl(rules) }
