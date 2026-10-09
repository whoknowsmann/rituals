import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicKey, type Connection } from '@solana/web3.js'
import { resolvePendingActions, usePendingRitualRecovery } from './usePendingRitualRecovery'
import type { PendingActionRecord, PendingActionStore } from './pendingAction'
import type { RitualClientState } from '../client/useRitualClient'

const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[], wallet: null as any }))
vi.mock('react', () => ({
  useRef: (value: unknown) => { const i = hooks.cursor++; return hooks.cells[i] ??= { current: value } },
  useState: (value: unknown) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = value; return [hooks.cells[i], (next: unknown) => { hooks.cells[i] = next }] },
  useEffect: (callback: () => unknown, deps: unknown[]) => {
    const i = hooks.cursor++; const previous = hooks.cells[i]
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) hooks.effects.push(() => { previous?.cleanup?.(); hooks.cells[i] = { deps, cleanup: callback() } })
  },
}))
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) } }))
vi.mock('../../../utils/useAuthorization', () => ({ useAuthorization: () => ({ selectedAccount: hooks.wallet ? { publicKey: hooks.wallet } : null }) }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))
vi.mock('./readPendingAction', () => ({ readPendingAction: async () => ({ slot: 100, actionObserved: true }) }))
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const a = key(1); const b = key(2)
const record = (actor?: string): PendingActionRecord => ({ version: 1, actionKind: 'claim', ritualAddress: key(3).toBase58(), messageDigest: (actor === a.toBase58() ? 'a' : 'b').repeat(64), blockhash: key(4).toBase58(), lastValidBlockHeight: 100, createdAt: 1, ...(actor ? { actor, eventIndex: 0 } : {}) })
const transport = () => ({ getBlockHeight: vi.fn(async () => 101), getSignatureStatus: vi.fn(async () => null), readRitual: vi.fn(async () => ({ slot: 100, actionObserved: true })) })
const store = (...records: PendingActionRecord[]) => ({ list: vi.fn(async () => records), remove: vi.fn(async () => undefined), upsert: vi.fn() })
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
beforeEach(() => { vi.clearAllMocks(); hooks.cells = []; hooks.cursor = 0; hooks.effects = []; hooks.wallet = a })
afterEach(() => { hooks.cells.forEach((cell) => cell?.cleanup?.()) })

describe('connected-wallet pending recovery', () => {
  it('resolves only A and retains B and ownerless legacy journals', async () => {
    const own = record(a.toBase58()); const storage = store(own, record(b.toBase58()), record())
    const rpc = transport()
    expect(await resolvePendingActions(storage, rpc, a.toBase58())).toEqual([{ status: 'confirmed', record: own, slot: 100 }])
    expect(rpc.readRitual).toHaveBeenCalledOnce()
    expect(storage.remove).toHaveBeenCalledExactlyOnceWith(own)
  })
  it('does no recovery while disconnected', async () => {
    const storage = store(record(a.toBase58())); const rpc = transport()
    expect(await resolvePendingActions(storage, rpc, null)).toEqual([])
    expect(storage.list).not.toHaveBeenCalled(); expect(rpc.readRitual).not.toHaveBeenCalled()
  })
  it('does not remove or report a journal after the wallet changes during a read', async () => {
    const storage = store(record(a.toBase58())); const rpc = transport()
    let active = true
    rpc.readRitual.mockImplementationOnce(async () => { active = false; return { slot: 100, actionObserved: true } })
    expect(await resolvePendingActions(storage, rpc, a.toBase58(), () => active)).toEqual([])
    expect(storage.remove).not.toHaveBeenCalled()
  })
  it('hides the old notice immediately on A to none to B to A', async () => {
    const storage: PendingActionStore = store(record(a.toBase58()))
    const client = { status: 'ready', client: {} } as RitualClientState
    const connection = { getBlockHeight: async () => 100 } as Connection
    const render = (wallet: PublicKey | null) => {
      hooks.wallet = wallet; hooks.cursor = 0
      const result = usePendingRitualRecovery(client, connection, storage)
      hooks.effects.splice(0).forEach((effect) => effect())
      return result
    }
    render(a); await flush()
    expect(render(a)?.resolution.status).toBe('confirmed')
    expect(render(null)).toBeNull()
    expect(render(b)).toBeNull(); await flush()
    expect(render(b)).toBeNull()
    expect(render(a)).toBeNull(); await flush()
    expect(render(a)?.resolution.record.actor).toBe(a.toBase58())
  })
})
