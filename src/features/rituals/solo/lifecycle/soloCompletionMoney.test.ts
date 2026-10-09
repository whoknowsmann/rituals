import { describe, expect, it } from 'vitest'
import { soloAccount, soloEvent, ejectRitualAddress } from '../../../../data/rituals/ejectTestHelpers'
import type { SoloRitualBundle } from './soloRitualModel'
import { soloReceiptMoneyLine } from './soloReceiptModel'
import { completedMoneyLine, tileMoneyLine } from '../../home/tileMoney'
import { settledSoloOutcomes, type SoloWeekOutcome } from '../../home/soloHistory'
import { STAKE_PRESETS } from '../create/schedule'
import { splitTotalStake } from '../create/stakeSplit'

const destination = 'the wallet you chose'
function finished(outcomes: SoloWeekOutcome[]): SoloRitualBundle {
  const account = soloAccount({ status: 'Completed', currentEventIndex: 3, settledEventCount: 3,
    perEventAllocation: 11_100_000n, memberTotalStake: 33_300_000n })
  const reads = outcomes.map((outcome, index) => ({ ritual: { address: ejectRitualAddress, account },
    event: { account: soloEvent(index, { status: outcome === 'skipped' ? 'Voided' : 'Settled',
      voidReason: outcome === 'skipped' ? 'DeclaredSkip' : 'None', forfeitedTotal: outcome === 'missed' ? account.perEventAllocation : 0n }) }, claims: [] }))
  return { ...reads[2], history: reads.slice(0, 2) } as unknown as SoloRitualBundle
}

describe('completed ritual and last receipt share Home money math', () => {
  it.each([
    ['missed-last', ['done', 'done', 'missed'], '22.2 of 33.3 tSKR back · 11.1 tSKR to the wallet you chose'],
    ['kept-last', ['missed', 'missed', 'done'], '11.1 of 33.3 tSKR back · 22.2 tSKR to the wallet you chose'],
    ['all-kept', ['done', 'done', 'done'], '33.3 of 33.3 tSKR back'],
    ['skipped-last', ['done', 'missed', 'skipped'], '22.2 of 33.3 tSKR back · 11.1 tSKR to the wallet you chose'],
    ['all-missed', ['missed', 'missed', 'missed'], '0 of 33.3 tSKR back · 33.3 tSKR to the wallet you chose'],
  ] as const)('%s: identical totals on the ritual and receipt, no weekly substitute', (_name, outcomes, expected) => {
    const read = finished([...outcomes])
    const settled = settledSoloOutcomes(read)
    expect(completedMoneyLine(read.ritual.account, settled, destination)).toBe(expected)
    expect(soloReceiptMoneyLine(read)).toBe(expected)
    expect(expected.startsWith(tileMoneyLine(read.ritual.account, settled))).toBe(true)
    expect(soloReceiptMoneyLine(read)).not.toContain('went to')
  })
  it('counts a declared skip as returned, without adding a sent clause when nothing was sent', () => {
    const read = finished(['done', 'skipped', 'done'])
    expect(soloReceiptMoneyLine(read)).toBe('33.3 of 33.3 tSKR back')
  })
  it('does not assert totals before completion, during incomplete reads or from unclosed claims', () => {
    const read = finished(['done', 'done', 'missed'])
    expect(completedMoneyLine({ ...read.ritual.account, status: 'Active' }, settledSoloOutcomes(read), destination)).toBeNull()
    expect(soloReceiptMoneyLine({ ...read, history: [] })).toBeNull()
    const pending = { ...read, event: { ...read.event!, account: { ...read.event!.account, status: 'Resolving' as const } } }
    expect(settledSoloOutcomes(pending).has(2)).toBe(false)
    expect(soloReceiptMoneyLine(pending)).toBeNull()
    expect(completedMoneyLine(pending.ritual.account, settledSoloOutcomes(pending), destination)).toBeNull()
  })
  it('retains the exact weekly receipt line for non-final missed and kept weeks', () => {
    const read = finished(['missed', 'done', 'missed'])
    const earlier = read.history![0]
    expect(soloReceiptMoneyLine(earlier)).toBe('11.1 tSKR went to the wallet you chose.')
    expect(soloReceiptMoneyLine(read.history![1])).toBe('11.1 tSKR back to you')
  })
  it('formats the chosen destination with the same label rather than a token account', () => {
    const read = finished(['done', 'done', 'missed'])
    const line = soloReceiptMoneyLine(read, read.ritual.account.creator)
    expect(line).toContain('tSKR to the wallet you chose · ')
    expect(line).not.toContain(read.ritual.account.forfeitDestination.toBase58())
  })
})

