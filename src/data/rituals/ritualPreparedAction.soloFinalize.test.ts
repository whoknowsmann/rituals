import { describe, expect, it } from 'vitest'
import { RitualActionPreparer } from './ritualPreparedAction'
import { eventContext, ritualContext, EventTransport, eventProgramId, eventKey } from './ritualPreparedAction.events.test.helpers'

/**
 * Finalize expectations must mirror derive_solo_event_settlement_plan. A solo
 * week nobody checked in to SETTLES (stake to the locked destination); it is
 * not voided like a group week with no confirmed members. On devnet
 * 2026-10-02 the group-only expectation made a landed missed-week settle read
 * back as a mismatch.
 */
const solo = (overrides: Record<string, unknown> = {}) => {
  const base = ritualContext()
  return ritualContext({ kind: 'Solo', members: [base.account.members[0]], fundedMembersBitmap: 1, fundedMemberCount: 1, forfeitDestination: eventKey(77), witness: null, season: null, skipDeclared: false, skipEventIndex: 0, ...overrides } as never)
}

async function expectation(ritual: ReturnType<typeof ritualContext>, eventOverrides: Record<string, unknown>) {
  const preparer = new RitualActionPreparer(new EventTransport(), eventProgramId)
  const action = await preparer.prepareFinalize({ programId: eventProgramId, ritual, event: eventContext(ritual, { status: 'Claiming', ...eventOverrides } as never), destinationTokenAccounts: [eventKey(60)], feePayer: eventKey(61) })
  return preparer.getTransactionForWallet(action).expectation
}

describe('prepareFinalize expectation for solo rituals', () => {
  it('a missed solo week settles (forfeit), it is not voided', async () => {
    expect(await expectation(solo(), {})).toMatchObject({ kind: 'finalized', expectedEventStatus: 'Settled', expectedVoidReason: 'None' })
  })

  it('a kept solo week settles', async () => {
    expect(await expectation(solo(), { claimedMembersBitmap: 1, confirmedMembersBitmap: 1 })).toMatchObject({ expectedEventStatus: 'Settled', expectedVoidReason: 'None' })
  })

  it('a declared skip voids as DeclaredSkip', async () => {
    expect(await expectation(solo({ skipDeclared: true, skipEventIndex: 0 }), {})).toMatchObject({ expectedEventStatus: 'Voided', expectedVoidReason: 'DeclaredSkip' })
  })

  it('a pending witness claim voids as UnresolvedClaims', async () => {
    expect(await expectation(solo(), { claimedMembersBitmap: 1 })).toMatchObject({ expectedEventStatus: 'Voided', expectedVoidReason: 'UnresolvedClaims' })
  })
})
