import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { PublicKey, type Connection } from '@solana/web3.js'
import type { RitualClientState } from '../../client/useRitualClient'
import { readTestTokenBalance } from '../../faucet/testTokenBalance'
import { useCreateBalance } from './useCreateBalance'

const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[], focused: true }))
vi.mock('react', () => ({
  useCallback: (callback: unknown, deps: unknown[]) => {
    const i = hooks.cursor++; const previous = hooks.cells[i]
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) hooks.cells[i] = { deps, callback }
    return hooks.cells[i].callback
  },
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
vi.mock('@react-navigation/native', () => ({ useFocusEffect: (callback: () => void) => useEffect(() => { if (hooks.focused) return callback() }, [callback, hooks.focused]) }))
vi.mock('../../faucet/testTokenBalance', () => ({ readTestTokenBalance: vi.fn() }))
const a = new PublicKey(new Uint8Array(32).fill(1))
const b = new PublicKey(new Uint8Array(32).fill(2))
const client = { status: 'ready', client: { getProtocolConfig: vi.fn(async () => ({ account: { allowedStakeMint: a, feeBasisPoints: 0, minimumFee: 0n, maximumFee: 0n } })) } } as unknown as RitualClientState
const connection = {} as Connection
const render = (wallet: PublicKey | null = a) => {
  hooks.cursor = 0; const result = useCreateBalance(client, connection, wallet)
  hooks.effects.splice(0).forEach((effect) => effect())
  return result
}
const flush = () => vi.advanceTimersByTimeAsync(0)
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); hooks.cells = []; hooks.effects = []; hooks.focused = true; vi.mocked(readTestTokenBalance).mockReset().mockResolvedValue(0n) })
afterEach(() => { hooks.cells.forEach((cell) => cell?.cleanup?.()); vi.useRealTimers() })

describe('Create balance transitions (hook harness)', () => {
  it('never revives A balance after A→none→B→A while Create is unfocused', async () => {
    render(); await flush(); expect(render().balance).toBe(0n)
    hooks.focused = false
    render(); render(null); render(b)
    expect(render(a).balance).toBeNull()
    hooks.focused = true
    vi.mocked(readTestTokenBalance).mockResolvedValueOnce(50_000_000n)
    expect(render(a).balance).toBeNull(); await flush()
    expect(render(a).balance).toBe(50_000_000n)
  })
  it('hides A immediately, ignores its late read and permits B', async () => {
    let finish!: (balance: bigint) => void
    vi.mocked(readTestTokenBalance).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(a); await flush()
    expect(render(b).balance).toBeNull(); await flush()
    finish(100n); await flush()
    expect(render(b).balance).toBe(0n)
  })
  it('invalidates a pre-credit read and refreshes after the faucet delay', async () => {
    let finish!: (balance: bigint) => void
    vi.mocked(readTestTokenBalance).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(); await flush()
    render().onFaucetSent()
    finish(0n); await flush()
    expect(render().balance).toBeNull()
    vi.mocked(readTestTokenBalance).mockResolvedValueOnce(50_000_000n)
    await vi.advanceTimersByTimeAsync(4000)
    render(); await flush()
    expect(render().balance).toBe(50_000_000n)
  })
  it('fails open on RPC failure and cancels the faucet refresh on unmount', async () => {
    vi.mocked(readTestTokenBalance).mockRejectedValueOnce(new Error('offline'))
    render(); await flush(); expect(render().balance).toBeNull()
    render().onFaucetSent()
    hooks.cells.forEach((cell) => cell?.cleanup?.())
    await vi.advanceTimersByTimeAsync(4000)
    expect(readTestTokenBalance).toHaveBeenCalledOnce()
  })
})
