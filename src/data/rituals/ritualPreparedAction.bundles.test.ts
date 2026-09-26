import { describe, expect, it } from 'vitest'
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
