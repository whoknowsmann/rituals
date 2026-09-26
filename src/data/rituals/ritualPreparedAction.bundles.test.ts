import { describe, expect, it } from 'vitest'
import { Buffer } from 'buffer'
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

describe('bundled prepared Ritual actions', () => {
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
