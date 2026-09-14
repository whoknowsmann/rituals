import { describe, expect, it } from 'vitest'
import { Buffer } from 'buffer'
import { PublicKey, Message } from '@solana/web3.js'
import { RitualActionPreparer, RitualPreparationError } from './ritualPreparedAction'
import { lifecycleAddresses, lifecycleContext, lifecycleKey, lifecycleProgramId, lifecycleSource, fullyFundedContext } from './lifecycleBuilderTestHelpers'

const blockhash = lifecycleKey(90).toBase58()
class Transport {
  calls: string[] = []
  getLatestBlockhashAndContext() { this.calls.push('latest'); return Promise.resolve({ context: { slot: 9 }, value: { blockhash, lastValidBlockHeight: 99 } }) }
  getFeeForMessage(_message: Message) { this.calls.push('fee'); return Promise.resolve({ context: { slot: 9 }, value: 5 }) }
  getMinimumBalanceForRentExemption(length: number) { this.calls.push(`rent${length}`); return Promise.resolve(length) }
}
const preparer = (transport = new Transport()) => ({ transport, value: new RitualActionPreparer(transport, lifecycleProgramId) })
const fund = (ritual = lifecycleContext()) => ({ programId: lifecycleProgramId, ritual, member: lifecycleSource.members[0], memberSource: lifecycleKey(70) })
const activate = (ritual = fullyFundedContext()) => ({ programId: lifecycleProgramId, ritual, feePayer: lifecycleKey(71) })
const cancel = (ritual = lifecycleContext()) => ({ programId: lifecycleProgramId, ritual, caller: lifecycleKey(72), destinationTokenAccounts: lifecycleSource.members.map((_, i) => lifecycleKey(80 + i)) })
const close = (status: 'Completed' | 'Cancelled') => ({
  programId: lifecycleProgramId,
  ritual: lifecycleContext({
    status,
    vaultsClosed: false,
    fundedMembersBitmap: status === 'Completed' ? 7 : 0,
    fundedMemberCount: status === 'Completed' ? 3 : 0,
    fundedStakeTotal: 0n,
    fundedFeeTotal: status === 'Completed' ? lifecycleSource.lockedActivationFee : 0n,
    currentEventIndex: status === 'Completed' ? lifecycleSource.schedule.length : 0,
    settledEventCount: status === 'Completed' ? lifecycleSource.schedule.length : 0,
    activatedAt: status === 'Completed' ? 20n : 0n,
    cancelledAt: status === 'Cancelled' ? lifecycleSource.createdAt : 0n,
    completedAt: status === 'Completed' ? lifecycleSource.schedule.at(-1)!.resolution + 1n : 0n,
  }),
  feePayer: lifecycleKey(73),
})
const splitCases = Array.from({ length: 5 }, (_, n) => n + 2).flatMap(memberCount => Array.from({ length: memberCount }, (_, remainder) => Array.from({ length: memberCount }, (_, memberIndex) => ({ memberCount, remainder, memberIndex }))).flat())
const hostCases = Array.from({ length: 5 }, (_, n) => n + 2).flatMap(memberCount => Array.from({ length: memberCount }, (_, creatorPosition) => ({ memberCount, creatorPosition })))

