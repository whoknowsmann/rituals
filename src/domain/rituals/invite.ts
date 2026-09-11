import { PublicKey } from '@solana/web3.js'
import { assertValidLockedRitualRules, digestRulesSync, type LockedRitualRules } from './draft'
import { DEVNET_CLUSTER, type PublicKeyText, type RuleDigest } from './types'

export const RITUAL_INVITE_DOMAIN = 'rituals.solana.invite' as const
export const RITUAL_INVITE_SCHEMA_VERSION = 1 as const

export interface RitualInvite {
  readonly domain: typeof RITUAL_INVITE_DOMAIN
  readonly schemaVersion: 1
  readonly cluster: 'devnet'
  readonly ritual: PublicKeyText
  readonly ruleDigest: RuleDigest
  readonly rules: LockedRitualRules
}
export interface RitualAccountView {
  readonly address: PublicKeyText
  readonly cluster: 'devnet'
  readonly ruleDigest: RuleDigest
}
export type InviteVerificationFailure =
  | 'invalid_input'
  | 'wrong_domain'
  | 'unsupported_schema'
  | 'invalid_rules'
  | 'cluster_mismatch'
  | 'ritual_mismatch'
  | 'digest_mismatch'
export type VerificationResult = { readonly ok: true } | { readonly ok: false; readonly reason: InviteVerificationFailure }

const INVITE_KEYS = ['domain', 'schemaVersion', 'cluster', 'ritual', 'ruleDigest', 'rules'] as const
const ACCOUNT_KEYS = ['address', 'cluster', 'ruleDigest'] as const
function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Reflect.ownKeys(value)
  if (actualKeys.some((key) => typeof key !== 'string')) return false
  const actual = (actualKeys as string[]).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) return false
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return Boolean(descriptor && 'value' in descriptor && descriptor.enumerable)
  })
}
function address(value: unknown): PublicKeyText | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = new PublicKey(value)
    return parsed.toBase58() === value ? value as PublicKeyText : null
  } catch { return null }
}
function digest(value: unknown): value is RuleDigest {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

export function verifyInvite(invite: unknown, onchain: unknown): VerificationResult {
  try {
    if (!plain(invite) || !plain(onchain) || !exact(invite, INVITE_KEYS) || !exact(onchain, ACCOUNT_KEYS)) return { ok: false, reason: 'invalid_input' }
    const inviteValue = invite as Record<string, unknown>
    const onchainValue = onchain as Record<string, unknown>
    const domain = inviteValue.domain
    const schemaVersion = inviteValue.schemaVersion
    const cluster = inviteValue.cluster
    const ritualValue = inviteValue.ritual
    const inviteDigest = inviteValue.ruleDigest
    const rules = inviteValue.rules
    const onchainCluster = onchainValue.cluster
    const onchainDigest = onchainValue.ruleDigest
    const accountValue = onchainValue.address
    if (domain !== RITUAL_INVITE_DOMAIN) return { ok: false, reason: 'wrong_domain' }
    if (schemaVersion !== RITUAL_INVITE_SCHEMA_VERSION) return { ok: false, reason: 'unsupported_schema' }
    if (!digest(inviteDigest) || !digest(onchainDigest)) return { ok: false, reason: 'invalid_input' }
    const ritual = address(ritualValue)
    const account = address(accountValue)
    if (!ritual || !account) return { ok: false, reason: 'invalid_input' }
    if (rules !== null && typeof rules === 'object') {
      Reflect.ownKeys(rules)
      Object.getPrototypeOf(rules)
    }
    try { assertValidLockedRitualRules(rules) } catch { return { ok: false, reason: 'invalid_rules' } }
    if (cluster !== DEVNET_CLUSTER || rules.cluster !== DEVNET_CLUSTER || onchainCluster !== DEVNET_CLUSTER) return { ok: false, reason: 'cluster_mismatch' }
    if (ritual !== account) return { ok: false, reason: 'ritual_mismatch' }
    const computed = digestRulesSync(rules)
    if (computed !== inviteDigest || computed !== onchainDigest) return { ok: false, reason: 'digest_mismatch' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'invalid_input' }
  }
}
