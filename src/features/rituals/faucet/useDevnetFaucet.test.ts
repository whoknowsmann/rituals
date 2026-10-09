import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestTestTokens, type FaucetResult } from './devnetFaucet'
import { useDevnetFaucet } from './useDevnetFaucet'

const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[] }))
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (value: unknown) => { const i = hooks.cursor++; return hooks.cells[i] ??= { current: value } },
  useState: (value: unknown) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = value; return [hooks.cells[i], (next: unknown) => { hooks.cells[i] = next }] },
  useEffect: (callback: () => unknown, deps: unknown[]) => {
    const i = hooks.cursor++; const previous = hooks.cells[i]
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) {
      hooks.effects.push(() => { previous?.cleanup?.(); hooks.cells[i] = { deps, cleanup: callback() } })
    }
  },
}))
vi.mock('./devnetFaucet', async (original) => ({ ...await original<typeof import('./devnetFaucet')>(), requestTestTokens: vi.fn() }))
const render = (wallet: string | null, onSent = vi.fn()) => {
  hooks.cursor = 0
  const result = useDevnetFaucet(wallet, onSent)
  hooks.effects.splice(0).forEach((effect) => effect())
  return result
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
const sent: FaucetResult = { kind: 'sent', signature: 'test-signature', confirmed: true, explorer: null }
beforeEach(() => { vi.resetAllMocks(); hooks.cells = []; hooks.effects = []; hooks.cursor = 0 })

describe('wallet-scoped faucet hook (effect harness)', () => {
  it('hides a completed result immediately through A to none to B to A', async () => {
    vi.mocked(requestTestTokens).mockResolvedValue(sent)
    render('A').request(); await flush()
    expect(render('A').status).toBe('done')
    for (const wallet of [null, 'B', 'A']) expect(render(wallet)).toMatchObject({ status: 'idle', result: null })
  })
  it('ignores a late A response and permits B without refreshing either old balance', async () => {
    const onA = vi.fn(); const onB = vi.fn()
    let finishA!: (result: FaucetResult) => void
    vi.mocked(requestTestTokens).mockImplementationOnce(() => new Promise((resolve) => { finishA = resolve })).mockResolvedValueOnce({ kind: 'limited' })
    render('A', onA).request()
    render(null)
    render('B', onB).request(); await flush()
    finishA(sent); await flush()
    expect(requestTestTokens).toHaveBeenCalledTimes(2)
    expect(render('B', onB).result).toEqual({ kind: 'limited' })
    expect(onA).not.toHaveBeenCalled(); expect(onB).not.toHaveBeenCalled()
  })
  it('does not revive a request from an earlier A session or allow a stale tap', async () => {
    let finish!: (result: FaucetResult) => void
    vi.mocked(requestTestTokens).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const old = render('A'); old.request()
    render(null); render('B'); render('A')
    finish(sent); await flush()
    expect(render('A').status).toBe('idle')
    old.request()
    expect(requestTestTokens).toHaveBeenCalledOnce()
  })
  it('keeps double taps single-flight and ignores completion after unmount', async () => {
    const onSent = vi.fn()
    let finish!: (result: FaucetResult) => void
    vi.mocked(requestTestTokens).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const current = render('A', onSent); current.request(); current.request()
    expect(requestTestTokens).toHaveBeenCalledOnce()
    hooks.cells.forEach((cell) => cell?.cleanup?.())
    finish(sent); await flush()
    expect(onSent).not.toHaveBeenCalled()
  })
})
