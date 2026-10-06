import AsyncStorage from '@react-native-async-storage/async-storage'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useRef, useState } from 'react'
import type { RitualClient } from '../../data/rituals/ritualClient'
import { RitualRpcError, type RitualBundleRead } from '../../data/rituals/ritualsRpc'
import type { RitualClientState } from './client/useRitualClient'
import { clearRitualReminders } from './reminders/runtime'

export const KNOWN_RITUALS_STORAGE_KEY = '@rituals/known-rituals/v1'
export type KnownRitual = Readonly<{ address: string; title: string; requirement: string; destinationOwner?: string }>
export type BundleState = Readonly<{ status: 'loading' | 'ready' | 'error'; bundle?: RitualBundleRead; message?: string; retry: () => void }>
type BundleSnapshot = Readonly<{ status: 'loading' | 'ready' | 'error'; bundle?: RitualBundleRead; message?: string }>

const canonical = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  try { const key = new PublicKey(value); return key.equals(PublicKey.default) || key.toBase58() !== value ? null : value } catch { return null }
}
const parse = (value: unknown): KnownRitual | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const address = canonical(record.address)
  const destinationOwner = canonical(record.destinationOwner)
  return address && typeof record.title === 'string' && typeof record.requirement === 'string'
    ? Object.freeze({ address, title: record.title, requirement: record.requirement, ...(destinationOwner ? { destinationOwner } : {}) }) : null
}

export async function listKnownRituals(): Promise<readonly KnownRitual[]> {
  try {
    const raw = await AsyncStorage.getItem(KNOWN_RITUALS_STORAGE_KEY)
    if (!raw) return Object.freeze([])
    const value: unknown = JSON.parse(raw)
    return Object.freeze(Array.isArray(value) ? value.map(parse).filter((item): item is KnownRitual => item !== null) : [])
  } catch { return Object.freeze([]) }
}

// Serialize read/modify/write operations: concurrent creates/removals must not
// replace each other's list, including when recovery is running on Home.
let knownWrites: Promise<void> = Promise.resolve()
function updateKnown(change: (current: readonly KnownRitual[]) => readonly KnownRitual[]): Promise<void> {
  const write = knownWrites.then(async () => {
    const current = await listKnownRituals()
    await AsyncStorage.setItem(KNOWN_RITUALS_STORAGE_KEY, JSON.stringify(change(current)))
  })
  knownWrites = write.catch(() => undefined)
  return write
}

export async function rememberRitual(ritual: KnownRitual): Promise<void> {
  const parsed = parse(ritual)
  if (!parsed) throw new Error('cannot save an invalid Ritual')
  await updateKnown((current) => [...current.filter((item) => item.address !== parsed.address), { ...current.find((item) => item.address === parsed.address), ...parsed }])
}

/** Take a ritual off this phone's list. The chain is untouched; nothing is refunded or cancelled. */
export async function forgetRitual(address: string): Promise<void> {
  await updateKnown((current) => current.filter((item) => item.address !== address))
  await clearRitualReminders(address)
}

export async function loadKnownRitualBundles(client: RitualClient): Promise<readonly (KnownRitual & { bundle: RitualBundleRead })[]> {
  return readKnownRitualBundles(await listKnownRituals(), (address) => client.getRitualBundle(address))
}

/**
 * Reads every remembered ritual. A ritual that can never be read again (its
 * account is gone, or it was created under an older program layout that no
 * longer decodes) is skipped so it cannot hide the others. Any other failure
 * (RPC, stale or unstable reads) is rethrown so the screen offers a retry
 * instead of quietly showing a shorter list.
 */
export async function readKnownRitualBundles(
  known: readonly KnownRitual[],
  read: (address: PublicKey) => Promise<RitualBundleRead>,
): Promise<readonly (KnownRitual & { bundle: RitualBundleRead })[]> {
  const loaded: (KnownRitual & { bundle: RitualBundleRead })[] = []
  // A large Home must not fan out every ritual's multi-read bundle at once.
  for (let start = 0; start < known.length; start += 3) {
    const settled = await Promise.allSettled(known.slice(start, start + 3).map(async (item) => ({ ...item, bundle: await read(new PublicKey(item.address)) })))
    for (const result of settled) {
      if (result.status === 'fulfilled') loaded.push(result.value)
      else if (!isPermanentlyUnreadable(result.reason)) throw result.reason
    }
  }
  return Object.freeze(loaded)
}

function isPermanentlyUnreadable(error: unknown): boolean {
  return error instanceof RitualRpcError && (error.category === 'decode' || error.category === 'not-found')
}

/**
 * Re-reading the same ritual keeps the last good read on screen. Dropping to
 * 'loading' unmounted the whole screen on every refresh, so after a stamp the
 * stamp and the confetti played twice (phone, 2026-10-04).
 */
export function stateWhileReloading<T extends { status: string }>(previous: T, sameTarget: boolean, loading: T): T {
  return sameTarget && previous.status === 'ready' ? previous : loading
}

export function useRitualBundle(clientState: RitualClientState, addressText: string, eventIndex?: number): BundleState {
  const [state, setState] = useState<BundleSnapshot>({ status: 'loading' })
  const [retryCount, setRetryCount] = useState(0)
  const generation = useRef(0)
  const target = useRef<string | null>(null)
  useEffect(() => {
    const generationValue = ++generation.current
    const key = `${addressText}:${eventIndex ?? ''}`
    const sameTarget = target.current === key
    target.current = key
    if (clientState.status !== 'ready') { setState({ status: 'error', message: clientState.reason }); return }
    let address: PublicKey
    try { address = new PublicKey(addressText) } catch { setState({ status: 'error', message: 'This Ritual address is invalid.' }); return }
    setState((previous) => stateWhileReloading(previous, sameTarget, { status: 'loading' } as BundleSnapshot))
    void (eventIndex === undefined ? clientState.client.getRitualBundle(address) : clientState.client.getEventBundle(address, eventIndex))
      .then((bundle) => { if (generation.current === generationValue) setState({ status: 'ready', bundle }) })
      // A failed background refresh keeps the last good read; a first read shows the error.
      .catch(() => { if (generation.current === generationValue) setState((previous) => stateWhileReloading(previous, sameTarget, { status: 'error', message: 'Ritual data could not be read from devnet. Check your connection and try again.' } as BundleSnapshot)) })
  }, [clientState, addressText, eventIndex, retryCount])
  return Object.freeze({ ...state, retry: () => setRetryCount((value) => value + 1) })
}

export function statusLabel(status: string): string {
  return status === 'Funding' ? 'Funding' : status === 'Active' ? 'Active' : status === 'Completed' ? 'Completed' : 'Cancelled'
}
export { formatAtomic } from './displayFormat'
export function eventLabel(bundle: RitualBundleRead): string {
  return bundle.event ? `Event ${bundle.event.account.eventIndex + 1}` : 'Next event not initialized'
}
export function nextEventLabel(bundle: RitualBundleRead): string {
  const index = bundle.ritual.account.currentEventIndex
  const window = bundle.ritual.account.schedule[Math.min(index, bundle.ritual.account.schedule.length - 1)]
  return window ? new Date(Number(window.opens) * 1000).toLocaleString() : 'No further events'
}
export function bundleFor(clientState: RitualClientState, address: string): RitualClient | null {
  return clientState.status === 'ready' ? clientState.client : null
}
