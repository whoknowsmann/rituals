import { describe, expect, it } from 'vitest'
import { ACCOUNT_SIZE } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import { decodeRitual } from './accounts'
import { envelope, accountVectors } from './__fixtures__/accountVectors'
import { deriveCreateRitualAccounts } from './instructionsLifecycle'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import { RitualActionPreparer } from './ritualPreparedAction'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const source = decodeRitual(envelope(accountVectors.ritual.hex), LOCAL_PLACEHOLDER_PROGRAM_ID)
const addresses = deriveCreateRitualAccounts(LOCAL_PLACEHOLDER_PROGRAM_ID, source.creator, source.nonce)
const funding = { address: addresses.ritual, account: { ...source, status: 'Funding' as const, fundedMembersBitmap: 1, fundedMemberCount: 1, fundedStakeTotal: source.memberTotalStake, fundedFeeTotal: source.lockedActivationFee } }
const hostCreatorFunding = { address: addresses.ritual, account: { ...source, status: 'Funding' as const, fundedMembersBitmap: 2, fundedMemberCount: 1, fundedStakeTotal: source.memberTotalStake, fundedFeeTotal: 0n } }
const splitFunding = { address: addresses.ritual, account: { ...source, feePayerMode: 'Split' as const, status: 'Funding' as const, fundedMembersBitmap: 1, fundedMemberCount: 1, fundedStakeTotal: source.memberTotalStake, fundedFeeTotal: 260n } }
const transport = () => ({
  rentLengths: [] as number[],
  async getLatestBlockhashAndContext() { return { context: { slot: 12 }, value: { blockhash: key(9).toBase58(), lastValidBlockHeight: 100 } } },
  async getFeeForMessage() { return { context: { slot: 12 }, value: 5000 } },
  async getMinimumBalanceForRentExemption(length: number) { this.rentLengths.push(length); return length },
})

