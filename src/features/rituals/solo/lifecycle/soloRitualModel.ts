import { PublicKey } from '@solana/web3.js'
import { DEMO_CAUSE, DEMO_CAUSES } from '../../../../data/rituals/demoConfig'
import type { RitualBundleRead } from '../../../../data/rituals/ritualsRpc'
import { demoWeekMinutesLabel, isDemoSpeedWindow } from '../../../../domain/rituals/schedule'
import { shortRosterAddress } from '../../create/roster'
import { weekOpensLabel } from '../../displayFormat'
import { currentWeekCell } from '../../../../components/crew/weekStripLogic'

export type SoloRitualUiState = 'funding' | 'waiting' | 'open-not-initialized' | 'claimable' | 'awaiting-witness' | 'closing' | 'resolving/settle' | 'skipped' | 'missed' | 'completed'
export type SoloWeekCell = 'done' | 'missed' | 'now' | 'current' | 'future'

/**
 * A current bundle plus bounded historical bundles. Historical reads are kept
 * outside this pure mapper so it remains deterministic and easy to exercise.
 */
export type SoloRitualBundle = RitualBundleRead & Readonly<{ history?: readonly RitualBundleRead[] }>

export type SoloRitualModel = Readonly<{
  state: SoloRitualUiState
  eventIndex: number
  weekCells: readonly SoloWeekCell[]
  canSkip: boolean
  nextOpensLabel: string | null
  destinationLabel: string
  destinationAddress: PublicKey
  witnessLabel: string | null
  amount: bigint
  showedUp: boolean
  claimStatus: 'none' | 'Pending' | 'Confirmed' | 'Questioned'
  eventStatus: 'Scheduled' | 'Claiming' | 'Resolving' | 'Settled' | 'Voided' | null
  message: string
  /** Settling a week with no check-in first needs its event account opened. */
  needsEventInit: boolean
  /** Latest settled or voided week, for the receipt link; null before any. */
  lastClosedEventIndex: number | null
  /** Chain second when the current week can be settled (resolution + 1). */
  settleOpensAt: number | null
  /**
   * One quiet line for rituals written at demo speed ("Demo speed: a week here
   * is 6.5 minutes."), read off the on-chain windows; null for real weeks.
   */
  demoSpeedNotice: string | null
}>

type EventLike = NonNullable<RitualBundleRead['event']>
type Terminal = { event: EventLike; claims: RitualBundleRead['claims'] }

const terminal = (value: RitualBundleRead): boolean => Boolean(value.event && (value.event.account.status === 'Settled' || value.event.account.status === 'Voided'))
const eventIndexOf = (value: RitualBundleRead): number => value.event?.account.eventIndex ?? -1
const short = (value: PublicKey): string => shortRosterAddress(value.toBase58())

export function labelSoloDestination(destination: PublicKey, causeTokenAccount: PublicKey | null = DEMO_CAUSE.tokenAccount): string {
  if (causeTokenAccount && destination.equals(causeTokenAccount)) return DEMO_CAUSE.label
  const cause = DEMO_CAUSES.find((entry) => entry.tokenAccount?.equals(destination))
  if (cause) return cause.label
  return `the wallet you chose · ${short(destination)}`
}

/** Demo-speed disclosure from the schedule alone (DESIGN.md rule 5); nothing for real weeks. */
export function demoSpeedNotice(schedule: readonly Readonly<{ opens: bigint; deadline: bigint }>[]): string | null {
  const first = schedule[0]
  if (!first || !isDemoSpeedWindow(Number(first.opens), Number(first.deadline))) return null
  const minutes = demoWeekMinutesLabel(schedule.map((window) => Number(window.opens)))
  return `Demo speed: a week here is ${minutes} ${minutes === '1' ? 'minute' : 'minutes'}.`
}

function latestTerminal(bundle: SoloRitualBundle): Terminal | null {
  const candidates = [bundle, ...(bundle.history ?? [])].filter(terminal)
  const latest = candidates.sort((left, right) => eventIndexOf(right) - eventIndexOf(left))[0]
  return latest?.event ? { event: latest.event, claims: latest.claims } : null
}

function outcomeOf(terminalEvent: Terminal | null, me: PublicKey | null): 'skipped' | 'missed' | 'done' | null {
  if (!terminalEvent) return null
  const { event, claims } = terminalEvent
  if (event.account.status === 'Voided' && event.account.voidReason === 'DeclaredSkip') return 'skipped'
  if (event.account.status === 'Settled') {
    const mine = me ? claims.find((entry) => entry.member.equals(me))?.account : null
    if (event.account.forfeitedTotal > 0n && mine?.status !== 'Confirmed') return 'missed'
    return 'done'
  }
  return null
}

/** Week strip from the current bundle plus history: kept ✓, missed –, now, future. Home uses it too. */
export function soloWeekCells(bundle: SoloRitualBundle, now: number): readonly SoloWeekCell[] {
  return weekCells(bundle, now)
}

function weekCells(bundle: SoloRitualBundle, now: number): readonly SoloWeekCell[] {
  const account = bundle.ritual.account
  const byIndex = new Map<number, SoloWeekCell>()
  for (const historical of [bundle, ...(bundle.history ?? [])]) {
    if (!historical.event || !terminal(historical)) continue
    const outcome = outcomeOf({ event: historical.event, claims: historical.claims }, account.members[0] ?? null)
    if (outcome) byIndex.set(historical.event.account.eventIndex, outcome === 'missed' ? 'missed' : 'done')
  }
  return Object.freeze(account.schedule.map((window, index) => byIndex.get(index) ?? (index === account.currentEventIndex && account.status === 'Active' ? currentWeekCell(Number(window.opens), Number(window.deadline), now) : 'future')))
}

