import { selectWidgetSnapshot, widgetStates, type WidgetKnown, type WidgetOutcome, type WidgetSnapshot } from './widgetModel'

// v1 only had totals; never fabricate dot positions when upgrading it.
export const WIDGET_STORAGE_KEY = '@rituals/widget/v2'
export interface WidgetStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<unknown>
}

export function decodeWidgetSnapshot(raw: string | null): WidgetSnapshot | null {
  try {
    const value = raw === null ? null : JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    if (typeof value.address !== 'string' || !value.address || typeof value.title !== 'string') return null
    if (!widgetStates.includes(value.state) || typeof value.tint !== 'string' || !/^#[\da-f]{6}$/i.test(value.tint)) return null
    if (typeof value.stakeLabel !== 'string' || !value.stakeLabel) return null
    for (const key of ['active', 'showedUp', 'terminalCurrent']) if (typeof value[key] !== 'boolean') return null
    if (!Array.isArray(value.cells) || value.cells.length < 1 || value.cells.length > 16) return null
    if (!value.cells.every((cell: unknown) => typeof cell === 'string' && ['done', 'missed', 'closed', 'now', 'future'].includes(cell))) return null
    if (value.cells.filter((cell: string) => cell === 'now').length > 1) return null
    if (!value.active && (value.state !== 'completed' || value.cells.some((cell: string) => cell === 'now' || cell === 'future'))) return null
    for (const key of ['opens', 'deadline']) {
      if (!Number.isSafeInteger(value[key]) || value[key] < 0) return null
    }
    if (value.deadline < value.opens) return null
    // Explicit fields prevent unrelated or sensitive storage properties propagating.
    const { address, title, stakeLabel, cells, active, state, showedUp, terminalCurrent, opens, deadline, tint } = value
    return { address, title, stakeLabel, cells, active, state, showedUp, terminalCurrent, opens, deadline, tint }
  } catch { return null }
}

export async function readWidgetSnapshot(storage: WidgetStorage): Promise<WidgetSnapshot | null> {
  try { return decodeWidgetSnapshot(await storage.getItem(WIDGET_STORAGE_KEY)) } catch { return null }
}

export async function writeWidgetSnapshot(storage: WidgetStorage, snapshot: WidgetSnapshot | null): Promise<void> {
  await storage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(snapshot))
}

/** Foreground-only writer. Serializes storage operations; headless tasks only read. */
export function createWidgetPublisher(storage: WidgetStorage) {
  const cache = new Map<string, WidgetOutcome>()
  let queue: Promise<unknown> = Promise.resolve()
  return (known: readonly WidgetKnown[], updates: readonly WidgetOutcome[], replaceAll = false): Promise<void> => {
    const next = queue.catch(() => undefined).then(async () => {
      if (replaceAll) cache.clear()
      else {
        const saved = await readWidgetSnapshot(storage)
        if (saved && !cache.has(saved.address)) cache.set(saved.address, saved)
      }
      for (const update of updates) cache.set(update.address, update)
      for (const address of cache.keys()) if (!known.some((item) => item.address === address)) cache.delete(address)
      const snapshot = selectWidgetSnapshot(known, [...cache.values()])
      await writeWidgetSnapshot(storage, snapshot)
    })
    queue = next
    return next
  }
}
