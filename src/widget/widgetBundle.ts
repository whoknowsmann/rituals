// Foreground adapter only. The task handler must never import this module.
import { soloRitualModel, type SoloRitualBundle } from '../features/rituals/solo/lifecycle/soloRitualModel'
import type { WidgetOutcome, WidgetStatus } from './widgetModel'

export type WidgetBundle = Readonly<{ address: string; bundle: SoloRitualBundle }>
export type WidgetWeekOutcomes = ReadonlyMap<string, ReadonlyMap<number, 'done' | 'missed'>>

/** Reuses the app's lifecycle and Home's closed-week outcome convention. */
export function widgetOutcomeFromBundle({ address, bundle }: WidgetBundle, now: number, homeOutcomes?: ReadonlyMap<number, 'done' | 'missed'>): WidgetOutcome | null {
  const account = bundle.ritual.account
  if (account.kind !== 'Solo' || (account.status !== 'Active' && account.status !== 'Completed') || !account.schedule.length) return null
  const index = Math.min(account.currentEventIndex, account.schedule.length - 1)
  const closedCount = account.status === 'Completed' ? account.schedule.length : account.currentEventIndex
  const outcomes = new Map(homeOutcomes)
  for (const read of [...(bundle.history ?? []), bundle]) {
    if (!read.event) continue
    const event = read.event.account
    if (event.status === 'Settled') outcomes.set(event.eventIndex, event.forfeitedTotal > 0n ? 'missed' : 'done')
    if (event.status === 'Voided') outcomes.set(event.eventIndex, 'done')
  }
  // An incomplete history is not zero kept/missed. Retain the previous snapshot.
  for (let week = 0; week < closedCount; week += 1) if (!outcomes.has(week)) return null
  const model = soloRitualModel(bundle, now, account.members[0] ?? null)
  const window = account.schedule[index]
  let status: WidgetStatus = model.showedUp ? 'stamped'
    : model.state === 'awaiting-witness' ? 'awaiting-witness'
    : model.state === 'closing' || model.state === 'resolving/settle' ? 'closing'
    : model.state === 'skipped' ? 'skipped'
    : now < Number(window.opens) ? 'waiting' : 'open'
  const previous = outcomes.get(account.currentEventIndex - 1)
  if (status === 'waiting' && previous === 'missed') status = 'missed'
  // A terminal current event can arrive before the ritual's index advances.
  // Do not offer another stamp or treat this as a finished multi-week ritual.
  const currentEvent = bundle.event?.account
  if (currentEvent?.eventIndex === account.currentEventIndex) {
    if (currentEvent.status === 'Settled') status = currentEvent.forfeitedTotal > 0n ? 'missed-current' : 'stamped'
    if (currentEvent.status === 'Voided') status = 'skipped-current'
  }
  if (account.status === 'Completed') {
    status = outcomes.get(index) === 'missed' ? 'finished-missed' : 'finished-stamped'
    const last = [bundle, ...(bundle.history ?? [])].find((read) => read.event?.account.eventIndex === index)?.event?.account
    if (last?.status === 'Voided') status = 'finished-skipped'
  }
  // A confirmed current stamp counts once, even if settlement hasn't happened yet.
  if (model.showedUp && !outcomes.has(index)) outcomes.set(index, 'done')
  return {
    address, weekIndex: index, weekCount: account.schedule.length,
    kept: [...outcomes].filter(([week, value]) => week < account.schedule.length && value === 'done').length,
    missed: [...outcomes].filter(([week, value]) => week < account.schedule.length && value === 'missed').length,
    status, opens: Number(window.opens), deadline: Number(window.deadline),
  }
}
