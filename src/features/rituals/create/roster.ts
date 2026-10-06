import { PublicKey } from '@solana/web3.js'
import type { PublicKeyText } from '../../../domain/rituals/types'

export type RosterRow = Readonly<{ index: number; address: PublicKeyText; role: 'Host' | 'Member'; name: string; funding: 'Not in yet' }>
export type RosterValidation =
  | Readonly<{ ok: true; value: readonly PublicKeyText[] }>
  | Readonly<{ ok: false; errors: Readonly<Record<string, string>> }>

export interface MemberRosterInput {
  readonly hostAddress: unknown
  readonly memberCount: unknown
  readonly friendAddresses: unknown
}

function canonical(value: unknown): PublicKeyText | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const key = new PublicKey(trimmed)
    if (key.equals(PublicKey.default) || key.toBase58() !== trimmed) return null
    return trimmed as PublicKeyText
  } catch { return null }
}

/** Addresses normalize only surrounding whitespace; the resulting value must round-trip exactly as base58. */
export function validateMemberRoster(input: MemberRosterInput): RosterValidation {
  const errors: Record<string, string> = {}
  const host = canonical(input?.hostAddress)
  if (!host) errors.host = 'Connect a valid non-default host wallet.'
  const count = typeof input?.memberCount === 'number' && Number.isSafeInteger(input.memberCount)
    ? input.memberCount
    : typeof input?.memberCount === 'string' && /^\d+$/.test(input.memberCount) ? Number(input.memberCount) : NaN
  if (!Number.isSafeInteger(count) || count < 2 || count > 6) errors.memberCount = 'Member count must be between 2 and 6.'
  if (!Array.isArray(input?.friendAddresses)) {
    errors.roster = 'Friend wallet rows are required.'
    return { ok: false, errors }
  }
  const friends = input.friendAddresses
  if (Number.isSafeInteger(count) && friends.length !== count - 1) errors.roster = `Enter exactly ${count - 1} friend wallet${count - 1 === 1 ? '' : 's'}.`
  const seen = new Set<string>(host ? [host] : [])
  const values: PublicKeyText[] = host ? [host] : []
  friends.forEach((raw, index) => {
    const address = canonical(raw)
    if (!address) errors[`friend${index}`] = 'Enter a canonical, non-default Solana wallet address.'
    else if (seen.has(address)) errors[`friend${index}`] = address === host ? 'Friend wallet cannot match the host.' : 'Friend wallets must be unique.'
    else { seen.add(address); values.push(address) }
  })
  if (Object.keys(errors).length > 0 || values.length !== count) return { ok: false, errors }
  return { ok: true, value: Object.freeze(values) }
}

export function shortRosterAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 5)}…${address.slice(-5)}`
}

export function reconcileRosterContext(previousHost: string, nextHost: string, previousFriendCount: number, nextFriendCount: number, friendAddresses: readonly string[]): Readonly<{ friendAddresses: readonly string[]; message: string | null; requiresReentry: boolean }> {
  const hostChanged = previousHost.length > 0 && previousHost !== nextHost
  const countChanged = previousFriendCount !== nextFriendCount
  const requiresReentry = hostChanged || countChanged
  return Object.freeze({
    friendAddresses: Object.freeze(requiresReentry ? Array.from({ length: nextFriendCount }, () => '') : [...friendAddresses]),
    message: hostChanged
      ? 'Host wallet changed. Re-enter friend wallets for this roster.'
      : countChanged ? 'Ritual member count changed. Re-enter friend wallets for this roster.' : null,
    requiresReentry,
  })
}

export function fundingLobbyCta(status: 'ready' | 'not-deployed' | 'unsupported-cluster'): string {
  if (status === 'ready') return 'Onchain creation wiring next'
  if (status === 'not-deployed') return 'Devnet deployment pending'
  return 'Rituals unavailable on selected cluster'
}

export interface FundingLobbyInput {
  readonly members: readonly string[]
  readonly memberTotalStake: string
  readonly activationFee: string
  readonly feePayerMode: 'HOST' | 'SPLIT'
}
export interface FundingLobbyModel {
  readonly rows: readonly RosterRow[]
  readonly progress: string
  readonly activation: string
  readonly stake: string
  readonly fee: string
}

export function buildFundingLobbyModel(input: FundingLobbyInput): FundingLobbyModel {
  // People, not addresses (DESIGN.md rule 2): the host is "You"; friends are
  // numbered by roster position until names exist. The address stays on the row
  // for the copy-on-tap detail.
  const rows = input.members.map((address, index) => ({ index, address: address as PublicKeyText, role: index === 0 ? 'Host' as const : 'Member' as const, name: index === 0 ? 'You' : `Friend ${index + 1}`, funding: 'Not in yet' as const }))
  const count = input.members.length
  return Object.freeze({
    rows: Object.freeze(rows),
    progress: `0 of ${count} in`,
    activation: 'Starts once everyone has put in their stake',
    stake: `${input.memberTotalStake} tSKR per member`,
    fee: input.feePayerMode === 'HOST' ? `Host pays activation fee · ${input.activationFee} tSKR` : `Split activation fee across members · ${input.activationFee} tSKR`,
  })
}
