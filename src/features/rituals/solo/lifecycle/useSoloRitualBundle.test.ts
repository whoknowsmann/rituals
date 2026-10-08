import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRitualBundle } from '../../authoritativeRituals'
import { useSoloRitualBundle } from './useSoloRitualBundle'
import { soloReceiptMoneyLine } from './soloReceiptModel'
import { soloAccount, soloEvent, ejectRitualAddress } from '../../../../data/rituals/ejectTestHelpers'
import type { RitualBundleRead } from '../../../../data/rituals/ritualsRpc'

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
vi.mock('../../authoritativeRituals', () => ({ useRitualBundle: vi.fn() }))
const account = soloAccount({ status: 'Completed', currentEventIndex: 3, settledEventCount: 3 })
const read = (index: number) => ({ ritual: { address: ejectRitualAddress, account }, event: {
  account: soloEvent(index, { status: 'Settled', forfeitedTotal: index === 2 ? 5_000_000n : 0n }),
}, claims: [] }) as unknown as RitualBundleRead
const client = { status: 'ready' as const, client: { getEventBundle: vi.fn() } } as unknown as Parameters<typeof useSoloRitualBundle>[0] & { client: { getEventBundle: ReturnType<typeof vi.fn> } }
const render = (index: number) => {
  hooks.cursor = 0
  const result = useSoloRitualBundle(client, ejectRitualAddress.toBase58(), index)
  hooks.effects.splice(0).forEach((effect) => effect())
  return result
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
beforeEach(() => {
  vi.resetAllMocks(); hooks.cells = []; hooks.effects = []; hooks.cursor = 0
  vi.mocked(useRitualBundle).mockReturnValue({ status: 'ready', bundle: read(2), retry: vi.fn() })
  client.client.getEventBundle.mockImplementation(async (_address, index) => read(index))
})

describe('final receipt historical reads (effect harness)', () => {
  it('reads only the missing historical weeks, then exposes the full shared totals', async () => {
    const first = render(2)
    expect(soloReceiptMoneyLine(first.bundle!)).toBeNull()
    expect(useRitualBundle).toHaveBeenLastCalledWith(client, ejectRitualAddress.toBase58(), 2)
    await flush()
    const ready = render(2)
    expect(client.client.getEventBundle.mock.calls.map(([, index]) => index)).toEqual([0, 1])
    expect(soloReceiptMoneyLine(ready.bundle!)).toBe('10 of 15 tSKR back · 5 tSKR to the wallet you chose')
  })
  it('keeps non-final receipts as one-week reads', async () => {
    vi.mocked(useRitualBundle).mockReturnValue({ status: 'ready', bundle: read(0), retry: vi.fn() })
    render(0); await flush()
    expect(client.client.getEventBundle).not.toHaveBeenCalled()
    expect(soloReceiptMoneyLine(render(0).bundle!)).toBe('5 tSKR back to you')
  })
  it('never substitutes a weekly amount or guessed total if one history read fails', async () => {
    client.client.getEventBundle.mockRejectedValueOnce(new Error('offline'))
    render(2); await flush()
    expect(soloReceiptMoneyLine(render(2).bundle!)).toBeNull()
  })
  it('discards history arriving after unmount', async () => {
    let finish!: (bundle: RitualBundleRead) => void
    client.client.getEventBundle.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(2)
    hooks.cells.forEach((cell) => cell?.cleanup?.())
    finish(read(0)); await flush()
    expect(soloReceiptMoneyLine(render(2).bundle!)).toBeNull()
  })
})
