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
function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actualKeys = Reflect.ownKeys(value)
  if (actualKeys.some((key) => typeof key !== 'string')) fail(`${label} has unexpected or missing fields`)
  const actual = (actualKeys as string[]).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} has unexpected or missing fields`)
}
function denseArray(value: unknown, min: number, max: number, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label} must contain ${min}..${max} entries`)
  const keys = Reflect.ownKeys(value)
  if (keys.length !== value.length + 1 || !keys.includes('length') || keys.some((key) => key !== 'length' && (typeof key !== 'string' || !/^\d+$/.test(key) || Number(key) >= value.length || !Object.hasOwn(value, key)))) fail(`${label} must be dense and have no extra fields`)
  for (let index = 0; index < value.length; index += 1) if (!Object.hasOwn(value, index)) fail(`${label} must be dense`)
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

export function assertValidLockedRitualRules(value: unknown): asserts value is LockedRitualRules {
  if (!isPlainObject(value)) fail('rules must be a plain object')
  exactKeys(value, RULE_KEYS, 'rules')
  if (value.schemaVersion !== RITUAL_RULE_SCHEMA_VERSION) fail('unsupported schema version')
  if (value.cluster !== DEVNET_CLUSTER) fail('cluster must be devnet')
  if (typeof value.title !== 'string' || value.title.trim().length === 0 || stringLength(value.title) > 80) fail('title is invalid')
  if (typeof value.requirement !== 'string' || value.requirement.trim().length === 0 || stringLength(value.requirement) > 280) fail('requirement is invalid')
  denseArray(value.schedule, 1, 16, 'schedule')
  let previousResolution = -1
  for (let index = 0; index < value.schedule.length; index += 1) {
    const entry = value.schedule[index]
    if (!isPlainObject(entry)) fail('schedule entries must be plain objects')
    exactKeys(entry, SCHEDULE_KEYS, 'schedule entry')
    if (entry.eventIndex !== index) fail('eventIndex must be contiguous')
    const opens = safeNonnegativeInteger(entry.claimOpensAt, 'claimOpensAt')
    const deadline = safeNonnegativeInteger(entry.claimDeadlineAt, 'claimDeadlineAt')
    const resolution = safeNonnegativeInteger(entry.resolutionDeadlineAt, 'resolutionDeadlineAt')
    if (!(opens < deadline && deadline < resolution)) fail('schedule timestamps must be ordered')
    if (index > 0 && opens <= previousResolution) fail('events must be strictly chronological')
    previousResolution = resolution
  }
  denseArray(value.members, 2, 6, 'members')
  const members: PublicKeyText[] = []
  for (let index = 0; index < value.members.length; index += 1) members.push(canonicalAddress(value.members[index], 'member'))
  if (new Set(members).size !== members.length) fail('members must be unique')
  const memberTotalStake = u64(value.memberTotalStake, 'memberTotalStake')
  try { derivePerEventAllocation(memberTotalStake, value.schedule.length) } catch { fail('memberTotalStake must divide across schedule events') }
  const activationFee = u64(value.activationFee, 'activationFee')
  if ((memberTotalStake === 0n) !== (activationFee === 0n)) fail('free rituals require zero fee and funded rituals require a positive fee')
  canonicalAddress(value.stakeMint, 'stakeMint')
  if (typeof value.tokenDecimals !== 'number' || !Number.isInteger(value.tokenDecimals) || value.tokenDecimals < 0 || value.tokenDecimals > 255) fail('tokenDecimals is invalid')
  if (typeof value.confirmationMode !== 'string' || !(CONFIRMATION_MODES as readonly string[]).includes(value.confirmationMode)) fail('confirmationMode is invalid')
  let required: number
  try { required = requiredAdditionalConfirmations(value.confirmationMode as ConfirmationMode, members.length) } catch { fail('confirmationMode is invalid') }
  if (value.additionalConfirmationThreshold !== required) fail('additionalConfirmationThreshold is invalid')
  if (typeof value.feePayerMode !== 'string' || !(FEE_PAYER_MODES as readonly string[]).includes(value.feePayerMode)) fail('feePayerMode is invalid')
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
  assertValidLockedRitualRules(rules)
  return new TextEncoder().encode(JSON.stringify(canonicalValue(rules)))
}
function toHex(bytes: Uint8Array): string { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') }
function digestRulesImpl(rules: LockedRitualRules): RuleDigest {
  return toHex(sha256(canonicalizeRules(rules))) as RuleDigest
}
export async function digestRules(rules: LockedRitualRules): Promise<RuleDigest> { return digestRulesImpl(rules) }

export function digestRulesSync(rules: LockedRitualRules): RuleDigest { return digestRulesImpl(rules) }
