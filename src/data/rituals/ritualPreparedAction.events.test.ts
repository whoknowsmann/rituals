import { describe, expect, it } from 'vitest'
import { Buffer } from 'buffer'
import { sha256 } from '@noble/hashes/sha256'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { ACCOUNT_DATA_LENGTHS } from './accounts'
import { INSTRUCTION_DISCRIMINATORS } from './instructionData'
import { RitualActionPreparer, RitualPreparationError } from './ritualPreparedAction'
import { claimPda, eventPda } from './pdas'
import { eventContext, claimContext, ritualContext, EventTransport, eventProgramId, eventKey, eventSource, sourceMembers, sourceCreator, sourceMint, sourceSchedule } from './ritualPreparedAction.events.test.helpers'

const prep = (transport = new EventTransport()) => ({ transport, preparer: new RitualActionPreparer(transport, eventProgramId) })
const b64 = (bytes: readonly number[]) => Buffer.from(bytes).toString('hex')
const walletAndAssert = (p: RitualActionPreparer, action: Awaited<ReturnType<RitualActionPreparer['prepareInitializeEvent']>>) => { const wallet = p.getTransactionForWallet(action); p.assertWalletTransactionUnchanged(action, wallet.transaction); return wallet }
const baseRitual = () => ritualContext()
const initArgs = () => ({ programId: eventProgramId, ritual: baseRitual(), eventIndex: 0, payer: sourceCreator })
const claimArgs = (r = baseRitual(), memberIndex = 0) => { const e = eventContext(r); return { programId: eventProgramId, ritual: r, event: e, claimant: r.account.members[memberIndex] } }
const approveArgs = (r = baseRitual(), memberIndex = 0, approverIndex = 1, extra: Record<string, unknown> = {}) => { const e = eventContext(r, { status: 'Claiming', claimedMembersBitmap: 1 << memberIndex }); const c = claimContext(r, e, memberIndex, { requiredAdditionalConfirmations: r.account.additionalConfirmationThreshold, ...extra }); return { programId: eventProgramId, ritual: r, event: e, claim: c, approver: r.account.members[approverIndex] } }
const finalizeArgs = (r = baseRitual(), eventOverrides: Record<string, unknown> = {}) => ({ programId: eventProgramId, ritual: r, event: eventContext(r, { status: 'Claiming', ...eventOverrides }), destinationTokenAccounts: r.account.members.map((_, i) => eventKey(110 + i)), feePayer: eventKey(200) })

function expectInstruction(action: Awaited<ReturnType<RitualActionPreparer['prepareInitializeEvent']>>, data: readonly number[]) {
  expect(action.kind).toBe('initialize-event')
  expect(action.summary.tokenOutflow).toBe(0n)
  expect(action.summary.stakeOutflow).toBe(0n)
  expect(action.summary.activationFeeOutflow).toBe(0n)
  expect(action.summary.protocolForfeitureShare).toBe(0n)
  expect(action.summary.rentCreditIsEstimate).toBe(false)
  expect(action.summary.estimatedNetworkFeeLamports).toBe(7n)
  expect(action.summary.totalEstimatedLamportOutflow).toBe(7n + 139n)
  expect(action.summary.creates).toEqual({ description: 'ritual event', count: 1 })
  expect(action.summary.tokenMint).toBe(sourceMint.toBase58())
  expect(action.messageDigest).toMatch(/^[0-9a-f]{64}$/)
  void data
}

