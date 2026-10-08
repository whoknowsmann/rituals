import type { AccountInfo, PublicKey } from '@solana/web3.js'
import { decodeRitualEvent, type RitualEventAccountView } from '../../../data/rituals/accounts'
import { eventPda } from '../../../data/rituals/pdas'
import { currentWeekCell } from '../../../components/crew/weekStripLogic'

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
export function soloHomeCells(account: SoloAccount, outcomes: ReadonlyMap<number, SoloWeekOutcome> | undefined, now: number | null = null): HomeWeekCell[] {
  const closed = closedWeekCount(account)
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
  rituals: readonly Readonly<{ address: PublicKey; account: SoloAccount }>[],
): Promise<Map<string, Map<number, SoloWeekOutcome>>> {
  // Weeks an early end settled carry the ended ritual's timestamp (see decodeRitualEvent).
  const wanted = rituals.flatMap((ritual) => Array.from({ length: closedWeekCount(ritual.account) }, (_, index) => ({ ritual: ritual.address, index, key: eventPda(ritual.address, index, programId)[0], endedAt: ritual.account.status === 'Ended' ? ritual.account.completedAt : undefined })))
  const result = new Map<string, Map<number, SoloWeekOutcome>>()
  for (let start = 0; start < wanted.length; start += 100) {
    const chunk = wanted.slice(start, start + 100)
    const infos = await getMany(chunk.map((entry) => entry.key))
    chunk.forEach((entry, position) => {
      const info = infos[position]
      if (!info) return
      try {
        const outcome = eventOutcome(decodeRitualEvent({ owner: info.owner, data: info.data }, programId, entry.endedAt))
        if (!outcome) return
        const id = entry.ritual.toBase58()
        if (!result.has(id)) result.set(id, new Map())
        result.get(id)!.set(entry.index, outcome)
      } catch { /* unreadable week: stays "closed" */ }
    })
  }
  return result
}
