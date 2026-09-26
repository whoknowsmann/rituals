import { PublicKey } from '@solana/web3.js'
import type { RuleDigest } from '../../domain/rituals/types'
import { CURRENT_CLAIM_VERSION } from './pdas'

const frozenDiscriminator = <const T extends readonly number[]>(value: T): Readonly<T> => Object.freeze(value)
export const INSTRUCTION_DISCRIMINATORS = Object.freeze({
  activate_ritual: frozenDiscriminator([188, 109, 197, 57, 117, 119, 89, 251]),
  approve_claim: frozenDiscriminator([74, 228, 211, 63, 140, 255, 69, 210]),
  cancel_unactivated: frozenDiscriminator([173, 217, 226, 113, 114, 199, 239, 82]),
  claim_completion: frozenDiscriminator([89, 9, 83, 69, 176, 3, 122, 36]),
  close_terminal_vaults: frozenDiscriminator([229, 10, 164, 81, 199, 123, 219, 21]),
  create_ritual: frozenDiscriminator([97, 52, 34, 171, 25, 170, 16, 58]),
  create_solo_ritual: frozenDiscriminator([96, 80, 160, 236, 200, 62, 112, 122]),
  declare_skip: frozenDiscriminator([147, 20, 60, 232, 40, 174, 95, 198]),
  finalize_event: frozenDiscriminator([88, 246, 123, 105, 100, 148, 170, 236]),
  fund_member: frozenDiscriminator([234, 156, 207, 252, 148, 24, 162, 238]),
  initialize_current_event: frozenDiscriminator([49, 56, 188, 11, 11, 14, 253, 143]),
  initialize_protocol_config: frozenDiscriminator([28, 50, 43, 233, 244, 98, 123, 118]),
  initialize_season: frozenDiscriminator([48, 218, 111, 51, 235, 207, 4, 119]),
  question_claim: frozenDiscriminator([50, 41, 214, 168, 245, 45, 251, 152]),
})

export class RitualInstructionDataError extends Error {
  readonly category: 'input' | 'overflow' | 'invariant' | 'encoding'
  constructor(category: RitualInstructionDataError['category'], message: string) {
    super(`${category}: ${message}`)
    this.name = 'RitualInstructionDataError'
    this.category = category
  }
}

export type InitializeProtocolConfigInput = Readonly<{
  allowedStakeMint: PublicKey
  feeRecipient: PublicKey
  feeBasisPoints: number
  minimumFee: bigint
  maximumFee: bigint
  maximumMemberStake: bigint
}>
export type EventWindowInput = Readonly<{ opens: bigint; deadline: bigint; resolution: bigint }>
export type InitializeSeasonInput = Readonly<{
  seasonId: Uint8Array
  titleDigest: Uint8Array
  schedule: readonly EventWindowInput[]
  startAt: bigint
  endAt: bigint
}>
export type CreateRitualInput = Readonly<{
  nonce: bigint
  ruleDigest: RuleDigest
  members: readonly PublicKey[]
  memberTotalStake: bigint
  schedule: readonly EventWindowInput[]
  additionalConfirmationThreshold: number
  feePayerMode: 'HOST' | 'SPLIT'
}>

export type CreateSoloRitualInput = Readonly<{
  nonce: bigint
  ruleDigest: RuleDigest
  memberTotalStake: bigint
  schedule: readonly EventWindowInput[]
  witness: PublicKey | null
}>
export type DeclareSkipInput = Readonly<{ eventIndex: number }>

const MAX_U64 = 0xffffffffffffffffn
const MAX_I64 = 0x7fffffffffffffffn
const MIN_I64 = -0x8000000000000000n
const MAX_ALLOC = 8192
const ZERO = PublicKey.default

