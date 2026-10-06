import { describe, expect, it, vi } from 'vitest'
import { parseReminderPreferences, readReminderPreferences, REMINDERS_STORAGE_KEY, writeReminderPreferences } from './storage'

export function memoryStorage() {
  const values = new Map<string, string>()
  return { values, getItem: vi.fn(async (key: string) => values.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { values.set(key, value) }) }
}

describe('reminder preferences', () => {
  it('starts with no prompt and no opt-ins', async () => {
    expect(await readReminderPreferences(memoryStorage())).toEqual({ permissionAsked: false, rituals: {} })
  })
  it('round trips consent and zero-based stamped weeks independently per ritual', async () => {
    const storage = memoryStorage()
    const value = { permissionAsked: true, rituals: { A: { enabled: true, stampedWeeks: [0, 15] }, B: { enabled: false, stampedWeeks: [] } } }
    await writeReminderPreferences(storage, value)
    expect(storage.setItem).toHaveBeenCalledWith(REMINDERS_STORAGE_KEY, JSON.stringify(value))
    expect(await readReminderPreferences(storage)).toEqual(value)
  })
  it.each([null, [], {}, { permissionAsked: 'yes', rituals: {} }, { permissionAsked: true, rituals: { A: { enabled: true, stampedWeeks: [16] } } }])('fails closed on malformed state %j', (value) => {
    expect(() => parseReminderPreferences(value)).toThrow('Invalid')
  })
  it('does not silently reset corrupt JSON or an unavailable store', async () => {
    const storage = memoryStorage()
    storage.values.set(REMINDERS_STORAGE_KEY, '{')
    await expect(readReminderPreferences(storage)).rejects.toThrow()
    storage.getItem.mockRejectedValueOnce(new Error('storage unavailable'))
    await expect(readReminderPreferences(storage)).rejects.toThrow('storage unavailable')
  })
  it('deduplicates stamps and does not give prototype names special treatment', () => {
    const value = JSON.parse('{"permissionAsked":true,"rituals":{"__proto__":{"enabled":true,"stampedWeeks":[1,1]}}}')
    expect(parseReminderPreferences(value).rituals['__proto__']).toEqual({ enabled: true, stampedWeeks: [1] })
  })
})
