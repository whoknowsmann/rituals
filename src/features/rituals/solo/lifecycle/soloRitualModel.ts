import { PublicKey } from '@solana/web3.js'
import { DEMO_CAUSE, DEMO_CAUSES } from '../../../../data/rituals/demoConfig'
import type { RitualBundleRead } from '../../../../data/rituals/ritualsRpc'
import { demoWeekMinutesLabel, isDemoSpeedWindow } from '../../../../domain/rituals/schedule'
import { shortRosterAddress } from '../../create/roster'
import { stampTimeLeftLabel, weekOpensLabel } from '../../displayFormat'
import { currentWeekCell } from '../../../../components/crew/weekStripLogic'

export type SoloRitualUiState = 'funding' | 'waiting' | 'open-not-initialized' | 'claimable' | 'awaiting-witness' | 'closing' | 'resolving/settle' | 'skipped' | 'missed' | 'completed' | 'ended'
export type SoloWeekCell = 'done' | 'missed' | 'closed' | 'now' | 'current' | 'future'

/**
 * declare_skip only targets the week the chain is on, and only while
 * now < that week's opens. Offer it only when an approval can still land
 * with a minute to spare; at demo speed every skippable week opens within
 * seconds (60 s lead, 5 s between weeks), so it is never offered there.
 */
export const SKIP_MIN_LEAD_SECONDS = 60

/**
 * A current bundle plus bounded historical bundles. Historical reads are kept
 * outside this pure mapper so it remains deterministic and easy to exercise.
 */
export type SoloRitualBundle = RitualBundleRead & Readonly<{ history?: readonly RitualBundleRead[] }>

