import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { useRitualBundle } from './authoritativeRituals'
import type { RitualClientState } from './client/useRitualClient'
import type { RitualBundleRead } from '../../data/rituals/ritualsRpc'

const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[] }))
vi.mock('react', () => ({
  useRef: (value: unknown) => { const i = hooks.cursor++; return hooks.cells[i] ??= { current: value } },
  useState: (value: unknown) => {
    const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = value
    return [hooks.cells[i], (next: any) => { hooks.cells[i] = typeof next === 'function' ? next(hooks.cells[i]) : next }]
  },
  useEffect: (callback: () => unknown, deps: unknown[]) => {
    const i = hooks.cursor++; const previous = hooks.cells[i]
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) hooks.effects.push(() => { previous?.cleanup?.(); hooks.cells[i] = { deps, cleanup: callback() } })
  },
}))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))
vi.mock('./reminders/runtime', () => ({ clearRitualReminders: vi.fn() }))
const address = new PublicKey(new Uint8Array(32).fill(7)).toBase58()
const other = new PublicKey(new Uint8Array(32).fill(8)).toBase58()
const bundle = (slot: number) => ({ slot, ritual: { address: new PublicKey(address), account: {} }, event: null, claims: [] }) as unknown as RitualBundleRead
const client = { status: 'ready' as const, client: { getRitualBundle: vi.fn(), getEventBundle: vi.fn() } }
const render = (target = address, index?: number) => {
  hooks.cursor = 0
  const result = useRitualBundle(client as unknown as RitualClientState, target, index)
  hooks.effects.splice(0).forEach((effect) => effect())
  return result
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
beforeEach(() => {
  vi.resetAllMocks(); hooks.cells = []; hooks.effects = []; hooks.cursor = 0
  client.client.getRitualBundle.mockResolvedValue(bundle(10)); client.client.getEventBundle.mockResolvedValue(bundle(10))
})
afterEach(() => { hooks.cells.forEach((cell) => cell?.cleanup?.()) })

describe('ritual snapshot transitions (effect harness)', () => {
  it.each(['ritual', 'receipt'] as const)('never renders the previous %s under a new route even before effects flush', async (kind) => {
    render(address, 0); await flush()
    expect(render(address, 0).status).toBe('ready')
    const next = render(kind === 'ritual' ? other : address, kind === 'ritual' ? 0 : 1)
    expect(next.status).toBe('loading'); expect(next.bundle).toBeUndefined()
  })
  it('never rolls a newer confirmed snapshot back to an older RPC slot', async () => {
    render(); await flush()
    const ready = render(); ready.retry()
    client.client.getRitualBundle.mockResolvedValueOnce(bundle(9))
    render(); await flush()
    expect(render().bundle?.slot).toBe(10)
  })
  it('retains the same snapshot while a refresh is pending or fails', async () => {
    render(); await flush()
    const ready = render(); ready.retry()
    client.client.getRitualBundle.mockRejectedValueOnce(new Error('offline'))
    expect(render().bundle).toBe(ready.bundle); await flush()
    expect(render().bundle).toBe(ready.bundle)
  })
})
