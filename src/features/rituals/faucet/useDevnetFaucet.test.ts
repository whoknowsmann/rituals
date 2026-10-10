import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { faucetLine, requestTestTokens, type FaucetResult } from './devnetFaucet'
import { readTestTokenBalance } from './testTokenBalance'
import { useDevnetFaucet } from './useDevnetFaucet'

const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[] }))
const connection = vi.hoisted(() => ({ getBalance: vi.fn() }))
vi.mock('../../../utils/ConnectionProvider', () => ({ useConnection: () => ({ connection }) }))
vi.mock('./testTokenBalance', () => ({ readTestTokenBalance: vi.fn() }))
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
  const result = useDevnetFaucet(wallet === null ? null : new PublicKey(new Uint8Array(32).fill(wallet === 'A' ? 7 : 8)).toBase58(), onSent)
  hooks.effects.splice(0).forEach((effect) => effect())
  return result
}
const flush = () => vi.advanceTimersByTimeAsync(0)
const sent: FaucetResult = { kind: 'sent', signature: 'test-signature', confirmed: true, explorer: null }
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); hooks.cells = []; hooks.effects = []; hooks.cursor = 0
  connection.getBalance.mockResolvedValue(0)
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
    const current = render('A', onSent); current.request(); current.request(); await flush()
    expect(requestTestTokens).toHaveBeenCalledOnce()
    hooks.cells.forEach((cell) => cell?.cleanup?.())
    finish(sent); await flush()
    expect(onSent).not.toHaveBeenCalled()
  })

  it('resolves an uncertain send when both wallet balances show the credit', async () => {
    const onSent = vi.fn()
    vi.mocked(requestTestTokens).mockResolvedValue({ ...sent, confirmed: false } as FaucetResult)
    render('A', onSent).request(); await flush()
    expect(faucetLine(render('A', onSent).result!)).toBe('Checking whether it went through…')
    render('A', onSent).request()
    expect(requestTestTokens).toHaveBeenCalledOnce()
    connection.getBalance.mockResolvedValue(50_000_000)
    vi.mocked(readTestTokenBalance).mockResolvedValue(50_000_000n)
    await vi.advanceTimersByTimeAsync(5000)
    expect(render('A', onSent).result).toEqual(sent)
    expect(faucetLine(render('A', onSent).result!)).toBe('Sent: 50 tSKR and 0.05 SOL.')
    expect(onSent).toHaveBeenCalledTimes(2)
    const reads = connection.getBalance.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(connection.getBalance).toHaveBeenCalledTimes(reads)
  })

  it.each(['unchanged', 'tokens-only', 'sol-only', 'rpc-error', 'hung'] as const)('ends %s checks at 30 seconds in a retryable neutral state', async (outcome) => {
    connection.getBalance.mockResolvedValue(100_000_000)
    vi.mocked(readTestTokenBalance).mockResolvedValue(100_000_000n)
    vi.mocked(requestTestTokens).mockResolvedValue({ ...sent, confirmed: false } as FaucetResult)
    render('A').request(); await flush()
    if (outcome === 'tokens-only') vi.mocked(readTestTokenBalance).mockResolvedValue(150_000_000n)
    if (outcome === 'sol-only') connection.getBalance.mockResolvedValue(150_000_000)
    if (outcome === 'rpc-error') connection.getBalance.mockRejectedValue(new Error('RPC unavailable'))
    if (outcome === 'hung') connection.getBalance.mockImplementation(() => new Promise(() => undefined))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(render('A')).toMatchObject({ status: 'done', result: { kind: 'unreachable' } })
    const reads = connection.getBalance.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(connection.getBalance).toHaveBeenCalledTimes(reads)
    connection.getBalance.mockResolvedValue(0)
    vi.mocked(requestTestTokens).mockResolvedValue(sent)
    render('A').request(); await flush()
    expect(requestTestTokens).toHaveBeenCalledTimes(2)
    expect(render('A').result).toEqual(sent)
  })

  it('cancels uncertain balance reads on A to B to A and on unmount', async () => {
    const onA = vi.fn()
    let finish!: (value: number) => void
    connection.getBalance.mockResolvedValueOnce(0).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    vi.mocked(requestTestTokens).mockResolvedValue({ ...sent, confirmed: false } as FaucetResult)
    render('A', onA).request(); await flush()
    expect(connection.getBalance).toHaveBeenCalledTimes(2)
    expect(readTestTokenBalance).toHaveBeenCalledWith(connection, expect.any(PublicKey), new PublicKey(new Uint8Array(32).fill(7)))
    render('B'); render('A')
    finish(50_000_000); await vi.advanceTimersByTimeAsync(60_000)
    expect(render('A')).toMatchObject({ status: 'idle', result: null })
    expect(onA).toHaveBeenCalledOnce()
    expect(connection.getBalance).toHaveBeenCalledTimes(2)
    connection.getBalance.mockResolvedValue(0)
    render('A').request(); await flush()
    hooks.cells.forEach((cell) => cell?.cleanup?.())
    const reads = connection.getBalance.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(connection.getBalance).toHaveBeenCalledTimes(reads)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds a hung baseline without blocking the request or inventing confirmation', async () => {
    connection.getBalance.mockImplementation(() => new Promise(() => undefined))
    vi.mocked(requestTestTokens).mockResolvedValue({ ...sent, confirmed: false } as FaucetResult)
    render('A').request()
    await vi.advanceTimersByTimeAsync(5000)
    expect(requestTestTokens).toHaveBeenCalledOnce()
    connection.getBalance.mockResolvedValue(50_000_000)
    vi.mocked(readTestTokenBalance).mockResolvedValue(50_000_000n)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(render('A').result).toEqual({ kind: 'unreachable' })
  })
})
