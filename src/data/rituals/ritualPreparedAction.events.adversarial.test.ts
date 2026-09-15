import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { ACCOUNT_DATA_LENGTHS } from './accounts'
import { RitualActionPreparer, RitualPreparationError } from './ritualPreparedAction'
import { eventContext, claimContext, ritualContext, EventTransport, eventProgramId, eventKey, sourceCreator, sourceMembers, sourceSchedule } from './ritualPreparedAction.events.test.helpers'

class DeferredEventTransport extends EventTransport {
  latestResolve!: (value: unknown) => void
  readonly latestPromise = new Promise<unknown>(resolve => { this.latestResolve = resolve })
  override getLatestBlockhashAndContext(): Promise<{ context: { slot: number }; value: { blockhash: string; lastValidBlockHeight: number } }> { this.calls.push('latest'); return this.latestPromise as Promise<{ context: { slot: number }; value: { blockhash: string; lastValidBlockHeight: number } }> }
}

const prep = (transport = new EventTransport()) => ({ transport, preparer: new RitualActionPreparer(transport, eventProgramId) })
const baseRitual = (overrides: Record<string, unknown> = {}) => ritualContext(overrides as any)
const initArgs = (r = baseRitual()) => ({ programId: eventProgramId, ritual: r, eventIndex: 0, payer: sourceCreator })
const claimArgs = (r = baseRitual()) => { const event = eventContext(r); return { programId: eventProgramId, ritual: r, event, claimant: r.account.members[0] } }
const approveArgs = (r = baseRitual(), extra: Record<string, unknown> = {}) => { const event = eventContext(r, { status: 'Claiming', claimedMembersBitmap: 1 }); const claim = claimContext(r, event, 0, { requiredAdditionalConfirmations: r.account.additionalConfirmationThreshold, ...extra }); return { programId: eventProgramId, ritual: r, event, claim, approver: r.account.members[1] } }
const finalizeArgs = (r = baseRitual(), eventOverrides: Record<string, unknown> = {}) => ({ programId: eventProgramId, ritual: r, event: eventContext(r, { status: 'Claiming', ...eventOverrides }), destinationTokenAccounts: r.account.members.map((_, i) => eventKey(110 + i)), feePayer: eventKey(200) })
const expectInput = async (call: () => Promise<unknown>, transport: EventTransport) => { const result = call(); await expect(result).rejects.toBeInstanceOf(RitualPreparationError); await expect(result).rejects.toMatchObject({ category: 'input' }); expect(transport.calls).toEqual([]) }

async function resolveDeferred(transport: DeferredEventTransport) {
  transport.latestResolve({ context: { slot: 12 }, value: { blockhash: eventKey(90).toBase58(), lastValidBlockHeight: 100 } })
}

