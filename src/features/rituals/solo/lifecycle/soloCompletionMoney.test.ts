import { describe, expect, it } from 'vitest'
import { soloAccount, soloEvent, ejectRitualAddress } from '../../../../data/rituals/ejectTestHelpers'
import type { SoloRitualBundle } from './soloRitualModel'
import { soloReceiptMoneyLine } from './soloReceiptModel'
import { completedMoneyLine, tileMoneyLine } from '../../home/tileMoney'
import { settledSoloOutcomes, type SoloWeekOutcome } from '../../home/soloHistory'

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