type AnyRecord = Record<string, unknown>
function record(value: unknown): AnyRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new RitualInstructionDataError('input', 'expected an object')
  return value as AnyRecord
}
function denseArray<T>(value: unknown, name: string): T[] {
  if (!Array.isArray(value)) throw new RitualInstructionDataError('input', `${name} must be an array`)
  for (let i = 0; i < value.length; i += 1) if (!Object.prototype.hasOwnProperty.call(value, i)) throw new RitualInstructionDataError('input', `${name} must be dense`)
  return value as T[]
}
function prop<T>(obj: AnyRecord, name: string): T {
  try { return obj[name] as T } catch { throw new RitualInstructionDataError('input', `could not read ${name}`) }
}
function bigintValue(value: unknown, name: string, signed = false): bigint {
  if (typeof value !== 'bigint' || (!signed && (value < 0n || value > MAX_U64)) || (signed && (value < BigInt(MIN_I64) || value > BigInt(MAX_I64))))
    throw new RitualInstructionDataError('overflow', `${name} is outside ${signed ? 'i64' : 'u64'}`)
  return value
}
function numberValue(value: unknown, name: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw new RitualInstructionDataError('input', `${name} must be an integer in 0..${max}`)
  return value
}
function keyBytes(value: unknown, name: string): Uint8Array {
  if (!(value instanceof PublicKey)) throw new RitualInstructionDataError('input', `${name} must be a PublicKey`)
  try { return Uint8Array.from(value.toBytes()) } catch { throw new RitualInstructionDataError('input', `${name} is unreadable`) }
}
function fixedBytes(value: unknown, name: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== 32) throw new RitualInstructionDataError('input', `${name} must contain exactly 32 bytes`)
  return Uint8Array.from(value)
}
function digestBytes(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new RitualInstructionDataError('input', 'ruleDigest must be lowercase 64-character hex')
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => Number.parseInt(value.slice(i * 2, i * 2 + 2), 16))
  if (bytes.every(x => x === 0)) throw new RitualInstructionDataError('invariant', 'ruleDigest must not be all zero')
  return bytes
}

class Writer {
  private readonly data: Uint8Array
  private offset = 0
  constructor(size: number) {
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ALLOC) throw new RitualInstructionDataError('overflow', 'encoded instruction is too large')
    this.data = new Uint8Array(size)
  }
  u8(v: number): void { this.data[this.offset++] = v }
  u16(v: number): void { this.data[this.offset++] = v & 0xff; this.data[this.offset++] = (v >>> 8) & 0xff }
  u32(v: number): void { for (let i = 0; i < 4; i += 1) this.data[this.offset++] = (v >>> (i * 8)) & 0xff }
  u64(v: bigint): void { for (let i = 0; i < 8; i += 1) this.data[this.offset++] = Number((v >> BigInt(i * 8)) & 0xffn) }
  i64(v: bigint): void { this.u64(v < 0n ? v + (MAX_U64 + 1n) : v) }
  bytes(v: readonly number[] | Uint8Array): void { this.data.set(v, this.offset); this.offset += v.length }
  vec(v: readonly Uint8Array[]): void { this.u32(v.length); for (const item of v) this.bytes(item) }
  finish(): Uint8Array { if (this.offset !== this.data.length) throw new RitualInstructionDataError('encoding', 'internal size mismatch'); return this.data }
}
function empty(name: keyof typeof INSTRUCTION_DISCRIMINATORS): Uint8Array { const w = new Writer(8); w.bytes(INSTRUCTION_DISCRIMINATORS[name]); return w.finish() }
function event(name: 'initialize_current_event' | 'finalize_event' | 'claim_completion', index: unknown): Uint8Array {
  const i = numberValue(index, 'eventIndex', 15); const w = new Writer(name === 'claim_completion' ? 10 : 9); w.bytes(INSTRUCTION_DISCRIMINATORS[name]); w.u8(i); if (name === 'claim_completion') w.u8(CURRENT_CLAIM_VERSION); return w.finish()
}

