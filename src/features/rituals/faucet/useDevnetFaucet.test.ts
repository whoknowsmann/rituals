import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { faucetLine, requestTestTokens, type FaucetResult } from './devnetFaucet'
import { readTestTokenBalance } from './testTokenBalance'
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
const rpc = vi.hoisted(() => ({ getBalance: vi.fn(), getProtocolConfig: vi.fn() }))
vi.mock('../../../utils/ConnectionProvider', () => ({ useConnection: () => ({ connection: rpc }) }))
vi.mock('../client/useRitualClient', () => ({ useRitualClient: () => ({ status: 'ready', client: rpc }) }))
vi.mock('./testTokenBalance', () => ({ readTestTokenBalance: vi.fn() }))
const render = (wallet: string | null, onSent = vi.fn()) => {
  hooks.cursor = 0
  const result = useDevnetFaucet(wallet, onSent)
  hooks.effects.splice(0).forEach((effect) => effect())
  return result
}
const flush = () => vi.advanceTimersByTimeAsync(0)
const sent: FaucetResult = { kind: 'sent', signature: 'test-signature', confirmed: true, explorer: null }
const uncertain: FaucetResult = { ...sent, confirmed: false }
const walletA = new PublicKey(new Uint8Array(32).fill(7)).toBase58()
const walletB = new PublicKey(new Uint8Array(32).fill(8)).toBase58()
beforeEach(() => {
  vi.resetAllMocks(); hooks.cells = []; hooks.effects = []; hooks.cursor = 0; vi.useFakeTimers()
  rpc.getProtocolConfig.mockResolvedValue({ account: { allowedStakeMint: PublicKey.default } })
  rpc.getBalance.mockResolvedValue(0)
  vi.mocked(readTestTokenBalance).mockResolvedValue(0n)
})
afterEach(() => { hooks.cells.forEach((cell) => cell?.cleanup?.()); vi.useRealTimers() })

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
    render('A', onA).request(); await flush()
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
    const old = render('A'); old.request(); await flush()
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
    await flush()
    expect(requestTestTokens).toHaveBeenCalledOnce()
    hooks.cells.forEach((cell) => cell?.cleanup?.())
    finish(sent); await flush()
    expect(onSent).not.toHaveBeenCalled()
  })

  it('confirms an uncertain send only after both wallet balances show the credit', async () => {
    vi.mocked(requestTestTokens).mockResolvedValue(uncertain)
    vi.mocked(readTestTokenBalance).mockResolvedValueOnce(0n).mockResolvedValue(50_000_000n)
    rpc.getBalance.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValue(50_000_000)
    const onSent = vi.fn()
    render(walletA, onSent).request(); await flush()
    expect(faucetLine(render(walletA, onSent).result!)).toBe('Checking whether it went through…')
    await vi.advanceTimersByTimeAsync(5000)
    expect(render(walletA, onSent).result).toEqual(sent)
    expect(requestTestTokens).toHaveBeenCalledOnce()
    expect(faucetLine(render(walletA, onSent).result!)).toBe('Sent: 50 tSKR and 0.05 SOL.')
    expect(onSent).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['unchanged', 'rpc-error', 'hung'] as const)('ends uncertain checking within 30 seconds with %s balances and permits retry', async (failure) => {
    vi.mocked(requestTestTokens).mockResolvedValue(uncertain)
    // Existing funds alone cannot prove this claim landed.
    vi.mocked(readTestTokenBalance).mockResolvedValue(100_000_000n)
    rpc.getBalance.mockResolvedValue(1_000_000_000)
    if (failure !== 'unchanged') rpc.getBalance.mockResolvedValueOnce(1_000_000_000).mockImplementation(() => failure === 'hung' ? new Promise(() => {}) : Promise.reject(new Error('rpc')))
    render(walletA).request(); await flush()
    expect(render(walletA).result).toEqual(uncertain)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(render(walletA)).toMatchObject({ status: 'done', result: { kind: 'unreachable' } })
    expect(faucetLine(render(walletA).result!)).not.toContain('Checking')
    expect(vi.getTimerCount()).toBe(0)
    render(walletA).request(); await flush()
    if (failure === 'hung') await vi.advanceTimersByTimeAsync(5000)
    expect(requestTestTokens).toHaveBeenCalledTimes(2)
  })

  it('cancels uncertain credit checks on wallet switch and ignores a late balance from A', async () => {
    const onA = vi.fn(); const onB = vi.fn()
    let finish!: (amount: number) => void
    rpc.getBalance.mockResolvedValueOnce(0).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    vi.mocked(readTestTokenBalance).mockResolvedValueOnce(0n).mockResolvedValue(50_000_000n)
    vi.mocked(requestTestTokens).mockResolvedValueOnce(uncertain).mockResolvedValue({ kind: 'limited' })
    render(walletA, onA).request(); await flush()
    expect(render(walletA, onA).result).toEqual(uncertain)
    expect(rpc.getBalance).toHaveBeenCalledTimes(2)
    render(walletB, onB).request(); await flush()
    const reads = rpc.getBalance.mock.calls.length
    finish(50_000_000); await vi.advanceTimersByTimeAsync(30_000)
    expect(render(walletB, onB).result).toEqual({ kind: 'limited' })
    expect(rpc.getBalance).toHaveBeenCalledTimes(reads)
    expect(onA).toHaveBeenCalledOnce(); expect(onB).not.toHaveBeenCalled()
    expect(render(walletA, onA).result).toBeNull()
  })

  it('bounds an unreadable pre-request balance and never invents a confirmed credit', async () => {
    rpc.getBalance.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(50_000_000)
    vi.mocked(readTestTokenBalance).mockResolvedValue(50_000_000n)
    vi.mocked(requestTestTokens).mockResolvedValue(uncertain)
    render(walletA).request(); await vi.advanceTimersByTimeAsync(5000)
    expect(requestTestTokens).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(render(walletA).result).toEqual({ kind: 'unreachable' })
  })
})
