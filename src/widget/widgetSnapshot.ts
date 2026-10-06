import { buildWidgetSnapshot, type WidgetKnown, type WidgetOutcome, type WidgetRitual, type WidgetSnapshot, type WidgetWeek } from './widgetModel'

// v2 lacks per-week windows and cannot safely be migrated. Foreground republishes.
export const WIDGET_STORAGE_KEY = '@rituals/widget/v3'
export interface WidgetStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<unknown>
}

function decodeRitual(value: any): WidgetRitual | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  for (const key of ['address', 'stakeLabel', 'causeLabel']) if (typeof value[key] !== 'string' || !value[key]) return null
  if (typeof value.title !== 'string' || typeof value.active !== 'boolean') return null
  if (typeof value.tint !== 'string' || !/^#[\da-f]{6}$/i.test(value.tint)) return null
  if (!Array.isArray(value.weeks) || !value.weeks.length || value.weeks.length > 16) return null
  const weeks: WidgetWeek[] = []
  for (const week of value.weeks) {
    if (!week || typeof week !== 'object') return null
    if (!['pending', 'kept', 'missed', 'skipped', 'unknown'].includes(week.outcome)) return null
    for (const key of ['opens', 'deadline']) if (!Number.isSafeInteger(week[key]) || week[key] < 0) return null
    if (week.deadline <= week.opens || (weeks.length && week.opens <= weeks[weeks.length - 1].deadline)) return null
    if (!value.active && week.outcome === 'pending') return null
    weeks.push({ opens: week.opens, deadline: week.deadline, outcome: week.outcome })
  }
  const { address, title, stakeLabel, causeLabel, active, tint } = value
  return { address, title, stakeLabel, causeLabel, active, tint, weeks }
}

export function decodeWidgetSnapshot(raw: string | null): WidgetSnapshot | null {
  try {
    const value = raw === null ? null : JSON.parse(raw)
    if (!value || !Array.isArray(value.rituals) || !value.rituals.length) return null
    const rituals: WidgetRitual[] = []
    for (const entry of value.rituals) {
      const ritual = decodeRitual(entry)
      if (!ritual || rituals.some((item) => item.address === ritual.address)) return null
      rituals.push(ritual)
    }
    return { rituals }
  } catch { return null }
}

export async function readWidgetSnapshot(storage: WidgetStorage): Promise<WidgetSnapshot | null> {
  try { return decodeWidgetSnapshot(await storage.getItem(WIDGET_STORAGE_KEY)) } catch { return null }
}

export async function writeWidgetSnapshot(storage: WidgetStorage, snapshot: WidgetSnapshot | null): Promise<void> {
  await storage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(snapshot))
}

/** Foreground-only writer. Serialized; headless tasks never mutate or fetch. */
export function createWidgetPublisher(storage: WidgetStorage) {
  const cache = new Map<string, WidgetOutcome>()
  let queue: Promise<unknown> = Promise.resolve()
  return (known: readonly WidgetKnown[], updates: readonly WidgetOutcome[], replaceAll = false): Promise<void> => {
    const next = queue.catch(() => undefined).then(async () => {
      if (replaceAll) cache.clear()
      else {
        const saved = await readWidgetSnapshot(storage)
        for (const ritual of saved?.rituals ?? []) if (!cache.has(ritual.address)) cache.set(ritual.address, ritual)
      }
      for (const update of updates) cache.set(update.address, update)
      for (const address of cache.keys()) if (!known.some((item) => item.address === address)) cache.delete(address)
      await writeWidgetSnapshot(storage, buildWidgetSnapshot(known, [...cache.values()]))
    })
    queue = next
    return next
  }
}
