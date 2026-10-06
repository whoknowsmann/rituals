import { describe, expect, it } from 'vitest'
import type { TokenAtomicUnits } from '../../../domain/rituals/types'
import { buildClaimCompletionViewModel, buildConfirmationInboxViewModel, buildRitualDetailViewModel, buildSettlementReceiptViewModel } from './viewModels'
import { parseRitualRouteParams, ritualDetailTarget, confirmationInboxTarget, settlementReceiptTarget } from './routeHelpers'

describe('fixture-backed claims journey', () => {
  it('keeps claimant signature separate from friend confirmations', () => {
    const view = buildClaimCompletionViewModel({ claimant: 'You', friendConfirmations: 1, threshold: 2 })
    expect(view.walletSignature).toContain('not connected')
    expect(view.friendConfirmations).toContain('1 of 2')
    expect(view.ctaLabel).toMatch(/Preview/)
  })

  it.each([
    ['HONOR', 'Honor system'], ['ONE_FRIEND', 'One friend confirms'], ['MAJORITY', 'Majority confirms'], ['UNANIMOUS', 'Everyone confirms'],
  ] as const)('labels %s', (mode, label) => {
    expect(buildRitualDetailViewModel({ ...detail, confirmationMode: mode }).confirmationLabel).toBe(label)
  })

  it('rejects claimant self-confirmation and disables duplicate or in-flight actions', () => {
    const view = buildConfirmationInboxViewModel({ ...inbox, viewer: 'alice', claimant: 'alice', action: 'idle' })
    expect(view.canConfirm).toBe(false)
    expect(view.confirmDisabledReason).toMatch(/claimant/i)
    expect(buildConfirmationInboxViewModel({ ...inbox, action: 'in-flight' }).canConfirm).toBe(false)
    expect(buildConfirmationInboxViewModel({ ...inbox, action: 'confirmed' }).canConfirm).toBe(false)
  })

  it('uses neutral copy for pending and questioned claims', () => {
    expect(buildConfirmationInboxViewModel({ ...inbox, claimStatus: 'PENDING' }).statusCopy).toMatch(/pending|review|waiting/i)
    expect(buildConfirmationInboxViewModel({ ...inbox, claimStatus: 'QUESTIONED' }).statusCopy).toMatch(/question|review/i)
    expect(buildConfirmationInboxViewModel({ ...inbox, claimStatus: 'QUESTIONED' }).statusCopy).not.toMatch(/dishonest|forfeit|failure/i)
  })

  it('shows exact receipt line items and zero platform share', () => {
    const view = buildSettlementReceiptViewModel(receipt)
    expect(view.status).toBe('settled')
    expect(view.lines).toEqual(expect.arrayContaining([
      ['Principal returned', '1.250000 tSKR'], ['Bonus', '0.250000 tSKR'], ['Total received', '1.500000 tSKR'], ['Forfeiture', '0.000000 tSKR'],
      ['Future stake', '1.250000 tSKR'], ['Activation fee', '0.050000 tSKR · paid separately'], ['Network fee', 'Unknown'], ['Platform share', '0 tSKR'],
    ]))
    const voided = buildSettlementReceiptViewModel({ ...receipt, status: 'VOIDED', bonus: 0n, forfeiture: 0n, settlement: { kind: 'VOIDED', reason: 'UNRESOLVED_CLAIMS' } })
    expect(voided.lines.find(([label]) => label === 'Bonus')?.[1]).toBe('0 tSKR')
    expect(voided.lines.find(([label]) => label === 'Forfeiture')?.[1]).toBe('0 tSKR')
  })

  it('parses malformed routes safely and produces serializable targets', () => {
    expect(parseRitualRouteParams({ ritualId: 1, eventIndex: 'x' })).toBeNull()
    expect(ritualDetailTarget('ritual-weekly-run')).toEqual({ name: 'RitualDetail', params: { ritualId: 'ritual-weekly-run' } })
    expect(confirmationInboxTarget('ritual-weekly-run', 0)).toEqual({ name: 'ConfirmationInbox', params: { ritualId: 'ritual-weekly-run', eventIndex: 0 } })
    expect(settlementReceiptTarget('ritual-weekly-run', 0)).toEqual({ name: 'SettlementReceipt', params: { ritualId: 'ritual-weekly-run', eventIndex: 0 } })
  })
})

const detail = { ritualId: 'ritual-weekly-run', title: 'Saturday morning miles', status: 'ACTIVE' as const, requirement: 'Run 5 km.', nextClaimWindow: 'Saturday · 9:00 AM', stakeAtomicUnits: 1250000000n, tokenDecimals: 6, tokenSymbol: 'tSKR', confirmationMode: 'ONE_FRIEND' as const }
const inbox = { claimant: 'bob', ritualTitle: 'Saturday morning miles', eventLabel: 'Event 1', requirement: 'Run 5 km.', threshold: 2, confirmations: 1, claimStatus: 'PENDING' as const, viewer: 'friend', action: 'idle' as const }
const receipt = { status: 'SETTLED' as const, eventAllocation: 1250000n as TokenAtomicUnits, memberOutcome: 'CONFIRMED' as const, principal: 1250000n, bonus: 250000n, forfeiture: 0n, futureStake: 1250000n, activationFee: 50000n, tokenDecimals: 6, tokenSymbol: 'tSKR', settlement: { kind: 'SETTLED' as const } }
