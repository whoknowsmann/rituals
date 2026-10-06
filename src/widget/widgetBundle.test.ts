import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { soloRitualModel, type SoloRitualBundle } from '../features/rituals/solo/lifecycle/soloRitualModel'
import { soloHomeCells } from '../features/rituals/home/soloHistory'
import { tileStatus } from '../features/rituals/home/tileStatus'
import { widgetOutcomeFromBundle } from './widgetBundle'
import { widgetModel } from './widgetModel'

const me = new PublicKey(new Uint8Array(32).fill(7))
const window = { opens: 100n, deadline: 200n, resolution: 250n }
const event = (index = 0, status = 'Settled', forfeitedTotal = 0n) => ({ account: { eventIndex: index, status, forfeitedTotal, voidReason: 'None', window } })
const bundle = (account = {}, current: unknown = null, claims: unknown[] = [], history: unknown[] = []): SoloRitualBundle => ({
  slot: 1,
  ritual: { address: me, account: { kind: 'Solo', status: 'Active', schedule: [window, { opens: 400n, deadline: 500n, resolution: 550n }], members: [me], forfeitDestination: me, perEventAllocation: 5000000n, stakeDecimals: 6, witness: null, currentEventIndex: 0, skipDeclared: false, ...account } },
  event: current, claims, history,
}) as unknown as SoloRitualBundle
const map = (read: SoloRitualBundle, now = 150, outcomes?: ReadonlyMap<number, 'done' | 'missed'>) => widgetOutcomeFromBundle({ address: 'ritual', bundle: read }, now, outcomes)

describe('foreground bundle adapter', () => {
  it('takes exact chain windows and the Home stake formatter', () => {
    expect(map(bundle(), 50)).toMatchObject({ state: 'waiting', opens: 100, deadline: 200, cells: ['now', 'future'], stakeLabel: '5 TEST / WK' })
    expect(map(bundle({ perEventAllocation: 2500000n }))?.stakeLabel).toBe('2.5 TEST / WK')
    expect(map(bundle(), 100)?.state).toBe('open-not-initialized')
    expect(map(bundle(), 201)?.state).toBe('closing')
    expect(map(bundle(), 251)?.state).toBe('resolving/settle')
  })
  it('matches Home: a current confirmed stamp changes the pill, not the closed-week count/dot', () => {
    const read = bundle({}, event(0, 'Claiming'), [{ member: me, account: { status: 'Confirmed' } }])
    for (const outcomes of [undefined, new Map([[0, 'done' as const]])]) {
      const result = map(read, 150, outcomes)!
      expect(result).toMatchObject({ state: 'claimable', showedUp: true, cells: ['now', 'future'] })
      expect(widgetModel([{ address: 'ritual', title: 'Read' }], [result], 150)).toMatchObject({ countLine: '0 of 2 kept', pill: { text: 'Stamped', act: false } })
    }
  })
  it('does not count a pending witness claim as kept', () => {
    expect(map(bundle({ witness: me }, event(0, 'Claiming'), [{ member: me, account: { status: 'Pending' } }]))).toMatchObject({ state: 'awaiting-witness', showedUp: false, cells: ['now', 'future'] })
  })
  it('uses exact Home outcomes, without inventing a last-result pill from dots', () => {
    const read = bundle({ currentEventIndex: 1 })
    const outcomes = new Map([[0, 'missed' as const]])
    expect(map(read, 300, outcomes)).toMatchObject({ state: 'waiting', cells: soloHomeCells(read.ritual.account, outcomes) })
    expect(map(read, 400, outcomes)?.state).toBe('open-not-initialized')
  })
  it('keeps unread history neutral like Home, rather than refusing the newest ritual', () => {
    expect(map(bundle({ currentEventIndex: 1 }), 300)).toMatchObject({ cells: ['closed', 'now'] })
    expect(map(bundle({ currentEventIndex: 1 }, null, [], [bundle({}, event(0, 'Settled', 1n))]), 300)).toMatchObject({ state: 'missed', cells: ['missed', 'now'] })
  })
  it('uses Home-supplied outcomes as-is even if detail history is present', () => {
    expect(map(bundle({ currentEventIndex: 1 }, null, [], [bundle({}, event())]), 300, new Map())?.cells).toEqual(['closed', 'now'])
  })
  it('stores every finished week in order, not just kept/missed totals', () => {
    const read = bundle({ status: 'Completed', currentEventIndex: 2 }, event(1, 'Settled', 1n))
    expect(map(read, 600, new Map([[0, 'done'], [1, 'missed']]))).toMatchObject({ active: false, state: 'completed', cells: ['done', 'missed'] })
  })
  it('matches Home: a voided/refunded closed week is done, not a miss', () => {
    const skipped = { account: { ...event().account, status: 'Voided', voidReason: 'DeclaredSkip' } }
    expect(map(bundle({ currentEventIndex: 1, skipDeclared: true, skipEventIndex: 0 }, null, [], [bundle({}, skipped)]), 300)).toMatchObject({ state: 'skipped', cells: ['done', 'now'] })
  })
  it.each([
    ['waiting', bundle(), 50],
    ['open', bundle(), 150],
    ['closing', bundle(), 201],
    ['resolving', bundle(), 251],
    ['stamped', bundle({}, event(0, 'Claiming'), [{ member: me, account: { status: 'Confirmed' } }]), 150],
    ['missed', bundle({}, event(0, 'Settled', 1n)), 150],
    ['settled-current', bundle({}, event()), 150],
    ['skipped-current', bundle({}, { account: { ...event().account, status: 'Voided', voidReason: 'DeclaredSkip' } }), 150],
    ['finished-missed', bundle({ status: 'Completed', currentEventIndex: 2 }, event(1, 'Settled', 1n)), 600],
    ['finished-skip', bundle({ status: 'Completed', currentEventIndex: 2 }, event(1, 'Voided')), 600],
  ] as const)('pill equals tileStatus(soloRitualModel) for %s, unchanged', (_name, read, now) => {
    const result = map(read, now, new Map())!
    const home = soloRitualModel(read, now, me)
    expect(widgetModel([{ address: 'ritual', title: 'Read' }], [result], now).pill).toEqual(tileStatus(home))
    expect(result.cells).toEqual(soloHomeCells(read.ritual.account, undefined))
  })
  it('terminal current events stay active candidates but cannot reopen headlessly', () => {
    const result = map(bundle({}, event(0, 'Settled', 1n)))!
    expect(result).toMatchObject({ active: true, terminalCurrent: true, state: 'missed', cells: ['now', 'future'] })
    expect(widgetModel([{ address: 'ritual', title: 'Read' }], [result], 999999).pill).toEqual({ text: 'Missed last week', act: false })
  })
  it.each([{ kind: 'Group' }, { status: 'Funding' }, { status: 'Cancelled' }, { schedule: [] }])('ignores unsupported/nonactive account %o', (overrides) => expect(map(bundle(overrides))).toBeNull())
})