export function encodeFundMemberData(): Uint8Array { return empty('fund_member') }
export function encodeActivateRitualData(): Uint8Array { return empty('activate_ritual') }
export function encodeCancelUnactivatedData(): Uint8Array { return empty('cancel_unactivated') }
export function encodeCloseTerminalVaultsData(): Uint8Array { return empty('close_terminal_vaults') }
export function encodeInitializeCurrentEventData(eventIndex: number): Uint8Array { return event('initialize_current_event', eventIndex) }
export function encodeFinalizeEventData(eventIndex: number): Uint8Array { return event('finalize_event', eventIndex) }
export function encodeClaimCompletionData(eventIndex: number): Uint8Array { return event('claim_completion', eventIndex) }
export function encodeApproveClaimData(): Uint8Array { const w = new Writer(9); w.bytes(INSTRUCTION_DISCRIMINATORS.approve_claim); w.u8(CURRENT_CLAIM_VERSION); return w.finish() }
export function encodeQuestionClaimData(): Uint8Array { const w = new Writer(9); w.bytes(INSTRUCTION_DISCRIMINATORS.question_claim); w.u8(CURRENT_CLAIM_VERSION); return w.finish() }

export function encodeInitializeSeasonData(input: InitializeSeasonInput): Uint8Array {
  try {
    const o = record(input); const seasonId = fixedBytes(prop(o, 'seasonId'), 'seasonId'); const titleDigest = fixedBytes(prop(o, 'titleDigest'), 'titleDigest'); if (titleDigest.every(byte => byte === 0)) throw new RitualInstructionDataError('invariant', 'titleDigest must not be all zero')
    const startAt = bigintValue(prop(o, 'startAt'), 'startAt', true); const endAt = bigintValue(prop(o, 'endAt'), 'endAt', true); if (startAt < 0n || startAt >= endAt) throw new RitualInstructionDataError('invariant', 'season bounds are invalid')
    const scheduleArray = denseArray<unknown>(prop(o, 'schedule'), 'schedule'); if (scheduleArray.length < 1 || scheduleArray.length > 16) throw new RitualInstructionDataError('invariant', 'schedule must contain 1..16 windows')
    const schedule = scheduleArray.map((x, i) => { const q = record(x); const opens = bigintValue(prop(q, 'opens'), `schedule[${i}].opens`, true); const deadline = bigintValue(prop(q, 'deadline'), `schedule[${i}].deadline`, true); const resolution = bigintValue(prop(q, 'resolution'), `schedule[${i}].resolution`, true); if (opens < 0n || !(opens < deadline && deadline < resolution)) throw new RitualInstructionDataError('invariant', 'event window ordering is invalid'); return { opens, deadline, resolution } })
    for (let i = 1; i < schedule.length; i += 1) if (schedule[i - 1].resolution >= schedule[i].opens) throw new RitualInstructionDataError('invariant', 'schedule windows overlap')
    if (schedule[0].opens < startAt || schedule[schedule.length - 1].resolution > endAt) throw new RitualInstructionDataError('invariant', 'season schedule is outside bounds')
    const w = new Writer(8 + 32 + 32 + 4 + schedule.length * 24 + 8 + 8); w.bytes(INSTRUCTION_DISCRIMINATORS.initialize_season); w.bytes(seasonId); w.bytes(titleDigest); w.u32(schedule.length); for (const s of schedule) { w.i64(s.opens); w.i64(s.deadline); w.i64(s.resolution) } w.i64(startAt); w.i64(endAt); return w.finish()
  } catch (e) { if (e instanceof RitualInstructionDataError) throw e; throw new RitualInstructionDataError('input', 'could not encode season') }
}

