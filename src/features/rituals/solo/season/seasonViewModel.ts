import type { PublicKey } from '@solana/web3.js'
import type { EventWindowView, RitualAccountView } from '../../../../data/rituals/accounts'

export type SeasonWindow = Pick<EventWindowView, 'opens' | 'deadline' | 'resolution'>

/** Select the open window, or the nearest valid edge when no window is open. */
export function seasonWindowIndex(schedule: readonly SeasonWindow[], nowSeconds: number): number {
  if (schedule.length === 0) return 0
  if (!Number.isFinite(nowSeconds)) return 0
  let selected = 0
  for (let index = 0; index < schedule.length; index += 1) {
    if (schedule[index].opens <= BigInt(Math.floor(nowSeconds))) selected = index
    else break
  }
  return selected
}

export function seasonCountForNow(checkedInCount: readonly number[], schedule: readonly SeasonWindow[], nowSeconds: number): Readonly<{ index: number; count: number }> {
  const index = seasonWindowIndex(schedule, nowSeconds)
  const count = checkedInCount[index]
  return Object.freeze({ index, count: Number.isSafeInteger(count) && count >= 0 ? count : 0 })
}

export type SeasonRitualStatus = 'not-joined' | 'funding' | 'active' | 'completed' | 'cancelled'
type SeasonRitual = Readonly<{ season: PublicKey | null; status: RitualAccountView['status'] }>

export function seasonRitualStatus(rituals: readonly SeasonRitual[], seasonAddress: PublicKey): SeasonRitualStatus {
  const match = rituals.find((ritual) => ritual.season?.equals(seasonAddress) ?? false)
  if (!match) return 'not-joined'
  return match.status.toLowerCase() as Exclude<SeasonRitualStatus, 'not-joined'>
}

export function seasonStatusLabel(status: SeasonRitualStatus): string {
  switch (status) {
    case 'funding': return 'Your ritual is getting ready'
    case 'active': return "You're in"
    case 'completed': return 'You finished this season'
    case 'cancelled': return 'Your ritual was called off'
    default: return 'Your ritual is not joined'
  }
}

export function seasonParticipantLine(participantCount: number): string {
  const count = Number.isSafeInteger(participantCount) && participantCount >= 0 ? participantCount : 0
  return count === 0 ? '0 people in · Be the first' : count === 1 ? '1 person in' : `${count} people in`
}

export interface SeasonViewModel {
  readonly title: string
  readonly participantLine: string
  readonly checkedInLine: string
  readonly dates: string
  readonly currentWindowIndex: number
  readonly status: SeasonRitualStatus
  readonly statusLabel: string
  /** The program only accepts a Season join before its first week opens. */
  readonly joinOpen: boolean
}

export function buildSeasonViewModel(input: Readonly<{
  title: string
  season: Readonly<{ startAt: bigint; endAt: bigint; schedule: readonly SeasonWindow[]; participantCount: number; checkedInCount: readonly number[] }>
  seasonAddress: PublicKey
  rituals: readonly SeasonRitual[]
  nowSeconds: number
}>): SeasonViewModel {
  const current = seasonCountForNow(input.season.checkedInCount, input.season.schedule, input.nowSeconds)
  const participantCount = Number.isSafeInteger(input.season.participantCount) && input.season.participantCount >= 0 ? input.season.participantCount : 0
  const date = (seconds: bigint) => new Date(Number(seconds) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const status = seasonRitualStatus(input.rituals, input.seasonAddress)
  const firstOpens = input.season.schedule[0]?.opens
  const joinOpen = firstOpens !== undefined && BigInt(Math.floor(input.nowSeconds)) < firstOpens
  return Object.freeze({
    title: input.title,
    participantLine: seasonParticipantLine(participantCount),
    checkedInLine: `${current.count} checked in this week`,
    dates: `${date(input.season.startAt)} – ${date(input.season.endAt)}`,
    currentWindowIndex: current.index,
    status,
    statusLabel: status === 'not-joined' && !joinOpen ? 'Joining has closed for this Season' : seasonStatusLabel(status),
    joinOpen,
  })
}