function modelState(bundle: SoloRitualBundle, now: number, me: PublicKey | null): { state: SoloRitualUiState; showedUp: boolean; claimStatus: SoloRitualModel['claimStatus']; message: string } {
  const account = bundle.ritual.account
  if (account.status === 'Funding') return { state: 'funding', showedUp: false, claimStatus: 'none', message: 'This solo ritual is waiting for funding.' }
  if (account.status === 'Completed') return { state: 'completed', showedUp: false, claimStatus: 'none', message: 'This ritual is complete.' }

  const current = bundle.event
  const recent = latestTerminal(bundle)
  const recentOutcome = outcomeOf(recent, me)
  const schedule = account.schedule[account.currentEventIndex]
  // Last week's result (skipped / missed) shows only until this week opens;
  // after that the user must be able to stamp this week.
  const beforeThisWeek = !schedule || now < Number(schedule.opens)
  if (beforeThisWeek && account.skipDeclared && account.skipEventIndex === account.currentEventIndex - 1) return { state: 'skipped', showedUp: false, claimStatus: 'none', message: 'This week was skipped. Your stake comes back.' }
  if (beforeThisWeek && recent && recent.event.account.eventIndex === account.currentEventIndex - 1 && recentOutcome === 'skipped') return { state: 'skipped', showedUp: false, claimStatus: 'none', message: 'This week was skipped. Your stake comes back.' }
  if (beforeThisWeek && recent && recent.event.account.eventIndex === account.currentEventIndex - 1 && recentOutcome === 'missed') return { state: 'missed', showedUp: false, claimStatus: 'none', message: "That's a week, not a verdict." }

  if (!schedule) return { state: 'completed', showedUp: false, claimStatus: 'none', message: 'This ritual is complete.' }
  const resolved = now > Number(schedule.resolution)
  if (!current) {
    if (now < Number(schedule.opens)) return { state: 'waiting', showedUp: false, claimStatus: 'none', message: `Next week opens ${weekOpensLabel(Number(schedule.opens), now)}.` }
    if (now <= Number(schedule.deadline)) return { state: 'open-not-initialized', showedUp: false, claimStatus: 'none', message: 'This week is open.' }
    return resolved
      ? { state: 'resolving/settle', showedUp: false, claimStatus: 'none', message: 'This week is ready to settle.' }
      : { state: 'closing', showedUp: false, claimStatus: 'none', message: 'This week is closing.' }
  }

  const mine = me ? bundle.claims.find((entry) => entry.member.equals(me))?.account : null
  const claimStatus = mine?.status ?? 'none'
  if (current.account.status === 'Voided' && current.account.voidReason === 'DeclaredSkip') return { state: 'skipped', showedUp: false, claimStatus, message: 'This week was skipped. Your stake comes back.' }
  if (current.account.status === 'Settled') {
    const missed = current.account.forfeitedTotal > 0n && mine?.status !== 'Confirmed'
    return missed ? { state: 'missed', showedUp: false, claimStatus, message: "That's a week, not a verdict." } : { state: 'completed', showedUp: mine?.status === 'Confirmed', claimStatus, message: 'This week is settled.' }
  }
  // The program finalizes only when now > window.resolution; offering it earlier fails on chain.
  if (current.account.status === 'Resolving' || now > Number(current.account.window.deadline)) {
    return now > Number(current.account.window.resolution)
      ? { state: 'resolving/settle', showedUp: mine?.status === 'Confirmed', claimStatus, message: 'This week is ready to settle.' }
      : { state: 'closing', showedUp: mine?.status === 'Confirmed', claimStatus, message: 'This week is closing.' }
  }
  if (now < Number(current.account.window.opens)) return { state: 'waiting', showedUp: false, claimStatus, message: `Next week opens ${weekOpensLabel(Number(current.account.window.opens), now)}.` }
  if (mine?.status === 'Pending') return { state: 'awaiting-witness', showedUp: false, claimStatus, message: 'Waiting for your witness to confirm.' }
  return { state: 'claimable', showedUp: mine?.status === 'Confirmed', claimStatus, message: mine?.status === 'Confirmed' ? 'You showed up.' : 'This week is open.' }
}

export function soloRitualModel(bundle: SoloRitualBundle, now: number, me: PublicKey | null): SoloRitualModel {
  const account = bundle.ritual.account
  const schedule = account.schedule[account.currentEventIndex]
  const mapped = modelState(bundle, now, me)
  const canSkip = account.schedule.length > 1 && account.status === 'Active' && !account.skipDeclared && Boolean(schedule) && now < Number(schedule.opens)
  const witness = account.witness ? (account.witness.equals(me ?? PublicKey.default) ? 'you' : `your friend · ${short(account.witness)}`) : null
  return Object.freeze({
    state: mapped.state,
    eventIndex: account.currentEventIndex,
    weekCells: weekCells(bundle, now),
    canSkip,
    nextOpensLabel: schedule ? weekOpensLabel(Number(schedule.opens), now) : null,
    destinationLabel: labelSoloDestination(account.forfeitDestination),
    destinationAddress: account.forfeitDestination,
    witnessLabel: witness,
    amount: account.perEventAllocation,
    showedUp: mapped.showedUp,
    claimStatus: mapped.claimStatus,
    eventStatus: bundle.event?.account.status ?? null,
    message: mapped.message,
    needsEventInit: mapped.state === 'resolving/settle' && !bundle.event,
    lastClosedEventIndex: latestTerminal(bundle)?.event.account.eventIndex ?? null,
    settleOpensAt: schedule ? Number(schedule.resolution) + 1 : null,
    demoSpeedNotice: demoSpeedNotice(account.schedule),
  })
}
