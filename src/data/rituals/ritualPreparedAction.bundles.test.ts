import { describe, expect, it } from 'vitest'
import { Buffer } from 'buffer'
import { encodeFinalizeEventData, encodeInitializeCurrentEventData } from './instructionData'
import { RitualActionPreparer } from './ritualPreparedAction'
import { EventTransport, eventProgramId, eventSource, sourceCreator, sourceKey, ritualContext } from './ritualPreparedAction.events.test.helpers'

const createArgs = {
  programId: eventProgramId,
  creator: sourceCreator,
  stakeMint: eventSource.stakeMint,
  feeRecipientToken: sourceKey(201),
  ritual: {
    nonce: 991n,
    ruleDigest: '1f'.repeat(32) as never,
    members: eventSource.members,
    memberTotalStake: eventSource.memberTotalStake,
    schedule: eventSource.schedule,
    additionalConfirmationThreshold: eventSource.additionalConfirmationThreshold,
    feePayerMode: 'HOST' as const,
  },
}

const soloCreateArgs = {
  programId: eventProgramId,
  creator: sourceCreator,
  stakeMint: eventSource.stakeMint,
  feeRecipientToken: sourceKey(201),
  forfeitDestination: sourceKey(206),
  season: sourceKey(205),
  ritual: {
    nonce: 995n,
    ruleDigest: '1f'.repeat(32) as never,
    memberTotalStake: 1600n,
    schedule: Array.from({ length: 16 }, (_, index) => {
      const opens = 10000n + BigInt(index * 10)
      return { opens, deadline: opens + 1n, resolution: opens + 2n }
    }),
    witness: null,
  },
}

