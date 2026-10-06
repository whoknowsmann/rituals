import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import type { SoloRitualBundle } from '../features/rituals/solo/lifecycle/soloRitualModel'
import { widgetOutcomeFromBundle } from './widgetBundle'

const me = new PublicKey(new Uint8Array(32).fill(7))
const window = { opens: 100n, deadline: 200n, resolution: 250n }
const event = (index = 0, status = 'Settled', forfeitedTotal = 0n) => ({ account: { eventIndex: index, status, forfeitedTotal, voidReason: 'None', window } })
const bundle = (account = {}, current: unknown = null, claims: unknown[] = [], history: unknown[] = []): SoloRitualBundle => ({
  slot: 1,
  ritual: { address: me, account: { kind: 'Solo', status: 'Active', schedule: [window, { opens: 400n, deadline: 500n, resolution: 550n }], members: [me], forfeitDestination: me, perEventAllocation: 1n, witness: null, currentEventIndex: 0, skipDeclared: false, ...account } },
  event: current, claims, history,
}) as unknown as SoloRitualBundle
const map = (read: SoloRitualBundle, now = 150, outcomes?: ReadonlyMap<number, 'done' | 'missed'>) => widgetOutcomeFromBundle({ address: 'ritual', bundle: read }, now, outcomes)

describe('foreground bundle adapter', () => {
  it('takes exact windows from the chain, not either cadence constant', () => {
    expect(map(bundle(), 50)).toMatchObject({ status: 'waiting', opens: 100, deadline: 200, weekCount: 2 })
    expect(map(bundle(), 100)?.status).toBe('open')
    expect(map(bundle(), 201)?.status).toBe('closing')
    expect(map(bundle(), 251)?.status).toBe('closing')
  })
  it('counts a confirmed current stamp once, even when also in outcomes', () => {
    const read = bundle({}, event(0, 'Claiming'), [{ member: me, account: { status: 'Confirmed' } }])
    expect(map(read)).toMatchObject({ status: 'stamped', kept: 1, missed: 0 })
    expect(map(read, 150, new Map([[0, 'done']]))?.kept).toBe(1)
    expect(map(read, 201)?.status).toBe('stamped')
  })
  it('does not count a pending witness claim as kept', () => {
    expect(map(bundle({ witness: me }, event(0, 'Claiming'), [{ member: me, account: { status: 'Pending' } }]))).toMatchObject({ status: 'awaiting-witness', kept: 0 })
  })
  it('uses complete Home outcomes for last-week misses', () => {
    expect(map(bundle({ currentEventIndex: 1 }), 300, new Map([[0, 'missed']]))).toMatchObject({ status: 'missed', missed: 1, kept: 0, weekIndex: 1 })
    expect(map(bundle({ currentEventIndex: 1 }), 400, new Map([[0, 'missed']]))?.status).toBe('open')
  })
  it('uses enriched ritual history and never fills absent history with guesses', () => {
    expect(map(bundle({ currentEventIndex: 1 }), 300)).toBeNull()
    expect(map(bundle({ currentEventIndex: 1 }, null, [], [bundle({}, event(0, 'Settled', 1n))]), 300)).toMatchObject({ status: 'missed', missed: 1 })
  })
  it('clamps completion and remembers the final result, not merely aggregate counts', () => {
    const read = bundle({ status: 'Completed', currentEventIndex: 2 }, event(1, 'Settled', 1n))
    expect(map(read, 600, new Map([[0, 'done'], [1, 'missed']]))).toMatchObject({ weekIndex: 1, status: 'finished-missed', kept: 1, missed: 1 })
    expect(map(bundle({ status: 'Completed', currentEventIndex: 2 }), 600, new Map([[0, 'missed'], [1, 'done']]))?.status).toBe('finished-stamped')
  })
  it('matches Home: a voided week returned the stake; it is not a miss', () => {
    const skipped = { account: { ...event().account, status: 'Voided', voidReason: 'DeclaredSkip' } }
    expect(map(bundle({ currentEventIndex: 1, skipDeclared: true, skipEventIndex: 0 }, null, [], [bundle({}, skipped)]), 300)).toMatchObject({ status: 'skipped', kept: 1, missed: 0 })
  })
  it('never offers another stamp for a terminal current event while its index catches up', () => {
    expect(map(bundle({}, event(0, 'Settled', 1n)))).toMatchObject({ status: 'missed-current', missed: 1 })
    expect(map(bundle({}, event()))).toMatchObject({ status: 'stamped', kept: 1 })
    expect(map(bundle({}, event(0, 'Voided')))).toMatchObject({ status: 'skipped-current', kept: 1 })
  })
  it('shows the final skip as a skip, not a stamp', () => {
    expect(map(bundle({ status: 'Completed', currentEventIndex: 2 }, event(1, 'Voided')), 600, new Map([[0, 'done']]))?.status).toBe('finished-skipped')
  })
  it.each([{ kind: 'Group' }, { status: 'Funding' }, { status: 'Cancelled' }, { schedule: [] }])('ignores unsupported/nonactive account %o', (overrides) => expect(map(bundle(overrides))).toBeNull())
})