describe('finished line at full-precision stakes, rounded only on screen (Jack, 2026-10-09)', () => {
  const windows = (count: number) => Array.from({ length: count }, (_, index) => Object.freeze({ opens: 1000n + 60n * BigInt(index), deadline: 1045n + 60n * BigInt(index), resolution: 1055n + 60n * BigInt(index) }))
  const completed = (perWeek: bigint, count: number) => soloAccount({ status: 'Completed', schedule: windows(count), currentEventIndex: count, settledEventCount: count,
    perEventAllocation: perWeek, memberTotalStake: perWeek * BigInt(count), fundedStakeTotal: perWeek * BigInt(count) })
  const keptFirst = (kept: number, count: number) => new Map(Array.from({ length: count }, (_, index): [number, SoloWeekOutcome] => [index, index < kept ? 'done' : 'missed']))
  const cause = 'Northside Food Bank (demo)'

  it("reads Jack's 20 over 6 weeks, one kept, as 3.33 of 20 back and 16.67 sent: ritual, last receipt and Home", () => {
    const account = completed(3_333_333n, 6)
    expect(completedMoneyLine(account, keptFirst(1, 6), cause)).toBe('3.33 of 20 tSKR back · 16.67 tSKR to Northside Food Bank (demo)')
    expect(tileMoneyLine(account, keptFirst(1, 6))).toBe('3.33 of 20 tSKR back')
    expect(tileMoneyLine(account, undefined)).toBe('20 tSKR')
    const read = (index: number) => ({ ritual: { address: ejectRitualAddress, account }, claims: [],
      event: { account: { eventIndex: index, status: 'Settled', voidReason: 'None', forfeitedTotal: index === 0 ? 0n : account.perEventAllocation } } })
    const last = { ...read(5), history: [0, 1, 2, 3, 4].map(read) } as unknown as SoloRitualBundle
    expect(soloReceiptMoneyLine(last)).toBe('3.33 of 20 tSKR back · 16.67 tSKR to the wallet you chose')
    expect(soloReceiptMoneyLine(read(0) as unknown as SoloRitualBundle)).toBe('3.33 tSKR back to you')
    expect(soloReceiptMoneyLine(read(1) as unknown as SoloRitualBundle)).toBe('3.33 tSKR went to the wallet you chose.')
  })

  it('rituals made with the old 2-decimal split still read in their exact cents', () => {
    expect(completedMoneyLine(completed(6_660_000n, 3), keptFirst(1, 3), cause)).toBe('6.66 of 19.98 tSKR back · 13.32 tSKR to Northside Food Bank (demo)')
    expect(completedMoneyLine(completed(3_330_000n, 6), keptFirst(1, 6), cause)).toBe('3.33 of 19.98 tSKR back · 16.65 tSKR to Northside Food Bank (demo)')
    expect(tileMoneyLine(completed(3_330_000n, 6), undefined)).toBe('19.98 tSKR')
  })

  it('every pick over 1–16 weeks: the total shows as chosen and kept + sent never fall short of it; they pass it by 1 cent only when both end in exactly half a cent', () => {
    const cents = (text: string) => { const [whole, fraction = ''] = text.split('.'); return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2)) }
    const over: string[] = []
    for (const total of STAKE_PRESETS) {
      for (let weeks = 1; weeks <= 16; weeks += 1) {
        const split = splitTotalStake(total, weeks)
        if (!split.ok) throw new Error(`${total} over ${weeks} weeks did not split`)
        const perWeek = split.split.perWeekAtomic
        for (let kept = 0; kept <= weeks; kept += 1) {
          const line = completedMoneyLine(completed(perWeek, weeks), keptFirst(kept, weeks), cause) ?? ''
          const match = /^(\d+(?:\.\d+)?) of (\d+(?:\.\d+)?) tSKR back(?: · (\d+(?:\.\d+)?) tSKR to Northside Food Bank \(demo\))?$/.exec(line)
          if (!match) throw new Error(`unexpected line: ${line}`)
          const [back, shown, sent] = [cents(match[1]), cents(match[2]), cents(match[3] ?? '0')]
          expect(shown).toBe(BigInt(total) * 100n)
          expect(back + sent >= shown).toBe(true)
          if (back + sent === shown) continue
          expect(back + sent - shown).toBe(1n)
          expect([(perWeek * BigInt(kept)) % 10_000n, (perWeek * BigInt(weeks - kept)) % 10_000n]).toEqual([5_000n, 5_000n])
          over.push(`${total}/${weeks}`)
        }
      }
    }
    // The documented 1-cent case: 24 of 608 lines, e.g. 5 over 8 weeks with one kept.
    expect(over).toHaveLength(24)
    expect([...new Set(over)]).toEqual(['5/8', '5/16', '10/16', '50/16'])
    expect(completedMoneyLine(completed(625_000n, 8), keptFirst(1, 8), cause)).toBe('0.63 of 5 tSKR back · 4.38 tSKR to Northside Food Bank (demo)')
  })
})