export type SoloRitualModel = Readonly<{
  state: SoloRitualUiState
  eventIndex: number
  /** Chain cursor, independent of the week presented after time away. */
  settlementEventIndex: number | null
  catchupLine: string | null
  stampBlocked: boolean
  finishedOutcome: 'done' | 'missed' | 'skipped' | null
  weekCells: readonly SoloWeekCell[]
  /** Skip the current week (always the week `eventIndex`, which has not opened). */
  canSkip: boolean
  /**
   * The current week is a declared skip. The program voids it at settlement
   * (stake back) even if it is stamped, so it is never offered for stamping.
   */
  weekSkipped: boolean
  nextOpensLabel: string | null
  stampTimeLeftLabel: string | null
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
  lastClosedOutcome: 'skipped' | 'missed' | 'done' | null
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
const currentWeekSkipped = (account: SoloRitualBundle['ritual']['account']): boolean =>
  account.status === 'Active' && account.skipDeclared && account.skipEventIndex === account.currentEventIndex && account.currentEventIndex < account.schedule.length

export function labelSoloDestination(destination: PublicKey, causeTokenAccount: PublicKey | null = DEMO_CAUSE.tokenAccount, owner: PublicKey | null = null): string {
  if (causeTokenAccount && destination.equals(causeTokenAccount)) return DEMO_CAUSE.label
  const cause = DEMO_CAUSES.find((entry) => entry.tokenAccount?.equals(destination))
  if (cause) return cause.label
  return owner ? `the wallet you chose · ${short(owner)}` : 'the wallet you chose'
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

/**
 * Week strip from the current bundle plus history: kept ✓, missed ✕, now,
 * future. A skipped week is neither kept nor missed: neutral once closed, and
 * never NOW while it runs.
 */
export function soloWeekCells(bundle: SoloRitualBundle, now: number): readonly SoloWeekCell[] {
  return weekCells(bundle, now)
}

function weekCells(bundle: SoloRitualBundle, now: number): readonly SoloWeekCell[] {
  const account = bundle.ritual.account
  const byIndex = new Map<number, SoloWeekCell>()
  for (const historical of [bundle, ...(bundle.history ?? [])]) {
    if (!historical.event || !terminal(historical)) continue
    const outcome = outcomeOf({ event: historical.event, claims: historical.claims }, account.members[0] ?? null)
    if (outcome) byIndex.set(historical.event.account.eventIndex, outcome === 'missed' ? 'missed' : outcome === 'skipped' ? 'closed' : 'done')
  }
  const displayed = presentationEventIndex(account, now)
  return Object.freeze(account.schedule.map((window, index) => byIndex.get(index)
    ?? (index < account.currentEventIndex || account.status === 'Completed' ? 'closed'
      : account.status === 'Active' && now > Number(window.deadline)
        ? account.skipDeclared && account.skipEventIndex === index ? 'closed'
          : index === account.currentEventIndex && bundle.claims.some((entry) => entry.member.equals(account.creator) && entry.account?.status === 'Confirmed') ? 'done' : 'missed'
        : index === displayed && account.status === 'Active' ? (account.skipDeclared && account.skipEventIndex === index ? 'current' : currentWeekCell(Number(window.opens), Number(window.deadline), now)) : 'future')))
}

/** Presentation follows the schedule; transactions must still use the chain cursor. */
export function presentationEventIndex(account: SoloRitualBundle['ritual']['account'], now: number): number {
  if (account.status !== 'Active') return account.currentEventIndex
  const last = account.schedule[account.schedule.length - 1]
  if (last && now > Number(last.deadline)) return account.schedule.length
  let index = account.currentEventIndex
  account.schedule.forEach((window, candidate) => { if (now >= Number(window.opens)) index = Math.max(index, candidate) })
  return index
}

export function catchupClosingLine(account: SoloRitualBundle['ritual']['account'], now: number): string | null {
  if (account.status !== 'Active') return null
  const expired = account.schedule.filter((window) => now > Number(window.deadline)).length
  const first = account.currentEventIndex + 1
  return expired < first ? null : expired === first ? 'Closing…' : `Closing weeks ${first}–${expired}…`
}

function modelState(bundle: SoloRitualBundle, now: number, me: PublicKey | null): { state: SoloRitualUiState; showedUp: boolean; claimStatus: SoloRitualModel['claimStatus']; message: string } {
  const account = bundle.ritual.account
  if (account.status === 'Funding') return { state: 'funding', showedUp: false, claimStatus: 'none', message: 'This solo ritual is waiting for funding.' }
  if (account.status === 'Completed') return { state: 'completed', showedUp: false, claimStatus: 'none', message: 'This ritual is complete.' }
  // Ended early: nothing left to stamp or settle; settled weeks keep their receipts.
  if (account.status === 'Ended') return { state: 'ended', showedUp: false, claimStatus: 'none', message: 'Ended' }

  const current = bundle.event
  const recent = latestTerminal(bundle)
  const recentOutcome = outcomeOf(recent, me)
  const schedule = account.schedule[account.currentEventIndex]
  const mine = me ? bundle.claims.find((entry) => entry.member.equals(me))?.account : null
  const claimStatus = mine?.status ?? 'none'
  // A declared skip voids this week at settlement whatever happens in it, so
  // it shows as skipped (no HOLD) until it can be settled.
  if (schedule && currentWeekSkipped(account)) {
    return now > Number(schedule.resolution)
      ? { state: 'resolving/settle', showedUp: false, claimStatus, message: 'This week is ready to settle.' }
      : { state: 'skipped', showedUp: false, claimStatus, message: 'This week is skipped. Your stake comes back.' }
  }
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

export function soloRitualModel(bundle: SoloRitualBundle, now: number, me: PublicKey | null, destinationOwner: PublicKey | null = null): SoloRitualModel {
  const account = bundle.ritual.account
  const eventIndex = presentationEventIndex(account, now)
  const presented = eventIndex === account.currentEventIndex ? bundle : {
    ...bundle, ritual: { ...bundle.ritual, account: { ...account, currentEventIndex: eventIndex } }, event: null, claims: [],
  }
  const schedule = account.schedule[eventIndex]
  const chainWindow = account.schedule[account.currentEventIndex]
  const mapped = account.status === 'Active' && eventIndex === account.schedule.length
    ? { state: 'completed' as const, showedUp: false, claimStatus: 'none' as const, message: 'This ritual is complete.' }
    : modelState(presented, now, me)
  const cells = weekCells(bundle, now)
  const lastCell = cells[cells.length - 1]
  const weekSkipped = currentWeekSkipped(presented.ritual.account)
  const canSkip = eventIndex === account.currentEventIndex && account.schedule.length > 1 && account.status === 'Active' && !account.skipDeclared && Boolean(schedule)
    && !isDemoSpeedWindow(Number(schedule.opens), Number(schedule.deadline)) && now + SKIP_MIN_LEAD_SECONDS < Number(schedule.opens)
  const witness = account.witness ? (account.witness.equals(me ?? PublicKey.default) ? 'you' : `your friend · ${short(account.witness)}`) : null
  return Object.freeze({
    state: mapped.state,
    eventIndex,
    settlementEventIndex: account.status === 'Active' && chainWindow && now > Number(chainWindow.resolution) ? account.currentEventIndex : null,
    catchupLine: catchupClosingLine(account, now),
    stampBlocked: eventIndex !== account.currentEventIndex,
    finishedOutcome: mapped.state !== 'completed' ? null : lastCell === 'done' || lastCell === 'missed' ? lastCell
      : account.skipDeclared && account.skipEventIndex === cells.length - 1 ? 'skipped' : null,
    weekCells: cells,
    canSkip,
    weekSkipped,
    nextOpensLabel: account.status === 'Active' && schedule && !weekSkipped && now < Number(schedule.opens)
      ? weekOpensLabel(Number(schedule.opens), now, isDemoSpeedWindow(Number(schedule.opens), Number(schedule.deadline))) : null,
    stampTimeLeftLabel: schedule && !mapped.showedUp && (mapped.state === 'claimable' || mapped.state === 'open-not-initialized')
      ? stampTimeLeftLabel(Number(schedule.deadline), now, isDemoSpeedWindow(Number(schedule.opens), Number(schedule.deadline))) : null,
    destinationLabel: labelSoloDestination(account.forfeitDestination, undefined, destinationOwner),
    destinationAddress: account.forfeitDestination,
    witnessLabel: witness,
    amount: account.perEventAllocation,
    showedUp: mapped.showedUp,
    claimStatus: mapped.claimStatus,
    eventStatus: presented.event?.account.status ?? null,
    message: mapped.message,
    needsEventInit: account.status === 'Active' && Boolean(chainWindow) && now > Number(chainWindow.resolution) && !bundle.event,
    lastClosedEventIndex: latestTerminal(bundle)?.event.account.eventIndex ?? null,
    lastClosedOutcome: outcomeOf(latestTerminal(bundle), account.members[0] ?? null),
    settleOpensAt: schedule ? Number(schedule.resolution) + 1 : null,
    demoSpeedNotice: demoSpeedNotice(account.schedule),
  })
}