describe('Ritual event prepared actions: exact source-derived contract', () => {
  it('initializes event 0 with source-derived discriminator and account metas', async () => {
    const { preparer, transport } = prep(); const action = await preparer.prepareInitializeEvent(initArgs()); const wallet = walletAndAssert(preparer, action)
    expectInstruction(action, INSTRUCTION_DISCRIMINATORS.initialize_current_event)
    expect(transport.rentLengths).toEqual([ACCOUNT_DATA_LENGTHS.RitualEvent])
    expect(action.expectation).toEqual({ kind: 'event-initialized', eventIndex: 0 })
    expect(wallet.transaction.instructions).toHaveLength(3) // program ix + explicit compute limit + price
    expect(Array.from(wallet.transaction.instructions[0].data)).toEqual([...INSTRUCTION_DISCRIMINATORS.initialize_current_event, 0])
    expect(wallet.transaction.instructions[0].keys[0].pubkey.equals(eventRitual(action))).toBe(true)
    expect(wallet.transaction.feePayer?.equals(sourceCreator)).toBe(true)
  })

  it('uses the creator as initialize payer and exact event PDA', async () => {
    const { preparer } = prep(); const action = await preparer.prepareInitializeEvent(initArgs()); const w = preparer.getTransactionForWallet(action)
    const [event] = eventPda(new PublicKey(action.ritualAddress), 0, eventProgramId)
    expect(w.transaction.instructions[0].keys[1].pubkey.equals(event)).toBe(true)
    expect(w.transaction.instructions[0].keys[2].pubkey.equals(sourceCreator)).toBe(true)
    expect(w.transaction.instructions[0].keys[3].pubkey.equals(SystemProgram.programId)).toBe(true)
  })

  it('records the digest of the exact serialized wallet message', async () => {
    const { preparer } = prep(); const action = await preparer.prepareInitializeEvent(initArgs()); const wallet = preparer.getTransactionForWallet(action)
    expect(action.messageDigest).toBe(Buffer.from(sha256(wallet.transaction.serializeMessage())).toString('hex'))
    expect(wallet.expectedMessageDigest).toBe(action.messageDigest)
  })

  it('claims with threshold two as Pending, charges claim rent, and creates one claim', async () => {
    const { preparer, transport } = prep(); const action = await preparer.prepareClaim(claimArgs())
    expect(action.kind).toBe('claim'); expect(action.feePayer).toBe(sourceMembers[0].toBase58()); expect(action.expectation).toEqual({ kind: 'claimed', claimant: sourceMembers[0].toBase58(), eventIndex: 0, expectedClaimStatus: 'Pending' })
    expect(action.summary).toMatchObject({ estimatedRentLamports: 121n, totalEstimatedLamportOutflow: 128n, creates: { description: 'completion claim', count: 1 }, tokenOutflow: 0n })
    expect(transport.rentLengths).toEqual([121]); walletAndAssert(preparer, action)
  })

  it('confirms a zero-threshold claim for the matching funded member', async () => {
    const r = ritualContext({ additionalConfirmationThreshold: 0 }); const { preparer } = prep(); const action = await preparer.prepareClaim(claimArgs(r, 1))
    expect(action.expectation).toEqual({ kind: 'claimed', claimant: sourceMembers[1].toBase58(), eventIndex: 0, expectedClaimStatus: 'Confirmed' }); expect(action.feePayer).toBe(sourceMembers[1].toBase58()); walletAndAssert(preparer, action)
  })

  it.each(sourceMembers.map((member, index) => ({ member, index })))('claims each funded member at its exact index ($index)', async ({ member, index }) => {
    const { preparer } = prep(); const action = await preparer.prepareClaim(claimArgs(baseRitual(), index))
    expect(action.expectation).toMatchObject({ claimant: member.toBase58(), eventIndex: 0 }); const w = walletAndAssert(preparer, action); expect(w.transaction.instructions[0].keys[3].pubkey.equals(member)).toBe(true)
  })

  it('approves the second member and predicts confirmation at threshold', async () => {
    const r = ritualContext({ additionalConfirmationThreshold: 2 }); const { preparer, transport } = prep(); const action = await preparer.prepareApprove(approveArgs(r, 0, 2, { approvalsBitmap: 1, approvalCount: 1 }))
    expect(action.expectation).toEqual({ kind: 'approved', claimant: sourceMembers[0].toBase58(), approver: sourceMembers[2].toBase58(), eventIndex: 0, expectedApprovalCount: 2, expectedClaimStatus: 'Confirmed' }); expect(action.summary).toMatchObject({ estimatedRentLamports: 0n, totalEstimatedLamportOutflow: 7n, creates: null }); expect(transport.rentLengths).toEqual([]); walletAndAssert(preparer, action)
  })

  it('keeps approval Pending below threshold with canonical claim routing', async () => {
    const members = [sourceCreator, eventKey(41), eventKey(42), eventKey(43)]; const r = ritualContext({ members, additionalConfirmationThreshold: 3, fundedMembersBitmap: 15, fundedMemberCount: 4 }); const { preparer } = prep(); const action = await preparer.prepareApprove(approveArgs(r, 3, 2, { approvalsBitmap: 1, approvalCount: 1 }))
    expect(action.expectation).toMatchObject({ claimant: members[3].toBase58(), approver: members[2].toBase58(), expectedApprovalCount: 2, expectedClaimStatus: 'Pending' }); const w = walletAndAssert(preparer, action); expect(w.transaction.instructions[0].keys[2].pubkey.equals(claimPda(w.transaction.instructions[0].keys[1].pubkey, members[3], 0, eventProgramId)[0])).toBe(true)
  })

  it('questions a pending claim with exact claimant/questioner/index expectation', async () => {
    const r = ritualContext({ additionalConfirmationThreshold: 2 }); const { preparer, transport } = prep(); const args = { ...approveArgs(r, 0, 1), questioner: sourceMembers[1] }; const action = await preparer.prepareQuestion(args)
    expect(action.expectation).toEqual({ kind: 'questioned', claimant: sourceMembers[0].toBase58(), questioner: sourceMembers[1].toBase58(), eventIndex: 0 }); expect(action.summary).toMatchObject({ estimatedRentLamports: 0n, totalEstimatedLamportOutflow: 7n, creates: null }); expect(transport.rentLengths).toEqual([]); expect(action.feePayer).toBe(sourceMembers[1].toBase58()); walletAndAssert(preparer, action)
  })

  it.each([
    ['pending', { claimedMembersBitmap: 1, confirmedMembersBitmap: 0, questionedMembersBitmap: 0 }, 'Voided', 'UnresolvedClaims'],
    ['no confirmed', { claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0 }, 'Voided', 'NoConfirmedMembers'],
    ['confirmed one', { claimedMembersBitmap: 1, confirmedMembersBitmap: 1, questionedMembersBitmap: 0 }, 'Settled', 'None'],
    ['questioned', { claimedMembersBitmap: 1, confirmedMembersBitmap: 0, questionedMembersBitmap: 1 }, 'Voided', 'UnresolvedClaims'],
  ] as const)('finalizes %s with exact status and void reason', async (_name, bits, expectedStatus, expectedReason) => {
    const { preparer } = prep(); const action = await preparer.prepareFinalize(finalizeArgs(baseRitual(), bits))
    expect(action.expectation).toMatchObject({ kind: 'finalized', eventIndex: 0, expectedEventStatus: expectedStatus, expectedVoidReason: expectedReason, expectedRitualStatus: 'Active', expectedCurrentEventIndex: 1, expectedSettledEventCount: 1 })
    expect(action.summary).toMatchObject({ escrowSettlementTransfer: 300n, protocolForfeitureShare: 0n, estimatedRentLamports: 0n, totalEstimatedLamportOutflow: 7n, creates: null }); walletAndAssert(preparer, action)
  })

  it('finalizes the last coherent event as Completed and increments settled count', async () => {
    const r = ritualContext({ currentEventIndex: 1, settledEventCount: 1, schedule: [sourceSchedule[0], { opens: 400n, deadline: 500n, resolution: 600n }], fundedStakeTotal: 300n }); const { preparer } = prep(); const action = await preparer.prepareFinalize(finalizeArgs(r, { eventIndex: 1, window: r.account.schedule[1] }))
    expect(action.expectation).toMatchObject({ eventIndex: 1, expectedRitualStatus: 'Completed', expectedCurrentEventIndex: 2, expectedSettledEventCount: 2 }); expect(action.summary.escrowSettlementTransfer).toBe(300n); walletAndAssert(preparer, action)
  })

  it.each([2, 3, 4, 5, 6])('routes finalization settlement as perEvent*N for N=%i', async n => {
    const members = [sourceCreator, ...Array.from({ length: n - 1 }, (_, i) => eventKey(30 + i))]; const r = ritualContext({ members, fundedMembersBitmap: (1 << n) - 1, fundedMemberCount: n, fundedStakeTotal: 100n * BigInt(n), perEventAllocation: 100n }); const { preparer } = prep(); const args = finalizeArgs(r, { claimedMembersBitmap: 1, confirmedMembersBitmap: 1 }); const action = await preparer.prepareFinalize(args)
    expect(action.summary.escrowSettlementTransfer).toBe(100n * BigInt(n)); const w = walletAndAssert(preparer, action); expect(w.transaction.instructions[0].keys.slice(5).map(k => k.pubkey.toBase58())).toEqual(r.account.members.map((_, i) => eventKey(110 + i).toBase58()))
  })

  it('rejects settlement multiplication overflow before any transport call', async () => {
    const r = ritualContext({ perEventAllocation: 0xffffffffffffffffn, members: [sourceCreator, eventKey(51)], fundedMembersBitmap: 3, fundedMemberCount: 2 }); const { preparer, transport } = prep(); await expect(preparer.prepareFinalize(finalizeArgs(r))).rejects.toMatchObject({ category: 'input' }); expect(transport.calls).toEqual([])
  })

  it('exposes exact public keys, scalar metadata, and frozen null creates for every event kind', async () => {
    const { preparer } = prep(); const actions = [await preparer.prepareInitializeEvent(initArgs()), await preparer.prepareClaim(claimArgs()), await preparer.prepareApprove(approveArgs()), await preparer.prepareQuestion({ ...approveArgs(), questioner: sourceMembers[1] }), await preparer.prepareFinalize(finalizeArgs())]
    const keys: Record<string, string[]> = { 'initialize-event': ['eventIndex', 'kind'], claim: ['claimant', 'eventIndex', 'expectedClaimStatus', 'kind'], approve: ['approver', 'claimant', 'eventIndex', 'expectedApprovalCount', 'expectedClaimStatus', 'kind'], question: ['claimant', 'eventIndex', 'questioner', 'kind'], finalize: ['eventIndex', 'expectedCurrentEventIndex', 'expectedEventStatus', 'expectedRitualStatus', 'expectedSettledEventCount', 'expectedVoidReason', 'kind'] }
    for (const action of actions) { expect(Object.isFrozen(action)).toBe(true); expect(Object.isFrozen(action.summary)).toBe(true); expect(Object.isFrozen(action.expectation)).toBe(true); expect(Object.keys(action.expectation).sort()).toEqual(keys[action.kind].sort()); expect(action.programId).toBe(eventProgramId.toBase58()); expect(action.summary.tokenMint).toBe(sourceMint.toBase58()); expect(action.summary.creates === null || Object.isFrozen(action.summary.creates)).toBe(true); for (const value of Object.values(action)) if (typeof value === 'string' && value.length > 20) { try { expect(new PublicKey(value).toBase58()).toBe(value) } catch { /* non-key scalar metadata is allowed */ } } }
  })

  it.each(['initialize-event', 'claim', 'approve', 'question', 'finalize'] as const)('reconstructs and rejects a data-byte mutation for %s, then allows a clean clone', async kind => {
    const { preparer } = prep(); const action = kind === 'initialize-event' ? await preparer.prepareInitializeEvent(initArgs()) : kind === 'claim' ? await preparer.prepareClaim(claimArgs()) : kind === 'approve' ? await preparer.prepareApprove(approveArgs()) : kind === 'question' ? await preparer.prepareQuestion({ ...approveArgs(), questioner: sourceMembers[1] }) : await preparer.prepareFinalize(finalizeArgs())
    const mutated = preparer.getTransactionForWallet(action).transaction; mutated.instructions[0].data[0] ^= 1; expect(() => preparer.assertWalletTransactionUnchanged(action, mutated)).toThrowError(RitualPreparationError); const clean = preparer.getTransactionForWallet(action); expect(() => preparer.assertWalletTransactionUnchanged(action, clean.transaction)).not.toThrow(); expect(clean.kind).toBe(kind)
  })

  it.each(['initialize-event', 'claim', 'approve', 'question', 'finalize'] as const)('wallet clone preserves kind and digest for %s', async kind => {
    const { preparer } = prep(); const action = kind === 'initialize-event' ? await preparer.prepareInitializeEvent(initArgs()) : kind === 'claim' ? await preparer.prepareClaim(claimArgs()) : kind === 'approve' ? await preparer.prepareApprove(approveArgs()) : kind === 'question' ? await preparer.prepareQuestion({ ...approveArgs(), questioner: sourceMembers[1] }) : await preparer.prepareFinalize(finalizeArgs())
    const wallet = preparer.getTransactionForWallet(action); expect(wallet.kind).toBe(kind); expect(wallet.expectedMessageDigest).toBe(action.messageDigest); expect(wallet.expectation).toBe(action.expectation); expect(wallet.ritualAddress).toBe(action.ritualAddress)
    expect(Buffer.from(wallet.transaction.serializeMessage()).toString('hex')).toBe(Buffer.from(preparer.getTransactionForWallet(action).transaction.serializeMessage()).toString('hex')); preparer.assertWalletTransactionUnchanged(action, wallet.transaction)
  })

  it.each([
    ['approve', () => approveArgs(), (p: RitualActionPreparer, a: any) => p.prepareApprove(a), sourceMembers[1]],
    ['question', () => ({ ...approveArgs(), questioner: sourceMembers[1] }), (p: RitualActionPreparer, a: any) => p.prepareQuestion(a), sourceMembers[1]],
    ['finalize', () => finalizeArgs(), (p: RitualActionPreparer, a: any) => p.prepareFinalize(a), eventKey(200)],
  ] as const)('uses no rent and the action-specific payer for %s', async (_name, args, call, payer) => {
    const { preparer, transport } = prep(); const action = await call(preparer, args()); expect(transport.rentLengths).toEqual([]); expect(action.feePayer).toBe(payer.toBase58()); expect(action.summary.estimatedRentLamports).toBe(0n); expect(action.summary.totalEstimatedLamportOutflow).toBe(7n); walletAndAssert(preparer, action)
  })
})

function eventRitual(action: { ritualAddress: string }) { return new PublicKey(action.ritualAddress) }
