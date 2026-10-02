import AsyncStorage from '@react-native-async-storage/async-storage'
import { PublicKey } from '@solana/web3.js'

export const SOLO_NOTES_STORAGE_KEY = '@rituals/solo-notes/v1'
export type SoloProofMode = 'none' | 'note'
export type SoloNotes = Readonly<{
  proofMode: SoloProofMode
  notes: Readonly<Record<string, string>>
}>
export type SoloNotesStorage = Readonly<Record<string, SoloNotes>>
export type SoloNotesUpdate = Readonly<
  | { proofMode: SoloProofMode }
  | { eventIndex: number; text: string }
>

const emptyStorage = (): SoloNotesStorage => Object.freeze({})
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const canonicalAddress = (value: string): string | null => {
  try {
    const key = new PublicKey(value)
    return key.equals(PublicKey.default) || key.toBase58() !== value ? null : value
  } catch {
    return null
  }
}
const validEventIndex = (value: string): boolean => /^(?:0|[1-9]\d*)$/.test(value) && Number(value) < 16
const validNote = (value: unknown): value is string => typeof value === 'string' && Array.from(value).length <= 280 && value === value.trim()

function parseRecord(value: unknown): SoloNotes | null {
  if (!isRecord(value) || (value.proofMode !== 'none' && value.proofMode !== 'note') || !isRecord(value.notes)) return null
  const notes: Record<string, string> = {}
  for (const [eventIndex, text] of Object.entries(value.notes)) {
    if (!validEventIndex(eventIndex) || !validNote(text)) return null
    notes[eventIndex] = text
  }
  return Object.freeze({ proofMode: value.proofMode, notes: Object.freeze(notes) })
}

/** Parses only the JSON-safe storage shape; malformed records are discarded. */
export function parseSoloNotesStorage(value: unknown): SoloNotesStorage {
  if (!isRecord(value)) return emptyStorage()
  const parsed: Record<string, SoloNotes> = {}
  for (const [address, record] of Object.entries(value)) {
    if (!canonicalAddress(address)) continue
    const notes = parseRecord(record)
    if (notes) parsed[address] = notes
  }
  return Object.freeze(parsed)
}

export function trimSoloWeekNote(text: string): string {
  return Array.from(text.trim()).slice(0, 280).join('')
}

/**
 * Whether the stamp offers the optional one-line note. The create screen no
 * longer asks (single-blade fold), so a missing record means yes; only an
 * explicit "none" chosen at create turns it off.
 */
export function notesOffered(record: SoloNotes | null): boolean {
  return record?.proofMode !== 'none'
}

export function mergeSoloNotesStorage(current: unknown, address: string, update: SoloNotesUpdate): SoloNotesStorage {
  const parsed = parseSoloNotesStorage(current)
  const canonical = canonicalAddress(address)
  if (!canonical) return parsed
  const existing = parsed[canonical]
  let next: SoloNotes
  if ('proofMode' in update) {
    next = Object.freeze({ proofMode: update.proofMode, notes: Object.freeze({ ...(existing?.notes ?? {}) }) })
  } else if (Number.isInteger(update.eventIndex) && update.eventIndex >= 0 && update.eventIndex < 16) {
    const notes = { ...(existing?.notes ?? {}) }
    const text = trimSoloWeekNote(update.text)
    if (text.length === 0) delete notes[String(update.eventIndex)]
    else notes[String(update.eventIndex)] = text
    next = Object.freeze({ proofMode: existing?.proofMode ?? 'note', notes: Object.freeze(notes) })
  } else {
    return parsed
  }
  return Object.freeze({ ...parsed, [canonical]: next })
}

async function readStorage(): Promise<SoloNotesStorage> {
  try {
    const raw = await AsyncStorage.getItem(SOLO_NOTES_STORAGE_KEY)
    if (!raw) return emptyStorage()
    return parseSoloNotesStorage(JSON.parse(raw))
  } catch {
    return emptyStorage()
  }
}

export async function saveProofMode(address: string, mode: SoloProofMode): Promise<void> {
  if (!canonicalAddress(address)) return
  const current = await readStorage()
  const next = mergeSoloNotesStorage(current, address, { proofMode: mode })
  await AsyncStorage.setItem(SOLO_NOTES_STORAGE_KEY, JSON.stringify(next))
}

export async function readSoloNotes(address: string): Promise<SoloNotes | null> {
  const canonical = canonicalAddress(address)
  if (!canonical) return null
  const storage = await readStorage()
  return storage[canonical] ?? null
}

export async function saveWeekNote(address: string, eventIndex: number, text: string): Promise<void> {
  if (!canonicalAddress(address)) return
  const current = await readStorage()
  const next = mergeSoloNotesStorage(current, address, { eventIndex, text })
  await AsyncStorage.setItem(SOLO_NOTES_STORAGE_KEY, JSON.stringify(next))
}
