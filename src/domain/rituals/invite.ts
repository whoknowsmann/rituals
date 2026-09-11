import { PublicKey } from '@solana/web3.js'
import { digestRulesSync, parseLockedRitualRules, type LockedRitualRules } from './draft'
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
function snapshot(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!plain(value)) return null
  const actualKeys = Reflect.ownKeys(value)
  if (actualKeys.some((key) => typeof key !== 'string')) return null
  const actual = (actualKeys as string[]).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) return null
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null
    // Snapshot descriptors for consistency; this is not blanket Proxy immunity.
    result[key] = descriptor.value
  }
  return result
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
    const inviteValue = snapshot(invite, INVITE_KEYS)
    const onchainValue = snapshot(onchain, ACCOUNT_KEYS)
    if (!inviteValue || !onchainValue) return { ok: false, reason: 'invalid_input' }
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
    let normalizedRules: LockedRitualRules
    try { normalizedRules = parseLockedRitualRules(rules) } catch { return { ok: false, reason: 'invalid_rules' } }
    if (cluster !== DEVNET_CLUSTER || normalizedRules.cluster !== DEVNET_CLUSTER || onchainCluster !== DEVNET_CLUSTER) return { ok: false, reason: 'cluster_mismatch' }
    if (ritual !== account) return { ok: false, reason: 'ritual_mismatch' }
    const computed = digestRulesSync(normalizedRules)
    if (computed !== inviteDigest || computed !== onchainDigest) return { ok: false, reason: 'digest_mismatch' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'invalid_input' }
  }
}
