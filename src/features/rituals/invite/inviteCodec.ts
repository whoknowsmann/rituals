import { Buffer } from 'buffer'
import { PublicKey } from '@solana/web3.js'
import {
  RITUAL_INVITE_DOMAIN,
  RITUAL_INVITE_SCHEMA_VERSION,
  type RitualAccountView,
  type RitualInvite,
} from '../../../domain/rituals/invite'
import { digestRulesSync, parseLockedRitualRules, type LockedRitualRules } from '../../../domain/rituals/draft'
import type { PublicKeyText, RuleDigest } from '../../../domain/rituals/types'

export const RITUAL_JOIN_PREFIX = 'rituals://join?invite='

function canonicalAddress(value: string): PublicKeyText {
  const key = new PublicKey(value)
  if (key.equals(PublicKey.default) || key.toBase58() !== value) throw new Error('invite ritual address is invalid')
  return value as PublicKeyText
}

function jsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString(10)
  if (Array.isArray(value)) return value.map(jsonValue)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonValue(child)]))
  return value
}

function restoreRules(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  const rules = record.rules
  if (rules === null || typeof rules !== 'object' || Array.isArray(rules)) return value
  const rawRules = rules as Record<string, unknown>
  return {
    ...record,
    rules: {
      ...rawRules,
      memberTotalStake: typeof rawRules.memberTotalStake === 'string' ? BigInt(rawRules.memberTotalStake) : rawRules.memberTotalStake,
      activationFee: typeof rawRules.activationFee === 'string' ? BigInt(rawRules.activationFee) : rawRules.activationFee,
    },
  }
}

export function createRitualInvite(ritualAddress: string, rules: LockedRitualRules): RitualInvite {
  const ritual = canonicalAddress(ritualAddress)
  const normalized = parseLockedRitualRules(rules)
  const ruleDigest = digestRulesSync(normalized)
  return Object.freeze({ domain: RITUAL_INVITE_DOMAIN, schemaVersion: RITUAL_INVITE_SCHEMA_VERSION, cluster: 'devnet', ritual, ruleDigest, rules: normalized })
}

export function encodeRitualInvite(invite: RitualInvite): string {
  const normalized = createRitualInvite(invite.ritual, invite.rules)
  if (normalized.ruleDigest !== invite.ruleDigest) throw new Error('invite digest does not match its rules')
  const payload = Buffer.from(JSON.stringify(jsonValue(normalized)), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `${RITUAL_JOIN_PREFIX}${payload}`
}

export function decodeRitualInvite(value: string): RitualInvite {
  if (typeof value !== 'string' || !value.startsWith(RITUAL_JOIN_PREFIX)) throw new Error('invite link has an unsupported format')
  const payload = value.slice(RITUAL_JOIN_PREFIX.length)
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error('invite payload is invalid')
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (payload.length % 4)) % 4)
  let raw: unknown
  try { raw = restoreRules(JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as unknown) } catch { throw new Error('invite payload is invalid') }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invite payload is invalid')
  const record = raw as Record<string, unknown>
  if (typeof record.ritual !== 'string' || typeof record.ruleDigest !== 'string') throw new Error('invite payload is invalid')
  const invite = createRitualInvite(record.ritual, record.rules as LockedRitualRules)
  if (record.domain !== invite.domain || record.schemaVersion !== invite.schemaVersion || record.cluster !== invite.cluster || record.ruleDigest !== invite.ruleDigest) throw new Error('invite payload failed digest validation')
  return invite
}

export function onchainInviteView(read: Readonly<{ address: PublicKey; account: Readonly<{ ruleDigest: RuleDigest }> }>): RitualAccountView {
  if (!(read.address instanceof PublicKey)) throw new Error('ritual read is invalid')
  return Object.freeze({ address: canonicalAddress(read.address.toBase58()), cluster: 'devnet', ruleDigest: read.account.ruleDigest })
}
