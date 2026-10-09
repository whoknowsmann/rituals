import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { applyWalletReminderPlan } from './restore'
import { useWalletReminders } from './useWalletReminders'

const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[] }))
vi.mock('react', () => ({
  useRef: (value: unknown) => { const i = hooks.cursor++; return hooks.cells[i] ??= { current: value } },
  useEffect: (callback: () => unknown, deps: unknown[]) => {
    const i = hooks.cursor++; const previous = hooks.cells[i]
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) hooks.effects.push(() => { previous?.cleanup?.(); hooks.cells[i] = { deps, cleanup: callback() } })
  },
}))
vi.mock('./restore', async (original) => ({ ...await original<typeof import('./restore')>(), applyWalletReminderPlan: vi.fn() }))
vi.mock('./runtime', () => ({ clearRitualReminders: vi.fn() }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))
const a = new PublicKey(new Uint8Array(32).fill(1)).toBase58()
const b = new PublicKey(new Uint8Array(32).fill(2)).toBase58()
const empty: NonNullable<Parameters<typeof useWalletReminders>[0]> = []
const render = (wallet: string | null, loaded: typeof empty | null = empty, loading = false) => {
  hooks.cursor = 0; useWalletReminders(loaded, wallet, loading)
  hooks.effects.splice(0).forEach((effect) => effect())
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
const cleanup = () => hooks.cells.forEach((cell) => cell?.cleanup?.())
beforeEach(() => { vi.resetAllMocks(); hooks.cells = []; hooks.effects = []; vi.mocked(applyWalletReminderPlan).mockResolvedValue(true) })
afterEach(cleanup)

describe('Home wallet reminder effect (no renderer or RPC)', () => {
  it('runs disconnect cleanup even when Home has no readable chain snapshot', async () => {
    render(null, null); await flush()
    expect(applyWalletReminderPlan).toHaveBeenCalledOnce()
    expect(vi.mocked(applyWalletReminderPlan).mock.calls[0][0]).toMatchObject({ restore: [] })
  })
  it('waits for stored authorization, but not for the RPC', async () => {
    render(null, null, true); await flush()
    expect(applyWalletReminderPlan).not.toHaveBeenCalled()
    render(a, null); await flush()
    expect(applyWalletReminderPlan).toHaveBeenCalledOnce()
  })
  it('invalidates old A work permanently through A→none→B→A and on unmount', async () => {
    vi.mocked(applyWalletReminderPlan).mockImplementation(() => new Promise(() => undefined))
    render(a)
    const firstGuard = vi.mocked(applyWalletReminderPlan).mock.calls[0][1]
    expect(firstGuard()).toBe(true)
    render(null); render(b); render(a)
    expect(firstGuard()).toBe(false)
    const currentGuard = vi.mocked(applyWalletReminderPlan).mock.calls.at(-1)![1]
    expect(currentGuard()).toBe(true)
    cleanup()
    expect(currentGuard()).toBe(false)
  })
  it('deduplicates a completed plan but retries a failed one on the next Home read', async () => {
    vi.mocked(applyWalletReminderPlan).mockResolvedValueOnce(false)
    render(a); await flush()
    render(a, []); await flush()
    expect(applyWalletReminderPlan).toHaveBeenCalledTimes(2)
    render(a, []); await flush()
    expect(applyWalletReminderPlan).toHaveBeenCalledTimes(2)
  })
})
