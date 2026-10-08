import type { AccountInfo, PublicKey } from '@solana/web3.js'
import { decodeRitualEvent, type RitualAccountView, type RitualEventAccountView } from '../../../data/rituals/accounts'
import { eventPda } from '../../../data/rituals/pdas'
import { currentWeekCell } from '../../../components/crew/weekStripLogic'
import type { RitualBundleRead } from '../../../data/rituals/ritualsRpc'
import { soloWeekCells, type SoloRitualBundle } from '../solo/lifecycle/soloRitualModel'

export type SoloWeekOutcome = 'done' | 'missed' | 'skipped'
export type HomeWeekCell = SoloWeekOutcome | 'closed' | 'now' | 'current' | 'future' | 'skip-pending'
type SoloAccount = Readonly<{ kind: 'Group' | 'Solo'; status: string; currentEventIndex: number; schedule: readonly unknown[]; skipDeclared?: boolean; skipEventIndex?: number; completedAt?: bigint }>

/** Closed weeks of a solo ritual: every week before the current one, or all of them once it completes. */
export function closedWeekCount(account: SoloAccount): number {
  if (account.kind !== 'Solo') return 0
  const closed = account.status === 'Completed' ? account.schedule.length : account.currentEventIndex
  return Math.max(0, Math.min(closed, 16))
}

/** A solo week's result from its event alone: a forfeit means nobody checked in. A declared skip is neither kept nor missed. */
export function eventOutcome(event: Pick<RitualEventAccountView, 'status' | 'forfeitedTotal' | 'voidReason'>): SoloWeekOutcome | null {
  if (event.status === 'Settled') return event.forfeitedTotal > 0n ? 'missed' : 'done'
  if (event.status === 'Voided') return event.voidReason === 'DeclaredSkip' ? 'skipped' : 'done' // unresolved claim: the stake came back
  return null
}

/**
 * Home's week strip. A closed week shows kept / missed once its result is
 * read, and a neutral "closed" mark until then (or if the read failed),
 * never a guessed tick.
 */
export function soloHomeCells(account: SoloAccount, outcomes: ReadonlyMap<number, SoloWeekOutcome> | undefined, now: number | null = null, bundle?: RitualBundleRead): HomeWeekCell[] {
  const closed = closedWeekCount(account)
  if (bundle && now !== null) return soloWeekCells(bundle, now).map((cell, index) => {
    if (index < closed) return outcomes?.get(index) ?? cell
    if (account.skipDeclared && account.skipEventIndex === index) return cell === 'closed' ? 'skipped' : 'skip-pending'
    return cell
  })
  return account.schedule.map((_window, index) => {
    if (index < closed) return outcomes?.get(index) ?? 'closed'
    if (account.status === 'Active' && index === account.currentEventIndex) {
      if (account.skipDeclared && account.skipEventIndex === index) return 'skip-pending'
      const window = _window as { opens?: bigint; deadline?: bigint } | null
      return now !== null && window?.opens !== undefined && window?.deadline !== undefined
        ? currentWeekCell(Number(window.opens), Number(window.deadline), now) : 'current'
    }
    return 'future'
  })
}

/** Reuse detail/receipt's confirmed reads; never include projected week cells. */
export function settledSoloOutcomes(bundle: SoloRitualBundle): ReadonlyMap<number, SoloWeekOutcome> {
  const outcomes = new Map<number, SoloWeekOutcome>()
  for (const read of [bundle, ...(bundle.history ?? [])]) {
    if (!read.event) continue
    const outcome = eventOutcome(read.event.account)
    if (outcome) outcomes.set(read.event.account.eventIndex, outcome)
  }
  return outcomes
}

type GetMany = (keys: PublicKey[]) => Promise<readonly (AccountInfo<Buffer> | null)[]>

/**
 * Reads every closed week of every solo ritual in as few requests as
 * possible (one per 100 weeks), so Home never fans out a dozen RPC calls
 * against the rate-limited public devnet endpoint (2026-10-04: a per-week
 * fan-out took ~30 s and most reads failed).
 */
export async function readSoloWeekOutcomes(
  getMany: GetMany,
  programId: PublicKey,
  rituals: readonly Readonly<{ address: PublicKey; account: RitualAccountView }>[],
): Promise<Map<string, Map<number, SoloWeekOutcome>>> {
  // Weeks an early end settled carry the ended ritual's timestamp (see decodeRitualEvent).
  const wanted = rituals.flatMap((ritual) => Array.from({ length: closedWeekCount(ritual.account) }, (_, index) => ({ ritual: ritual.address, account: ritual.account, index, pda: eventPda(ritual.address, index, programId), endedAt: ritual.account.status === 'Ended' ? ritual.account.completedAt : undefined })))
  const result = new Map<string, Map<number, SoloWeekOutcome>>()
  // An empty map means the read finished with no closed weeks, not "loading".
  for (const ritual of rituals) if (ritual.account.kind === 'Solo') result.set(ritual.address.toBase58(), new Map())
  for (let start = 0; start < wanted.length; start += 100) {
    const chunk = wanted.slice(start, start + 100)
    const infos = await getMany(chunk.map((entry) => entry.pda[0]))
    chunk.forEach((entry, position) => {
      const info = infos[position]
      if (!info) return
      try {
        const event = decodeRitualEvent({ owner: info.owner, data: info.data }, programId, entry.endedAt)
        const window = entry.account.schedule[entry.index]
        if (info.executable || !event.ritual.equals(entry.ritual) || event.eventIndex !== entry.index || event.memberCount !== 1 || event.bump !== entry.pda[1]
          || event.window.opens !== window.opens || event.window.deadline !== window.deadline || event.window.resolution !== window.resolution
          || event.eventPool !== entry.account.perEventAllocation) return
        const outcome = eventOutcome(event)
        if (!outcome) return
        const id = entry.ritual.toBase58()
        result.get(id)!.set(entry.index, outcome)
      } catch { /* unreadable week: stays "closed" */ }
    })
  }
  return result
}