describe('Fund, Activate, Cancel, and Close preparation contract', () => {
  it.each([
    ['fund', (p: RitualActionPreparer, bad: never) => p.prepareFund(bad)],
    ['activate', (p: RitualActionPreparer, bad: never) => p.prepareActivate(bad)],
    ['cancel', (p: RitualActionPreparer, bad: never) => p.prepareCancel(bad)],
    ['close', (p: RitualActionPreparer, bad: never) => p.prepareClose(bad)],
  ])('normalizes missing or primitive %s arguments without transport calls', async (_kind, call) => {
    const { transport, value } = preparer()
    await expect(call(value, null as never)).rejects.toBeInstanceOf(RitualPreparationError)
    expect(transport.calls).toEqual([])
  })

  it('reports exact money and rent semantics for every lifecycle action', async () => {
    const { transport, value } = preparer()
    const fundAction = await value.prepareFund(fund())
    expect(fundAction.summary).toMatchObject({ tokenOutflow: lifecycleSource.memberTotalStake + lifecycleSource.lockedActivationFee, stakeOutflow: lifecycleSource.memberTotalStake, activationFeeOutflow: lifecycleSource.lockedActivationFee, rentCreditIsEstimate: false, creates: null })
    expect(fundAction.expectation).toMatchObject({ kind: 'funded', expectedFundedMemberCount: 1 })
    const activateAction = await value.prepareActivate(activate())
    expect(activateAction.summary).toMatchObject({ tokenOutflow: 0n, escrowActivationFeeTransfer: lifecycleSource.lockedActivationFee, rentCreditIsEstimate: false, estimatedRentLamports: 0n })
    const cancelAction = await value.prepareCancel(cancel())
    expect(cancelAction.summary).toMatchObject({ tokenOutflow: 0n, rentCreditIsEstimate: false, rentCreditRecipient: null })
    const closeAction = await value.prepareClose(close('Completed'))
    expect(closeAction.summary).toMatchObject({ tokenOutflow: 0n, rentCreditIsEstimate: true, rentCreditRecipient: lifecycleSource.creator.toBase58(), estimatedRentCreditLamports: 2n * 165n })
    expect(transport.calls).toEqual(['latest', 'fee', 'latest', 'fee', 'latest', 'fee', 'latest', 'fee', 'rent165', 'rent165'])
  })

  it('snapshots lifecycle context, member, payer, and destinations before transport awaits', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const transport = new Transport(); transport.getLatestBlockhashAndContext = () => { transport.calls.push('latest'); return gate.then(() => ({ context: { slot: 9 }, value: { blockhash, lastValidBlockHeight: 99 } })) }
    const { value } = preparer(transport)
    const args = cancel(); const pending = value.prepareCancel(args)
    const mutable = args as any; mutable.caller = lifecycleKey(5); mutable.destinationTokenAccounts = [lifecycleKey(6), lifecycleKey(7), lifecycleKey(8)]; mutable.ritual.account = { ...mutable.ritual.account, creator: lifecycleKey(5) }
    release(); const action = await pending; const wallet = value.getTransactionForWallet(action)
    expect(action.feePayer).toBe(lifecycleKey(72).toBase58())
    expect(wallet.transaction.instructions[0].keys.slice(-3).map(key => key.pubkey.toBase58())).toEqual([80, 81, 82].map(lifecycleKey).map(key => key.toBase58()))
  })

  it('supports both terminal states and rejects already-closed vaults', async () => {
    const { value } = preparer()
    await expect(value.prepareClose(close('Completed'))).resolves.toMatchObject({ kind: 'close' })
    await expect(value.prepareClose(close('Cancelled'))).resolves.toMatchObject({ kind: 'close' })
    await expect(value.prepareClose({ ...close('Cancelled'), ritual: lifecycleContext({ status: 'Funding', vaultsClosed: false }) })).rejects.toMatchObject({ category: 'input' })
    await expect(value.prepareClose({ ...close('Cancelled'), ritual: lifecycleContext({ status: 'Cancelled', vaultsClosed: true }) })).rejects.toMatchObject({ category: 'input' })
  })

  it.each(splitCases)('allocates SPLIT remainder to the lowest member indices (N=$memberCount remainder=$remainder index=$memberIndex)', async ({ memberCount, remainder, memberIndex }) => {
    const { value } = preparer()
    const lockedActivationFee = BigInt(memberCount * 100 + remainder)
    const ritual = lifecycleContext({ members: [lifecycleSource.creator, ...Array.from({ length: memberCount - 1 }, (_, index) => lifecycleKey(40 + index))], feePayerMode: 'Split', lockedActivationFee, fundedMembersBitmap: 0, fundedMemberCount: 0, fundedStakeTotal: 0n, fundedFeeTotal: 0n })
    const action = await value.prepareFund({ ...fund(), ritual, member: ritual.account.members[memberIndex] })
    const expectedShare = lockedActivationFee / BigInt(memberCount) + (memberIndex < remainder ? 1n : 0n)
    expect(action.summary.activationFeeOutflow).toBe(expectedShare)
    expect(action.summary.tokenOutflow).toBe(ritual.account.memberTotalStake + expectedShare)
    expect(action.expectation).toMatchObject({ expectedFundedMemberCount: 1, expectedFundedStakeTotal: ritual.account.memberTotalStake, expectedFundedFeeTotal: expectedShare })
  })

  it.each(hostCases)('charges HOST fee only for the creator (N=$memberCount position=$creatorPosition)', async ({ memberCount, creatorPosition }) => {
    const { value } = preparer()
    const creator = lifecycleSource.creator
    const noncreators = Array.from({ length: memberCount - 1 }, (_, index) => lifecycleKey(100 + (memberCount - 2) * 5 + index))
    const members = noncreators.slice()
    members.splice(creatorPosition, 0, creator)
    const ritual = lifecycleContext({ members, feePayerMode: 'Host', lockedActivationFee: 778n, fundedMembersBitmap: 0, fundedMemberCount: 0, fundedStakeTotal: 0n, fundedFeeTotal: 0n })
    expect(ritual.account.members).toEqual(members)
    expect(ritual.account.members).toHaveLength(memberCount)
    expect(ritual.account.members[creatorPosition]).toEqual(creator)
    expect(ritual.account.members.findIndex(member => member.equals(creator))).toBe(creatorPosition)
    const creatorAction = await value.prepareFund({ ...fund(), ritual, member: creator })
    const noncreator = members.find(member => !member.equals(creator))!
    const noncreatorAction = await value.prepareFund({ ...fund(), ritual, member: noncreator })
    expect(creatorAction.summary).toMatchObject({ activationFeeOutflow: 778n, tokenOutflow: ritual.account.memberTotalStake + 778n })
    expect(creatorAction.expectation).toMatchObject({ member: creator.toBase58(), expectedFundedMemberCount: 1, expectedFundedStakeTotal: ritual.account.memberTotalStake, expectedFundedFeeTotal: 778n })
    expect(noncreatorAction.summary).toMatchObject({ activationFeeOutflow: 0n, tokenOutflow: ritual.account.memberTotalStake })
    expect(noncreatorAction.expectation).toMatchObject({ member: noncreator.toBase58(), expectedFundedMemberCount: 1, expectedFundedStakeTotal: ritual.account.memberTotalStake, expectedFundedFeeTotal: 0n })
  })

  it('keeps discriminated expectation keys exact and keeps wallet clones independent for every kind', async () => {
    const { value } = preparer()
    const actions = [await value.prepareFund(fund()), await value.prepareActivate(activate()), await value.prepareCancel(cancel()), await value.prepareClose(close('Cancelled'))]
    for (const action of actions) {
      const expected = action.kind === 'fund' ? ['expectedFundedFeeTotal', 'expectedFundedMemberCount', 'expectedFundedStakeTotal', 'kind', 'member'] : ['kind']
      expect(Object.keys(action.expectation).sort()).toEqual(expected.sort())
      const first = value.getTransactionForWallet(action); const second = value.getTransactionForWallet(action)
      expect(first.transaction).not.toBe(second.transaction)
      expect(Buffer.from(first.transaction.serializeMessage()).equals(Buffer.from(second.transaction.serializeMessage()))).toBe(true)
      value.assertWalletTransactionUnchanged(action, first.transaction)
    }
  })
})
