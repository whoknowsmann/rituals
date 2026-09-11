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
  const actual = Object.getOwnPropertyNames(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
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
  if (!plain(invite) || !plain(onchain) || !exact(invite, INVITE_KEYS) || !exact(onchain, ACCOUNT_KEYS)) return { ok: false, reason: 'invalid_input' }
  if (invite.domain !== RITUAL_INVITE_DOMAIN) return { ok: false, reason: 'wrong_domain' }
  if (invite.schemaVersion !== RITUAL_INVITE_SCHEMA_VERSION) return { ok: false, reason: 'unsupported_schema' }
  if (!digest(invite.ruleDigest) || !digest(onchain.ruleDigest)) return { ok: false, reason: 'invalid_input' }
  const ritual = address(invite.ritual)
  const account = address(onchain.address)
  if (!ritual || !account) return { ok: false, reason: 'invalid_input' }
  try { assertValidLockedRitualRules(invite.rules) } catch { return { ok: false, reason: 'invalid_rules' } }
  if (invite.cluster !== DEVNET_CLUSTER || invite.rules.cluster !== DEVNET_CLUSTER || onchain.cluster !== DEVNET_CLUSTER) return { ok: false, reason: 'cluster_mismatch' }
  if (ritual !== account) return { ok: false, reason: 'ritual_mismatch' }
  let computed: RuleDigest
  try { computed = digestRulesSync(invite.rules) } catch { return { ok: false, reason: 'invalid_rules' } }
  if (computed !== invite.ruleDigest || computed !== onchain.ruleDigest) return { ok: false, reason: 'digest_mismatch' }
  return { ok: true }
}
