import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { DEMO_CAUSE } from '../data/rituals/demoConfig'
import type { SoloRitualBundle } from '../features/rituals/solo/lifecycle/soloRitualModel'
import { widgetOutcomeFromBundle } from './widgetBundle'
import { widgetModel } from './widgetModel'

const me = new PublicKey(new Uint8Array(32).fill(7))
const window = { opens: 100n, deadline: 200n, resolution: 250n }
const event = (index = 0, status = 'Settled', forfeitedTotal = 0n) => ({ account: { eventIndex: index, status, forfeitedTotal, voidReason: 'None', window } })
const bundle = (account = {}, current: unknown = null, claims: unknown[] = [], history: unknown[] = []): SoloRitualBundle => ({
  slot: 1,
  ritual: { address: me, account: { kind: 'Solo', status: 'Active', schedule: [window, { opens: 400n, deadline: 500n, resolution: 550n }], members: [me], forfeitDestination: DEMO_CAUSE.tokenAccount ?? me, perEventAllocation: 5000000n, stakeDecimals: 6, witness: null, currentEventIndex: 0, skipDeclared: false, ...account } },
  event: current, claims, history,
}) as unknown as SoloRitualBundle
const map = (read: SoloRitualBundle, outcomes?: ReadonlyMap<number, 'done' | 'missed'>) => widgetOutcomeFromBundle({ address: 'ritual', bundle: read }, 150, outcomes)

describe('foreground snapshot adapter', () => {
  it('stores every exact chain window plus stake and cause labels, with no / WK suffix', () => {
    expect(map(bundle())).toEqual({ address: 'ritual', active: true, stakeLabel: '5 TEST', causeLabel: DEMO_CAUSE.label, weeks: [{ opens: 100, deadline: 200, outcome: 'pending' }, { opens: 400, deadline: 500, outcome: 'pending' }] })
    expect(map(bundle({ perEventAllocation: 2500000n }))?.stakeLabel).toBe('2.5 TEST')
  })
  it('counts a confirmed current stamp before settlement (even with a Home batch)', () => {
    const read = bundle({}, event(0, 'Claiming'), [{ member: me, account: { status: 'Confirmed' } }])
    const result = map(read, new Map())!
    expect(result.weeks[0].outcome).toBe('kept')
    expect(widgetModel([{ address: 'ritual', title: 'Read' }], [result], 150)).toMatchObject({ state: 'stamped', streak: 1 })
  })
  it('does not count pending or unread claims as kept', () => {
    for (const account of [{ status: 'Pending' }, null]) {
      expect(map(bundle({ witness: me }, event(0, 'Claiming'), [{ member: me, account }]))?.weeks[0].outcome).toBe('pending')
    }
  })
  it('uses batched closed outcomes and keeps missing history unknown', () => {
    expect(map(bundle({ currentEventIndex: 1 }), new Map([[0, 'missed']]))?.weeks[0].outcome).toBe('missed')
    expect(map(bundle({ currentEventIndex: 1 }))?.weeks[0].outcome).toBe('unknown')
    const read = bundle({ currentEventIndex: 1 }, null, [], [bundle({}, event())])
    expect(map(read)?.weeks[0].outcome).toBe('kept')
    expect(map(read, new Map())?.weeks[0].outcome).toBe('unknown')
  })
  it('uses a terminal current result without marking the whole ritual finished', () => {
    expect(map(bundle({}, event(0, 'Settled', 1n)))).toMatchObject({ active: true, weeks: [{ opens: 100, deadline: 200, outcome: 'missed' }, { opens: 400, deadline: 500, outcome: 'pending' }] })
  })
  it('never credits a declared skip or a voided refund as a kept-week stamp', () => {
    expect(map(bundle({ currentEventIndex: 1, skipDeclared: true, skipEventIndex: 0 }), new Map([[0, 'done']]))?.weeks[0].outcome).toBe('skipped')
    expect(map(bundle({}, event(0, 'Voided')))?.weeks[0].outcome).toBe('skipped')
  })
  it('stores completed results in order, with unread weeks still unknown', () => {
    const read = bundle({ status: 'Completed', currentEventIndex: 2 }, event(1, 'Settled', 1n))
    expect(map(read, new Map([[0, 'done']]))).toMatchObject({ active: false, weeks: [{ opens: 100, deadline: 200, outcome: 'kept' }, { opens: 400, deadline: 500, outcome: 'missed' }] })
    expect(map(read)?.weeks[0].outcome).toBe('unknown')
  })
  it('ignores unsupported accounts', () => {
    for (const account of [{ kind: 'Group' }, { status: 'Funding' }, { status: 'Cancelled' }, { schedule: [] }]) expect(map(bundle(account))).toBeNull()
  })
})
