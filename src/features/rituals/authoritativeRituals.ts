import AsyncStorage from '@react-native-async-storage/async-storage'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useRef, useState } from 'react'
import type { RitualClient } from '../../data/rituals/ritualClient'
import type { RitualBundleRead } from '../../data/rituals/ritualsRpc'
import type { RitualClientState } from './client/useRitualClient'

export const KNOWN_RITUALS_STORAGE_KEY = '@rituals/known-rituals/v1'
export type KnownRitual = Readonly<{ address: string; title: string; requirement: string }>
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
  return address && typeof record.title === 'string' && typeof record.requirement === 'string'
    ? Object.freeze({ address, title: record.title, requirement: record.requirement }) : null
}

export async function listKnownRituals(): Promise<readonly KnownRitual[]> {
  try {
    const raw = await AsyncStorage.getItem(KNOWN_RITUALS_STORAGE_KEY)
    if (!raw) return Object.freeze([])
    const value: unknown = JSON.parse(raw)
    return Object.freeze(Array.isArray(value) ? value.map(parse).filter((item): item is KnownRitual => item !== null) : [])
  } catch { return Object.freeze([]) }
}

export async function rememberRitual(ritual: KnownRitual): Promise<void> {
  const parsed = parse(ritual)
  if (!parsed) throw new Error('cannot save an invalid Ritual')
  const current = await listKnownRituals()
  await AsyncStorage.setItem(KNOWN_RITUALS_STORAGE_KEY, JSON.stringify([...current.filter((item) => item.address !== parsed.address), parsed]))
}

export async function loadKnownRitualBundles(client: RitualClient): Promise<readonly (KnownRitual & { bundle: RitualBundleRead })[]> {
  const known = await listKnownRituals()
  const results = await Promise.all(known.map(async (item) => ({ ...item, bundle: await client.getRitualBundle(new PublicKey(item.address)) })))
  return Object.freeze(results)
}

export function useRitualBundle(clientState: RitualClientState, addressText: string, eventIndex?: number): BundleState {
  const [state, setState] = useState<BundleSnapshot>({ status: 'loading' })
  const [retryCount, setRetryCount] = useState(0)
  const generation = useRef(0)
  useEffect(() => {
    const generationValue = ++generation.current
    if (clientState.status !== 'ready') { setState({ status: 'error', message: clientState.reason }); return }
    let address: PublicKey
    try { address = new PublicKey(addressText) } catch { setState({ status: 'error', message: 'This Ritual address is invalid.' }); return }
    setState({ status: 'loading' })
    void (eventIndex === undefined ? clientState.client.getRitualBundle(address) : clientState.client.getEventBundle(address, eventIndex))
      .then((bundle) => { if (generation.current === generationValue) setState({ status: 'ready', bundle }) })
      .catch(() => { if (generation.current === generationValue) setState({ status: 'error', message: 'Ritual data could not be read from devnet. Check your connection and try again.' }) })
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
