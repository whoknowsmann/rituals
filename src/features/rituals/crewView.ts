/**
 * Crew-language view models for chain-read Ritual screens (B4, B6).
 *
 * DESIGN.md rule 2: people, not addresses. The viewer is "You"; the host is
 * "Host" when someone else is looking; everyone else is numbered by roster
 * position until names exist. Addresses stay available as a short detail line.
 */
import type { PublicKey } from '@solana/web3.js'
import { shortRosterAddress } from './create/roster'

type RitualLike = Readonly<{
  status: 'Funding' | 'Active' | 'Completed' | 'Cancelled' | 'Ended'
  members: readonly PublicKey[]
  fundedMembersBitmap: number
  fundedMemberCount: number
}>

export type FundingPerson = Readonly<{ index: number; name: string; short: string; address: string; isMe: boolean; status: 'In' | 'Not in yet' }>

export function fundingPeople(account: RitualLike, me: PublicKey | null | undefined): readonly FundingPerson[] {
  return Object.freeze(account.members.map((member, index) => {
    const isMe = Boolean(me && member.equals(me))
    const name = isMe ? 'You' : index === 0 ? 'Host' : `Friend ${index + 1}`
    const address = member.toBase58()
    return Object.freeze({ index, name, short: shortRosterAddress(address), address, isMe, status: (account.fundedMembersBitmap & (1 << index)) !== 0 ? 'In' as const : 'Not in yet' as const })
  }))
}

export type RitualDetailModel = Readonly<{ kicker: string; progress: string; showClaim: boolean; myStakeNeeded: boolean }>

const KICKER: Record<RitualLike['status'], string> = {
  Funding: 'Waiting for your crew',
  Active: 'Under way',
  Completed: 'Finished',
  Cancelled: 'Called off',
  Ended: 'Ended',
}

export function ritualDetailModel(account: RitualLike, me: PublicKey | null | undefined): RitualDetailModel {
  const people = fundingPeople(account, me)
  const mine = people.find((p) => p.isMe)
  return Object.freeze({
    kicker: KICKER[account.status],
    progress: `${account.fundedMemberCount} of ${account.members.length} in`,
    showClaim: account.status === 'Active',
    myStakeNeeded: account.status === 'Funding' && mine?.status === 'Not in yet',
  })
}
