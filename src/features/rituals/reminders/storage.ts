export const REMINDERS_STORAGE_KEY = '@rituals/reminders/v1'
export interface ReminderStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}
export type RitualReminderPreference = { enabled: boolean; stampedWeeks: number[] }
export type ReminderPreferences = { permissionAsked: boolean; rituals: Record<string, RitualReminderPreference> }

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
export function parseReminderPreferences(value: unknown): ReminderPreferences {
  // Fail closed on corruption: silently resetting would permit another prompt
  // or forget which weeks have already been stamped.
  if (!record(value) || typeof value.permissionAsked !== 'boolean' || !record(value.rituals)) throw new Error('Invalid reminder preferences')
  const rituals: ReminderPreferences['rituals'] = Object.create(null)
  for (const [address, preference] of Object.entries(value.rituals)) {
    if (!record(preference) || typeof preference.enabled !== 'boolean' || !Array.isArray(preference.stampedWeeks)
      || !preference.stampedWeeks.every((week) => Number.isInteger(week) && week >= 0 && week < 16)) throw new Error('Invalid ritual reminder preference')
    rituals[address] = { enabled: preference.enabled, stampedWeeks: [...new Set(preference.stampedWeeks as number[])] }
  }
  return { permissionAsked: value.permissionAsked, rituals }
}

export async function readReminderPreferences(storage: ReminderStorage): Promise<ReminderPreferences> {
  const raw = await storage.getItem(REMINDERS_STORAGE_KEY)
  return raw === null ? { permissionAsked: false, rituals: Object.create(null) } : parseReminderPreferences(JSON.parse(raw))
}

export async function writeReminderPreferences(storage: ReminderStorage, preferences: ReminderPreferences): Promise<void> {
  await storage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(parseReminderPreferences(preferences)))
}