export function encodeInitializeProtocolConfigData(input: InitializeProtocolConfigInput): Uint8Array {
  try {
    const o = record(input); const mint = keyBytes(prop(o, 'allowedStakeMint'), 'allowedStakeMint'); const recipient = keyBytes(prop(o, 'feeRecipient'), 'feeRecipient')
    const bps = prop<number>(o, 'feeBasisPoints'); if (typeof bps !== 'number' || !Number.isInteger(bps) || bps < 1 || bps > 10000) throw new RitualInstructionDataError('input', 'feeBasisPoints must be 1..10000')
    const min = bigintValue(prop(o, 'minimumFee'), 'minimumFee'); const max = bigintValue(prop(o, 'maximumFee'), 'maximumFee'); const stake = bigintValue(prop(o, 'maximumMemberStake'), 'maximumMemberStake')
    if (min === 0n || max === 0n || stake === 0n || min > max) throw new RitualInstructionDataError('invariant', 'fee and stake bounds are invalid')
    const w = new Writer(8 + 32 + 32 + 2 + 8 + 8 + 8); w.bytes(INSTRUCTION_DISCRIMINATORS.initialize_protocol_config); w.bytes(mint); w.bytes(recipient); w.u16(bps); w.u64(min); w.u64(max); w.u64(stake); return w.finish()
  } catch (e) { if (e instanceof RitualInstructionDataError) throw e; throw new RitualInstructionDataError('input', 'could not encode protocol config') }
}

export function encodeCreateRitualData(input: CreateRitualInput): Uint8Array {
  try {
    const o = record(input); const nonce = bigintValue(prop(o, 'nonce'), 'nonce'); const digest = digestBytes(prop(o, 'ruleDigest')); const rawMembers = prop<unknown>(o, 'members')
    const memberArray = denseArray<unknown>(rawMembers, 'members')
    if (memberArray.length < 2 || memberArray.length > 6) throw new RitualInstructionDataError('invariant', 'members must contain 2..6 keys')
    const members = memberArray.map((m, i) => keyBytes(m, `members[${i}]`))
    if (members.some(m => m.every(x => x === 0)) || new Set(members.map(m => Array.from(m).join(','))).size !== members.length) throw new RitualInstructionDataError('invariant', 'members must be unique and non-default')
    const stake = bigintValue(prop(o, 'memberTotalStake'), 'memberTotalStake'); if (stake === 0n) throw new RitualInstructionDataError('invariant', 'memberTotalStake must be positive')
    const rawSchedule = prop<unknown>(o, 'schedule'); const scheduleArray = denseArray<unknown>(rawSchedule, 'schedule')
    if (scheduleArray.length < 1 || scheduleArray.length > 16) throw new RitualInstructionDataError('invariant', 'schedule must contain 1..16 windows')
    const schedule = scheduleArray.map((x, i) => { const q = record(x); const opens = bigintValue(prop(q, 'opens'), `schedule[${i}].opens`, true); const deadline = bigintValue(prop(q, 'deadline'), `schedule[${i}].deadline`, true); const resolution = bigintValue(prop(q, 'resolution'), `schedule[${i}].resolution`, true); if (opens < 0n || !(opens < deadline && deadline < resolution)) throw new RitualInstructionDataError('invariant', 'event window ordering is invalid'); return { opens, deadline, resolution } })
    for (let i = 1; i < schedule.length; i++) if (schedule[i - 1].resolution >= schedule[i].opens) throw new RitualInstructionDataError('invariant', 'schedule windows overlap')
    if (stake % BigInt(schedule.length) !== 0n || stake / BigInt(schedule.length) === 0n) throw new RitualInstructionDataError('invariant', 'stake must divide evenly across events')
    if (stake * BigInt(members.length) > MAX_U64) throw new RitualInstructionDataError('overflow', 'group stake pool exceeds u64')
    const threshold = numberValue(prop(o, 'additionalConfirmationThreshold'), 'additionalConfirmationThreshold', members.length - 1); const mode = prop(o, 'feePayerMode'); if (mode !== 'HOST' && mode !== 'SPLIT') throw new RitualInstructionDataError('input', 'feePayerMode must be HOST or SPLIT')
    const size = 8 + 8 + 32 + 4 + members.length * 32 + 8 + 4 + schedule.length * 24 + 1 + 1; const w = new Writer(size); w.bytes(INSTRUCTION_DISCRIMINATORS.create_ritual); w.u64(nonce); w.bytes(digest); w.vec(members); w.u64(stake); w.u32(schedule.length); for (const s of schedule) { w.i64(s.opens); w.i64(s.deadline); w.i64(s.resolution) } w.u8(threshold); w.u8(mode === 'HOST' ? 0 : 1); return w.finish()
  } catch (e) { if (e instanceof RitualInstructionDataError) throw e; throw new RitualInstructionDataError('input', 'could not encode ritual') }
}