describe('bundled prepared Ritual actions', () => {
  it.each([false, true])('initializes and finalizes a solo week atomically, skip=%s', async (skipDeclared) => {
    const ritual = ritualContext({ kind: 'Solo', members: [sourceCreator], fundedMembersBitmap: 1,
      forfeitDestination: sourceKey(206), skipDeclared, skipEventIndex: 0 })
    const preparer = new RitualActionPreparer(new EventTransport(), eventProgramId)
    const action = await preparer.prepareInitializeAndFinalize({ programId: eventProgramId, ritual, eventIndex: 0,
      payer: sourceKey(210), destinationTokenAccounts: [sourceKey(207)] })
    const wallet = preparer.getTransactionForWallet(action)
    const instructions = wallet.transaction.instructions
    expect(instructions).toHaveLength(4)
    expect(instructions[0].data).toEqual(Buffer.from(encodeInitializeCurrentEventData(0)))
    expect(instructions[1].data).toEqual(Buffer.from(encodeFinalizeEventData(0)))
    expect(instructions[0].keys[1].pubkey.equals(instructions[1].keys[1].pubkey)).toBe(true)
    expect(instructions[1].keys.at(-1)?.pubkey.equals(ritual.account.forfeitDestination)).toBe(true)
    expect(wallet.transaction.compileMessage().header.numRequiredSignatures).toBe(1)
    expect(wallet.transaction.feePayer?.equals(sourceKey(210))).toBe(true)
    expect(wallet.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).length).toBeLessThanOrEqual(1232)
    expect(action.summary.estimatedRentLamports).toBe(139n)
    expect(action.expectation).toMatchObject({ kind: 'finalized', eventIndex: 0,
      expectedEventStatus: skipDeclared ? 'Voided' : 'Settled', expectedVoidReason: skipDeclared ? 'DeclaredSkip' : 'None', expectedCurrentEventIndex: 1 })
    preparer.assertWalletTransactionUnchanged(action, wallet.transaction)
    await expect(preparer.prepareInitializeAndFinalize({ programId: eventProgramId, ritual, eventIndex: 1,
      payer: sourceKey(210), destinationTokenAccounts: [sourceKey(207)] })).rejects.toThrow()
  })
  it('keeps create and host funding in one exact-message action', async () => {
    const preparer = new RitualActionPreparer(new EventTransport(), eventProgramId)
    const action = await preparer.prepareCreateAndFund({ ...createArgs, memberSource: sourceKey(202), lockedActivationFee: eventSource.lockedActivationFee })
    const wallet = preparer.getTransactionForWallet(action)
    expect(action.kind).toBe('create-and-fund')
    expect(wallet.transaction.instructions).toHaveLength(4)
    expect(action.expectation).toEqual({ kind: 'bundle', expectations: [
      { kind: 'created', creator: sourceCreator.toBase58(), nonce: 991n },
      { kind: 'funded', member: sourceCreator.toBase58(), expectedFundedMemberCount: 1, expectedFundedStakeTotal: eventSource.memberTotalStake, expectedFundedFeeTotal: eventSource.lockedActivationFee },
    ] })
    expect(wallet.transaction.compileMessage().header.numRequiredSignatures).toBe(1)
    preparer.assertWalletTransactionUnchanged(action, wallet.transaction)
  })

  it('keeps solo create, creator funding, and activation in one legacy-safe action', async () => {
    const preparer = new RitualActionPreparer(new EventTransport(), eventProgramId)
    const action = await preparer.prepareCreateSoloFundAndActivate({ ...soloCreateArgs, memberSource: sourceKey(207), lockedActivationFee: eventSource.lockedActivationFee })
    const wallet = preparer.getTransactionForWallet(action)
    expect(action.kind).toBe('create-solo-fund-and-activate')
    expect(wallet.transaction.instructions).toHaveLength(5)
    expect(wallet.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).length).toBe(1068)
    expect(action.expectation).toEqual({ kind: 'bundle', expectations: [
      { kind: 'created', creator: sourceCreator.toBase58(), nonce: 995n },
      { kind: 'funded', member: sourceCreator.toBase58(), expectedFundedMemberCount: 1, expectedFundedStakeTotal: 1600n, expectedFundedFeeTotal: eventSource.lockedActivationFee },
      { kind: 'activated' },
    ] })
    preparer.assertWalletTransactionUnchanged(action, wallet.transaction)
  })

  it('keeps last-member funding and activation in one exact-message action', async () => {
    const ritual = ritualContext({
      status: 'Funding',
      fundedMembersBitmap: 5,
      fundedMemberCount: 2,
      fundedStakeTotal: eventSource.memberTotalStake * 2n,
      fundedFeeTotal: eventSource.lockedActivationFee,
      schedule: [{ opens: 100n, deadline: 200n, resolution: 300n }],
    })
    const preparer = new RitualActionPreparer(new EventTransport(), eventProgramId)
    const action = await preparer.prepareFundAndActivate({ programId: eventProgramId, ritual, member: eventSource.members[1], memberSource: sourceKey(203) })
    expect(action.kind).toBe('fund-and-activate')
    expect(action.expectation).toEqual({ kind: 'bundle', expectations: [
      { kind: 'funded', member: eventSource.members[1].toBase58(), expectedFundedMemberCount: 3, expectedFundedStakeTotal: eventSource.memberTotalStake * 3n, expectedFundedFeeTotal: eventSource.lockedActivationFee },
      { kind: 'activated' },
    ] })
    const wallet = preparer.getTransactionForWallet(action)
    expect(wallet.transaction.instructions).toHaveLength(4)
    expect(wallet.transaction.instructions[0].data.slice(0, 8)).toEqual(Buffer.from([234, 156, 207, 252, 148, 24, 162, 238]))
    expect(wallet.transaction.instructions[1].data.slice(0, 8)).toEqual(Buffer.from([188, 109, 197, 57, 117, 119, 89, 251]))
    expect(wallet.transaction.compileMessage().header.numRequiredSignatures).toBe(1)
    preparer.assertWalletTransactionUnchanged(action, wallet.transaction)
  })

  it('uses the exact SPLIT fee share in the bundled funding outflow', async () => {
    const ritual = ritualContext({ status: 'Funding', feePayerMode: 'Split', lockedActivationFee: 5n, members: eventSource.members.slice(0, 2), fundedMembersBitmap: 1, fundedMemberCount: 1, fundedStakeTotal: eventSource.memberTotalStake, fundedFeeTotal: 3n, schedule: [{ opens: 100n, deadline: 200n, resolution: 300n }] })
    const action = await new RitualActionPreparer(new EventTransport(), eventProgramId).prepareFundAndActivate({ programId: eventProgramId, ritual, member: eventSource.members[1], memberSource: sourceKey(204) })
    expect(action.summary).toMatchObject({ tokenOutflow: eventSource.memberTotalStake + 2n, activationFeeOutflow: 2n, escrowActivationFeeTransfer: 5n })
    expect(action.expectation).toMatchObject({ kind: 'bundle', expectations: [{ kind: 'funded', expectedFundedFeeTotal: 5n }, { kind: 'activated' }] })
  })

  it('keeps event initialization and the first claim in one exact-message action', async () => {
    const ritual = ritualContext()
    const preparer = new RitualActionPreparer(new EventTransport(), eventProgramId)
    const action = await preparer.prepareInitializeAndClaim({
      programId: eventProgramId,
      ritual,
      eventIndex: 0,
      payer: sourceCreator,
      claimant: sourceCreator,
    })
    expect(action.kind).toBe('initialize-event-and-claim')
    expect(action.summary.estimatedRentLamports).toBe(BigInt(139 + 121))
    expect(action.expectation).toMatchObject({ kind: 'bundle', expectations: [{ kind: 'event-initialized', eventIndex: 0 }, { kind: 'claimed', claimant: sourceCreator.toBase58(), eventIndex: 0 }] })
    const wallet = preparer.getTransactionForWallet(action)
    expect(wallet.transaction.instructions).toHaveLength(4)
    preparer.assertWalletTransactionUnchanged(action, wallet.transaction)
  })
})