describe('opaque Ritual lifecycle preparation', () => {
  it('prepares HOST noncreator funding with stake-only wallet outflow', async () => {
    const t = transport(); const action = await new RitualActionPreparer(t, LOCAL_PLACEHOLDER_PROGRAM_ID).prepareFund({ programId: LOCAL_PLACEHOLDER_PROGRAM_ID, ritual: funding, member: source.members[1], memberSource: key(32) })
    expect(action.kind).toBe('fund'); expect(action.feePayer).toBe(source.members[1].toBase58()); expect(action.summary.tokenOutflow).toBe(source.memberTotalStake); expect(action.summary.stakeOutflow).toBe(source.memberTotalStake); expect(action.summary.activationFeeOutflow).toBe(0n); expect(action.summary.tokenOutflow).toBe(action.summary.stakeOutflow + action.summary.activationFeeOutflow); expect(action.expectation).toMatchObject({ kind: 'funded', expectedFundedMemberCount: 2, expectedFundedStakeTotal: source.memberTotalStake * 2n, expectedFundedFeeTotal: source.lockedActivationFee }); expect(t.rentLengths).toEqual([])
  })
  it('prepares HOST creator funding with stake and activation fee wallet outflow', async () => {
    const action = await new RitualActionPreparer(transport(), LOCAL_PLACEHOLDER_PROGRAM_ID).prepareFund({ programId: LOCAL_PLACEHOLDER_PROGRAM_ID, ritual: hostCreatorFunding, member: source.creator, memberSource: key(33) })
    expect(action.summary).toMatchObject({ tokenOutflow: source.memberTotalStake + source.lockedActivationFee, stakeOutflow: source.memberTotalStake, activationFeeOutflow: source.lockedActivationFee })
  })
  it('prepares SPLIT funding with the exact member fee share in wallet outflow', async () => {
    const action = await new RitualActionPreparer(transport(), LOCAL_PLACEHOLDER_PROGRAM_ID).prepareFund({ programId: LOCAL_PLACEHOLDER_PROGRAM_ID, ritual: splitFunding, member: source.members[1], memberSource: key(34) })
    expect(action.summary).toMatchObject({ tokenOutflow: source.memberTotalStake + 259n, stakeOutflow: source.memberTotalStake, activationFeeOutflow: 259n }); expect(action.summary.tokenOutflow).toBe(action.summary.stakeOutflow + action.summary.activationFeeOutflow); expect(action.expectation).toMatchObject({ kind: 'funded', expectedFundedMemberCount: 2, expectedFundedStakeTotal: source.memberTotalStake * 2n, expectedFundedFeeTotal: 519n })
  })
  it('rejects wallet token outflow overflow before transport', async () => {
    const overflow = { address: addresses.ritual, account: { ...source, feePayerMode: 'Split' as const, memberTotalStake: 0xffffffffffffffffn, lockedActivationFee: 3n, fundedMembersBitmap: 0, fundedMemberCount: 0, fundedStakeTotal: 0n, fundedFeeTotal: 0n } }
    await expect(new RitualActionPreparer(transport(), LOCAL_PLACEHOLDER_PROGRAM_ID).prepareFund({ programId: LOCAL_PLACEHOLDER_PROGRAM_ID, ritual: overflow, member: source.members[0], memberSource: key(35) })).rejects.toMatchObject({ category: 'input' })
  })
  it('prepares activation with escrow transfer but no wallet outflow', async () => {
    const t = transport(); const funded = { address: addresses.ritual, account: { ...funding.account, fundedMembersBitmap: 7, fundedMemberCount: 3, fundedStakeTotal: source.memberTotalStake * 3n, fundedFeeTotal: source.lockedActivationFee } }
    const action = await new RitualActionPreparer(t, LOCAL_PLACEHOLDER_PROGRAM_ID).prepareActivate({ programId: LOCAL_PLACEHOLDER_PROGRAM_ID, ritual: funded, feePayer: key(88) })
    expect(action.summary).toMatchObject({ tokenOutflow: 0n, stakeOutflow: 0n, activationFeeOutflow: 0n, escrowActivationFeeTransfer: source.lockedActivationFee, estimatedRentLamports: 0n, totalEstimatedLamportOutflow: 5000n }); expect(action.expectation.kind).toBe('activated')
  })
  it('prepares cancellation with caller as payer and no negative refund outflow', async () => {
    const action = await new RitualActionPreparer(transport(), LOCAL_PLACEHOLDER_PROGRAM_ID).prepareCancel({ programId: LOCAL_PLACEHOLDER_PROGRAM_ID, ritual: funding, caller: key(77), destinationTokenAccounts: [key(41), key(42), key(43)] })
    expect(action.kind).toBe('cancel'); expect(action.feePayer).toBe(key(77).toBase58()); expect(action.summary.tokenOutflow).toBe(0n); expect(action.summary.totalEstimatedLamportOutflow).toBe(5000n); expect(action.expectation.kind).toBe('cancelled')
  })
  it('prepares terminal closure with two rent credits to the immutable creator', async () => {
    const t = transport(); const terminal = { address: addresses.ritual, account: { ...funding.account, status: 'Completed' as const, vaultsClosed: false, fundedMembersBitmap: 7, fundedMemberCount: 3, fundedStakeTotal: 0n, fundedFeeTotal: source.lockedActivationFee, currentEventIndex: source.schedule.length, settledEventCount: source.schedule.length, activatedAt: 1n, completedAt: source.schedule.at(-1)!.resolution + 1n } }
    const action = await new RitualActionPreparer(t, LOCAL_PLACEHOLDER_PROGRAM_ID).prepareClose({ programId: LOCAL_PLACEHOLDER_PROGRAM_ID, ritual: terminal, feePayer: key(66) })
    expect(t.rentLengths).toEqual([ACCOUNT_SIZE, ACCOUNT_SIZE]); expect(action.summary).toMatchObject({ estimatedRentLamports: 0n, estimatedRentCreditLamports: BigInt(ACCOUNT_SIZE * 2), rentCreditRecipient: source.creator.toBase58(), totalEstimatedLamportOutflow: 5000n }); expect(action.expectation.kind).toBe('vaults-closed')
  })
})
