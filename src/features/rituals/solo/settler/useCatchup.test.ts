import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair, type Connection } from '@solana/web3.js'
import { AppState } from 'react-native'
import { soloAccount, ejectRitualAddress } from '../../../../data/rituals/ejectTestHelpers'
import type { RitualBundleRead } from '../../../../data/rituals/ritualsRpc'
import { runCatchup, catchupFailures } from './catchupRunner'
import { loadOrCreateSettler } from './settlerKey'
import { createSettlerClient } from './settlerClient'
import { useCatchup } from './useCatchup'

const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[] }))
vi.mock('react', () => ({
  useRef: (value: unknown) => { const i = hooks.cursor++; return hooks.cells[i] ??= { current: value } },
  useState: (value: unknown) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = value; return [hooks.cells[i], (next: unknown) => { hooks.cells[i] = next }] },
  useEffect: (callback: () => unknown, deps: unknown[]) => {
    const i = hooks.cursor++; const previous = hooks.cells[i]
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) {
      hooks.effects.push(() => { previous?.cleanup?.(); hooks.cells[i] = { deps, cleanup: callback() } })
    }
  },
}))
vi.mock('react-native', () => ({ AppState: { currentState: 'active' } }))
vi.mock('./settlerKey', () => ({ loadOrCreateSettler: vi.fn() }))
vi.mock('./settlerClient', () => ({ createSettlerClient: vi.fn() }))
vi.mock('./catchupRunner', async (original) => ({ ...await original<typeof import('./catchupRunner')>(), runCatchup: vi.fn() }))
const owner = Keypair.generate().publicKey
const other = Keypair.generate().publicKey
const bundle = (creator = owner) => ({ slot: 1, ritual: { address: ejectRitualAddress, account: soloAccount({ creator, members: [creator] }) }, event: null, claims: [] }) as unknown as RitualBundleRead
const defaults = () => ({ connection: {} as Connection, rituals: [{ bundle: bundle() }], now: 1400, focused: true, scope: 'home' as const, wallet: owner, onChanged: vi.fn() })
const render = (input: Parameters<typeof useCatchup>[0]) => { hooks.cursor = 0; const result = useCatchup(input); hooks.effects.splice(0).forEach((effect) => effect()); return result }
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
beforeEach(() => {
  vi.resetAllMocks(); hooks.cells = []; hooks.effects = []; hooks.cursor = 0; catchupFailures.clear()
  AppState.currentState = 'active'
  vi.mocked(loadOrCreateSettler).mockResolvedValue(Keypair.generate())
  vi.mocked(createSettlerClient).mockReturnValue({} as never)
  vi.mocked(runCatchup).mockResolvedValue({ changed: true, blocked: false })
})

describe('foreground catch-up hook (effect harness, not a device renderer)', () => {
  it.each(['disconnected', 'other-wallet', 'blurred', 'background'] as const)('never starts on %s', async (reason) => {
    const input: Parameters<typeof useCatchup>[0] = defaults()
    if (reason === 'disconnected') input.wallet = null
    if (reason === 'other-wallet') input.rituals = [{ bundle: bundle(other) }]
    if (reason === 'blurred') input.focused = false
    if (reason === 'background') AppState.currentState = 'background'
    render(input); await flush()
    expect(loadOrCreateSettler).not.toHaveBeenCalled()
    expect(runCatchup).not.toHaveBeenCalled()
  })
  it('starts only the connected wallet and refreshes once after the runner, not on every tick', async () => {
    const input = defaults(); input.rituals.push({ bundle: bundle(other) })
    render(input); await flush()
    expect(runCatchup).toHaveBeenCalledOnce()
    expect(vi.mocked(runCatchup).mock.calls[0][0].bundle.ritual.account.creator.equals(owner)).toBe(true)
    expect(input.onChanged).toHaveBeenCalledOnce()
    render({ ...input, now: 1401 }); await flush()
    expect(runCatchup).toHaveBeenCalledOnce()
  })
  it.each(['wallet', 'blur', 'unmount', 'background'] as const)('stops mayContinue and the actual send guard on %s', async (reason) => {
    const input = defaults()
    let finish!: (value: { changed: boolean; blocked: boolean }) => void
    vi.mocked(runCatchup).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(input); await flush()
    const run = vi.mocked(runCatchup).mock.calls[0][0]
    const send = vi.mocked(createSettlerClient).mock.calls[0][2]!
    expect(run.mayContinue(input.rituals[0].bundle)).toBe(true)
    if (reason === 'wallet') render({ ...input, wallet: other })
    if (reason === 'blur') render({ ...input, focused: false })
    if (reason === 'unmount') hooks.cells.forEach((cell) => cell?.cleanup?.())
    if (reason === 'background') AppState.currentState = 'background'
    expect(send()).toBe(false)
    expect(run.mayContinue(input.rituals[0].bundle)).toBe(false)
    finish({ changed: true, blocked: false }); await flush()
    if (reason === 'unmount') expect(input.onChanged).not.toHaveBeenCalled()
  })
  it('retries a deferred cross-screen lock on the next tick instead of stranding the ritual', async () => {
    const input = defaults()
    vi.mocked(runCatchup).mockResolvedValueOnce({ changed: false, blocked: false, deferred: true })
    render(input); await flush()
    render({ ...input, now: 1401 }); await flush()
    expect(runCatchup).toHaveBeenCalledTimes(2)
    expect(input.onChanged).toHaveBeenCalledOnce()
  })
})