export function encodeCreateSoloRitualData(input: CreateSoloRitualInput): Uint8Array {
  try {
    const o = record(input); const nonce = bigintValue(prop(o, 'nonce'), 'nonce'); const digest = digestBytes(prop(o, 'ruleDigest')); const stake = bigintValue(prop(o, 'memberTotalStake'), 'memberTotalStake'); if (stake === 0n) throw new RitualInstructionDataError('invariant', 'memberTotalStake must be positive')
    const scheduleArray = denseArray<unknown>(prop(o, 'schedule'), 'schedule'); if (scheduleArray.length < 1 || scheduleArray.length > 16) throw new RitualInstructionDataError('invariant', 'schedule must contain 1..16 windows')
    const schedule = scheduleArray.map((x, i) => { const q = record(x); const opens = bigintValue(prop(q, 'opens'), `schedule[${i}].opens`, true); const deadline = bigintValue(prop(q, 'deadline'), `schedule[${i}].deadline`, true); const resolution = bigintValue(prop(q, 'resolution'), `schedule[${i}].resolution`, true); if (opens < 0n || !(opens < deadline && deadline < resolution)) throw new RitualInstructionDataError('invariant', 'event window ordering is invalid'); return { opens, deadline, resolution } })
    for (let i = 1; i < schedule.length; i += 1) if (schedule[i - 1].resolution >= schedule[i].opens) throw new RitualInstructionDataError('invariant', 'schedule windows overlap')
    if (stake % BigInt(schedule.length) !== 0n || stake / BigInt(schedule.length) === 0n) throw new RitualInstructionDataError('invariant', 'stake must divide evenly across events')
    const witness = prop(o, 'witness'); const witnessBytes = witness === null ? null : keyBytes(witness, 'witness'); if (witnessBytes?.every(byte => byte === 0)) throw new RitualInstructionDataError('invariant', 'witness must not be default')
    const w = new Writer(8 + 8 + 32 + 8 + 4 + schedule.length * 24 + 1 + (witnessBytes === null ? 0 : 32)); w.bytes(INSTRUCTION_DISCRIMINATORS.create_solo_ritual); w.u64(nonce); w.bytes(digest); w.u64(stake); w.u32(schedule.length); for (const s of schedule) { w.i64(s.opens); w.i64(s.deadline); w.i64(s.resolution) } w.u8(witnessBytes === null ? 0 : 1); if (witnessBytes !== null) w.bytes(witnessBytes); return w.finish()
  } catch (e) { if (e instanceof RitualInstructionDataError) throw e; throw new RitualInstructionDataError('input', 'could not encode solo ritual') }
}

export function encodeDeclareSkipData(input: DeclareSkipInput | number): Uint8Array {
  try { const value = typeof input === 'number' ? input : prop(record(input), 'eventIndex'); const index = numberValue(value, 'eventIndex', 15); const w = new Writer(9); w.bytes(INSTRUCTION_DISCRIMINATORS.declare_skip); w.u8(index); return w.finish() } catch (e) { if (e instanceof RitualInstructionDataError) throw e; throw new RitualInstructionDataError('input', 'could not encode declare skip') }
}