describe('Ritual event prepared actions: bounded adversarial contract', () => {
  it('snapshots initialize inputs before latest-blockhash transport', async () => {
    const transport = new DeferredEventTransport(); const { preparer } = prep(transport); const args = initArgs(); const pending = preparer.prepareInitializeEvent(args); (args as any).eventIndex = 1; (args as any).payer = eventKey(201); (args.ritual.account as any).status = 'Completed'; await resolveDeferred(transport); const action = await pending
    expect(action.expectation).toEqual({ kind: 'event-initialized', eventIndex: 0 }); expect(action.feePayer).toBe(sourceCreator.toBase58()); expect(transport.rentLengths).toEqual([ACCOUNT_DATA_LENGTHS.RitualEvent])
  })
  it('snapshots claim ritual, event, and claimant before transport', async () => {
    const transport = new DeferredEventTransport(); const { preparer } = prep(transport); const args = claimArgs(); const pending = preparer.prepareClaim(args); (args as any).claimant = sourceMembers[1]; (args.event.account as any).eventIndex = 1; (args.ritual.account as any).additionalConfirmationThreshold = 0; await resolveDeferred(transport); const action = await pending
    expect(action.expectation).toMatchObject({ claimant: sourceMembers[0].toBase58(), eventIndex: 0, expectedClaimStatus: 'Pending' })
  })
  it('snapshots approve ritual, event, claim, and actor before transport', async () => {
    const transport = new DeferredEventTransport(); const { preparer } = prep(transport); const args = approveArgs(); const pending = preparer.prepareApprove(args); (args as any).approver = sourceMembers[2]; (args.claim.account as any).approvalCount = 1; (args.event.account as any).status = 'Resolving'; await resolveDeferred(transport); const action = await pending
    expect(action.expectation).toMatchObject({ approver: sourceMembers[1].toBase58(), expectedApprovalCount: 1, expectedClaimStatus: 'Pending' })
  })
  it('snapshots finalize destinations and payer before transport', async () => {
    const transport = new DeferredEventTransport(); const { preparer } = prep(transport); const args = finalizeArgs(); const original = args.destinationTokenAccounts.slice(); const pending = preparer.prepareFinalize(args); (args.destinationTokenAccounts as any).reverse(); (args as any).feePayer = eventKey(201); (args.event.account as any).confirmedMembersBitmap = 0; await resolveDeferred(transport); const action = await pending; const wallet = preparer.getTransactionForWallet(action)
    expect(action.feePayer).toBe(eventKey(200).toBase58()); expect(wallet.transaction.instructions[0].keys.slice(5).map(k => k.pubkey.toBase58())).toEqual(original.map(k => k.toBase58()))
  })

  it.each([
    ['initialize', (p: RitualActionPreparer, t: EventTransport) => p.prepareInitializeEvent(null as never), 'initialize'],
    ['claim', (p: RitualActionPreparer, t: EventTransport) => p.prepareClaim(null as never), 'claim'],
    ['approve', (p: RitualActionPreparer, t: EventTransport) => p.prepareApprove(null as never), 'approve'],
    ['question', (p: RitualActionPreparer, t: EventTransport) => p.prepareQuestion(null as never), 'question'],
    ['finalize', (p: RitualActionPreparer, t: EventTransport) => p.prepareFinalize(null as never), 'finalize'],
  ] as any)('rejects null %s arguments without transport', async (...args: any[]) => { const [, call] = args; const { preparer, transport } = prep(); await expectInput(() => call(preparer, transport), transport) })

  it('normalizes a revoked event wrapper and hostile event getter', async () => {
    const { preparer, transport } = prep(); const args = claimArgs(); args.event = new Proxy(args.event, { get() { throw new Error('revoked') } }); await expectInput(() => preparer.prepareClaim(args), transport)
  })
  it('normalizes a revoked claim wrapper without leaking the sentinel', async () => {
    const { preparer, transport } = prep(); const args = approveArgs(); args.claim = new Proxy(args.claim, { get() { throw new Error('revoked') } }); await expectInput(() => preparer.prepareApprove(args), transport)
  })
  it.each([
    ['wrong event ritual binding', () => { const r = baseRitual(); return finalizeArgs(r, { ritual: eventKey(999) }) }],
    ['wrong event PDA', () => { const r = baseRitual(); const e = eventContext(r); return { ...finalizeArgs(r), event: { ...e, address: eventKey(999) } } }],
    ['wrong event window', () => finalizeArgs(baseRitual(), { window: sourceSchedule[1] })],
    ['wrong event index', () => finalizeArgs(baseRitual(), { eventIndex: 1 })],
    ['wrong destination count', () => ({ ...finalizeArgs(), destinationTokenAccounts: [eventKey(110)] })],
    ['duplicate destinations', () => ({ ...finalizeArgs(), destinationTokenAccounts: [eventKey(110), eventKey(110), eventKey(112)] })],
  ])('rejects canonical finalize failure: %s before transport', async (_name, makeArgs) => { const { preparer, transport } = prep(); await expectInput(() => preparer.prepareFinalize(makeArgs() as never), transport) })

  it('rejects an unfunded claim actor before transport', async () => { const r = baseRitual(); r.account.fundedMembersBitmap = 1; const { preparer, transport } = prep(); const args = { ...claimArgs(r), claimant: r.account.members[1] }; await expectInput(() => preparer.prepareClaim(args), transport) })
  it('rejects duplicate approval and claimant question before transport', async () => { const { preparer, transport } = prep(); await expectInput(() => preparer.prepareApprove(approveArgs(baseRitual(), { approvalsBitmap: 2, approvalCount: 1 })), transport); await expectInput(() => preparer.prepareQuestion({ ...approveArgs(), questioner: sourceMembers[0] }), transport) })
  it('rejects a default finalize payer before transport', async () => { const { preparer, transport } = prep(); await expectInput(() => preparer.prepareFinalize({ ...finalizeArgs(), feePayer: PublicKey.default }), transport) })
  it('rejects settled-count overflow before transport', async () => { const r = baseRitual(); r.account.settledEventCount = 255; const { preparer, transport } = prep(); await expectInput(() => preparer.prepareFinalize(finalizeArgs(r)), transport) })

  it('derives threshold zero claim as Confirmed and positive threshold as Pending', async () => { const zero = baseRitual(); zero.account.additionalConfirmationThreshold = 0; const { preparer: p0 } = prep(); expect((await p0.prepareClaim(claimArgs(zero))).expectation).toMatchObject({ expectedClaimStatus: 'Confirmed' }); const { preparer: p2 } = prep(); expect((await p2.prepareClaim(claimArgs())).expectation).toMatchObject({ expectedClaimStatus: 'Pending' }) })
  it('derives approval Pending below and Confirmed exactly at threshold', async () => { const r = baseRitual(); r.account.additionalConfirmationThreshold = 2; const { preparer } = prep(); expect((await preparer.prepareApprove(approveArgs(r, { approvalCount: 0 }))).expectation).toMatchObject({ expectedApprovalCount: 1, expectedClaimStatus: 'Pending' }); const { preparer: p2 } = prep(); expect((await p2.prepareApprove(approveArgs(r, { approvalCount: 1 }))).expectation).toMatchObject({ expectedApprovalCount: 2, expectedClaimStatus: 'Confirmed' }) })
  it.each([
    [{ claimedMembersBitmap: 1, confirmedMembersBitmap: 1 }, 'Settled', 'None'],
    [{ claimedMembersBitmap: 1 }, 'Voided', 'UnresolvedClaims'],
    [{}, 'Voided', 'NoConfirmedMembers'],
  ] as const)('derives finalize status %s', async (bits, status, reason) => { const { preparer } = prep(); expect((await preparer.prepareFinalize(finalizeArgs(baseRitual(), bits))).expectation).toMatchObject({ expectedEventStatus: status, expectedVoidReason: reason, expectedSettledEventCount: 1 }) })
  it('uses Completed progression and exact settled count on the final event', async () => { const r: any = baseRitual(); r.account.currentEventIndex = 1; r.account.settledEventCount = 1; r.account.schedule = [...sourceSchedule, { opens: 700n, deadline: 800n, resolution: 900n }]; const { preparer } = prep(); const action = await preparer.prepareFinalize(finalizeArgs(r, { eventIndex: 1, window: r.account.schedule[1] })); expect(action.expectation).toMatchObject({ expectedRitualStatus: 'Active', expectedCurrentEventIndex: 2, expectedSettledEventCount: 2 }) })
  it('checks settlement multiplication in u64 and reports zero wallet/protocol outflow', async () => { const r: any = baseRitual({ perEventAllocation: 100n }); const { preparer } = prep(); const action = await preparer.prepareFinalize(finalizeArgs(r, { claimedMembersBitmap: 1, confirmedMembersBitmap: 1 })); expect(action.summary).toMatchObject({ escrowSettlementTransfer: 300n, tokenOutflow: 0n, stakeOutflow: 0n, protocolForfeitureShare: 0n }) })
  it('rejects settlement multiplication overflow before any transport', async () => { const r = baseRitual({ perEventAllocation: 0xffffffffffffffffn, members: [sourceCreator, eventKey(51)] }); const { preparer, transport } = prep(); await expectInput(() => preparer.prepareFinalize(finalizeArgs(r)), transport) })
  it('charges rent only for initialize and claim', async () => { for (const [call, expected] of [[(p: RitualActionPreparer) => p.prepareInitializeEvent(initArgs()), ACCOUNT_DATA_LENGTHS.RitualEvent], [(p: RitualActionPreparer) => p.prepareClaim(claimArgs()), ACCOUNT_DATA_LENGTHS.CompletionClaim]] as const) { const { preparer, transport } = prep(); await call(preparer); expect(transport.rentLengths).toEqual([expected]) }; for (const call of [(p: RitualActionPreparer) => p.prepareApprove(approveArgs()), (p: RitualActionPreparer) => p.prepareQuestion({ ...approveArgs(), questioner: sourceMembers[1] }), (p: RitualActionPreparer) => p.prepareFinalize(finalizeArgs())]) { const { preparer, transport } = prep(); await call(preparer); expect(transport.rentLengths).toEqual([]) } })
  it('does not expose wallet operations or transportable objects on public action', async () => { const { preparer } = prep(); const action = await preparer.prepareFinalize(finalizeArgs()); expect(action).not.toHaveProperty('transaction'); expect(action).not.toHaveProperty('sign'); expect(action).not.toHaveProperty('send'); expect(action).not.toHaveProperty('confirm'); expect(action).not.toHaveProperty('message'); expect(action).not.toHaveProperty('instruction') })
})
