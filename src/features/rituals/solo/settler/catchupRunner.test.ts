import { describe, expect, it, vi } from 'vitest'
import { Keypair } from '@solana/web3.js'
import type { RitualBundleRead } from '../../../../data/rituals/ritualsRpc'
import { ejectRitualAddress, soloAccount } from '../../../../data/rituals/ejectTestHelpers'
import { failureKey, runCatchup, runWalletCatchup } from './catchupRunner'

const owner = Keypair.generate().publicKey
const schedule = Array.from({ length: 6 }, (_, index) => ({ opens: BigInt(1000 + index * 60), deadline: BigInt(1045 + index * 60), resolution: BigInt(1055 + index * 60) }))
const read = (index: number): RitualBundleRead => ({ slot: 50 + index, ritual: { slot: 50 + index, address: ejectRitualAddress,
  account: soloAccount({ creator: owner, members: [owner], schedule, currentEventIndex: index, settledEventCount: index, status: index === 6 ? 'Completed' : 'Active' }) }, event: null, claims: [] }) as unknown as RitualBundleRead
const setup = () => {
  let current = 1
  const calls: string[] = []
  const client = { getRitualBundle: vi.fn(async () => { calls.push(`read:${current}`); return read(current) }) }
  const settle = vi.fn(async (input) => { calls.push(`settle:${input.eventIndex}:${input.needsEventInit}`); current++; return { ok: true as const, signatures: ['s'] } })
  const input = { client: client as never, bundle: read(1), ritualAddress: ejectRitualAddress, settler: owner,
    lock: { current: false }, failures: new Map<string, number>(), now: () => 1500, mayContinue: () => true, getBalance: vi.fn(async () => 100_000_000) }
  return { input, settle, client, calls }
}
const noWait = async () => undefined

describe('one catch-up runner', () => {
  it('closes weeks 2–6 in order with a current bundle read between, no UI/history reload', async () => {
    const { input, settle, calls } = setup()
    expect(await runCatchup(input, settle, noWait)).toEqual({ changed: true, blocked: false })
    expect(calls).toEqual(['read:1', ...[1, 2, 3, 4, 5].flatMap((index) => [`settle:${index}:true`, `read:${index + 1}`])])
    expect(input.getBalance).toHaveBeenCalledTimes(5)
    expect(input.lock.current).toBe(false)
  })
  it('locks synchronously against duplicate effects and against another screen runner', async () => {
    const { input, settle } = setup()
    let release!: (value: number) => void
    input.getBalance.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const running = runCatchup(input, settle, noWait)
    expect(input.lock.current).toBe(true)
    expect(await runCatchup(input, settle, noWait)).toEqual({ changed: false, blocked: false, deferred: true })
    expect(await runCatchup({ ...input, lock: { current: false } }, settle, noWait)).toEqual({ changed: false, blocked: false, deferred: true })
    release(100_000_000)
    await running
    expect(settle).toHaveBeenCalledTimes(5)
  })
  it('stops after three failures, retaining the cap across reruns for the manual button', async () => {
    const { input } = setup()
    const fail = vi.fn(async () => ({ ok: false as const, step: 'finalize' as const, category: 'submission' }))
    expect(await runCatchup(input, fail, noWait)).toEqual({ changed: false, blocked: true })
    expect(fail).toHaveBeenCalledTimes(3)
    expect(input.failures.get(failureKey(input.bundle))).toBe(3)
    await runCatchup(input, fail, noWait)
    expect(fail).toHaveBeenCalledTimes(3)
  })
  it('does not count visibility/unmount cancellation as failure or send the next week', async () => {
    const { input, settle } = setup()
    let visible = true
    input.mayContinue = () => visible
    settle.mockImplementationOnce(async () => { visible = false; return { ok: true, signatures: ['s'] } })
    await runCatchup(input, settle, noWait)
    expect(settle).toHaveBeenCalledOnce()
    expect(input.failures.size).toBe(0)
    expect(input.lock.current).toBe(false)
  })
  it('rechecks visibility after the balance read, and respects the funding floor', async () => {
    const { input, settle } = setup()
    input.getBalance.mockResolvedValueOnce(0)
    expect(await runCatchup(input, settle, noWait)).toMatchObject({ blocked: true })
    input.getBalance.mockImplementationOnce(async () => { input.mayContinue = () => false; return 100_000_000 })
    await runCatchup(input, settle, noWait)
    expect(settle).not.toHaveBeenCalled()
  })
  it('does not settle an open week or at the resolution boundary', async () => {
    const { input, settle } = setup()
    await runCatchup({ ...input, now: () => Number(schedule[1].resolution) }, settle, noWait)
    expect(settle).not.toHaveBeenCalled()
  })
  it('reconciles an uncertain send before retrying it', async () => {
    const { input, settle, client } = setup()
    const uncertain = vi.fn(async (args) => { await settle(args); return { ok: false as const, step: 'finalize' as const, category: 'confirmation' } })
    expect(await runCatchup(input, uncertain, noWait)).toEqual({ changed: true, blocked: false })
    expect(uncertain.mock.calls.map(([args]) => args.eventIndex)).toEqual([1, 2, 3, 4, 5])
    expect(client.getRitualBundle).toHaveBeenCalledTimes(6)
  })
  it('never resends a confirmed close while readback still lags', async () => {
    const { input } = setup()
    const settled = vi.fn(async () => ({ ok: true as const, signatures: ['s'] }))
    expect(await runCatchup(input, settled, noWait)).toEqual({ changed: true, blocked: true })
    expect(settled).toHaveBeenCalledOnce()
  })
})

describe('Home wallet queue', () => {
  it('selects only ritualsForWallet and awaits each ritual before the next', async () => {
    const mine = { id: 'mine', bundle: read(1) }
    const next = { ...mine, id: 'next' }
    const otherOwner = Keypair.generate().publicKey
    const other = { id: 'other', bundle: { ...read(1), ritual: { ...read(1).ritual, account: soloAccount({ creator: otherOwner, members: [otherOwner] }) } } }
    const calls: string[] = []
    let release!: () => void
    const run = vi.fn(async (item: typeof mine) => { calls.push(item.id); if (item.id === 'mine') await new Promise<void>((resolve) => { release = resolve }) })
    await runWalletCatchup([mine, other], null, () => true, run)
    expect(run).not.toHaveBeenCalled()
    const running = runWalletCatchup([mine, other, next], owner, () => true, run)
    expect(calls).toEqual(['mine'])
    release(); await running
    expect(calls).toEqual(['mine', 'next'])
  })
  it('stops the queue when the wallet changes or Home unmounts', async () => {
    let active = true
    const run = vi.fn(async () => { active = false })
    await runWalletCatchup([{ bundle: read(1) }, { bundle: read(1) }], owner, () => active, run)
    expect(run).toHaveBeenCalledOnce()
  })
})
