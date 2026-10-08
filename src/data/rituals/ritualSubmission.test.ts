import { describe, expect, it } from 'vitest'
import { Keypair, PublicKey, Transaction } from '@solana/web3.js'

import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import { RitualActionPreparer, type RitualPreparationTransport } from './ritualPreparedAction'
import { RitualActionSubmitter, SubmittedRitualActionHandle, type RitualWalletSubmissionTransport } from './ritualSubmission'
import { RitualConfirmationVerifier } from './ritualConfirmation'
import { RitualsRpcReader } from './ritualsRpc'
import { deriveCreateRitualAccounts } from './instructionsLifecycle'
import { claimContext, eventContext, eventKey, eventProgramId } from './ritualPreparedAction.events.test.helpers'
import { lifecycleContext, lifecycleSource } from './lifecycleBuilderTestHelpers'
import { eventPda } from './pdas'
import type { BuildCreateRitualArgs } from './instructionsLifecycle'
import * as api from './index'
import { WalletNetworkMismatchError } from '../../utils/walletNetwork'
import { runLifecycleAction } from '../../features/rituals/runLifecycleAction'
import { lifecycleReducer, lifecycleInitialState, lifecycleStatusCopy } from '../../features/rituals/lifecycleMachine'
import { runCreateRitual } from '../../features/rituals/create/runCreateRitual'
import { createMachineReducer, createMachineInitialState, createStatusCopy } from '../../features/rituals/create/createMachine'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const payer = Keypair.fromSeed(new Uint8Array(32).fill(7))
const args: BuildCreateRitualArgs = {
  programId: LOCAL_PLACEHOLDER_PROGRAM_ID, creator: payer.publicKey, stakeMint: key(2), feeRecipientToken: key(3),
  ritual: { nonce: 7n, ruleDigest: '1f'.repeat(32) as never, members: [payer.publicKey, key(4)], memberTotalStake: 100n,
    schedule: [{ opens: 10n, deadline: 20n, resolution: 30n }], additionalConfirmationThreshold: 1, feePayerMode: 'HOST' },
}
class PreparationTransport implements RitualPreparationTransport {
  async getLatestBlockhashAndContext() { return { context: { slot: 12 }, value: { blockhash: key(9).toBase58(), lastValidBlockHeight: 100 } } }
  async getFeeForMessage() { return { context: { slot: 12 }, value: 5000 } }
  async getMinimumBalanceForRentExemption(length: number) { return length }
}
class CapturingVerifier extends RitualConfirmationVerifier {
  readonly actions: unknown[] = []
  constructor(private readonly result: unknown = { marker: 'authoritative' }) {
    super(new RitualsRpcReader({ getMultipleAccountsInfoAndContext: async () => ({ context: { slot: 1 }, value: [] }) }, key(6)), { confirmTransaction: async () => ({ context: { slot: 1 }, value: { err: null } }) })
  }
  override async confirmAndReadRitual(action: unknown) { this.actions.push(action); return this.result as never }
}
const base58 = (bytes: Uint8Array) => {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let digits = [0]
  for (const byte of bytes) { let carry = byte; for (let i = 0; i < digits.length; i++) { const value = digits[i] * 256 + carry; digits[i] = value % 58; carry = Math.floor(value / 58) }; while (carry) { digits.push(carry % 58); carry = Math.floor(carry / 58) } }
  let result = ''; for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += '1'; for (let i = digits.length - 1; i >= 0; i--) result += alphabet[digits[i]]; return result
}

const signingKeys = Array.from({ length: 8 }, (_, n) => Keypair.fromSeed(new Uint8Array(32).fill(40 + n)))
const actors = signingKeys.map(keypair => keypair.publicKey)
const actorByAddress = new Map(signingKeys.map(keypair => [keypair.publicKey.toBase58(), keypair]))
const ritualAddress = deriveCreateRitualAccounts(eventProgramId, actors[0], 7n).ritual
const ritualAccounts = deriveCreateRitualAccounts(eventProgramId, actors[0], 7n)
const ritual = lifecycleContext({
  creator: actors[0], members: [actors[0], actors[1], actors[2]], status: 'Funding',
  protocolConfig: ritualAccounts.protocolConfig, stakeMint: lifecycleSource.stakeMint,
  stakeVault: ritualAccounts.stakeVault, feeVault: ritualAccounts.feeVault,
  bump: ritualAccounts.ritualBump, stakeVaultBump: ritualAccounts.stakeVaultBump, feeVaultBump: ritualAccounts.feeVaultBump,
  fundedMembersBitmap: 7, fundedMemberCount: 3, fundedStakeTotal: 300n,
  fundedFeeTotal: lifecycleSource.lockedActivationFee, activatedAt: 20n,
}) as any
ritual.address = ritualAddress
const activeRitual = { ...ritual, account: { ...ritual.account, status: 'Active' as const } }
const fundingRitual = { ...ritual, account: { ...ritual.account, fundedMembersBitmap: 0, fundedMemberCount: 0, fundedStakeTotal: 0n, fundedFeeTotal: 0n } }
const fullFundingRitual = { ...ritual, account: { ...ritual.account, status: 'Funding' as const } }
const event = (() => { const base = eventContext(activeRitual); const [address] = eventPda(ritualAddress, 0, eventProgramId); return { address, account: { ...base.account, ritual: ritualAddress } } })()
const claim = claimContext(activeRitual, event, 0, { requiredAdditionalConfirmations: 2 })
const sourceFor = (_member: PublicKey, index = 0) => eventKey(150 + index)
const actionCases = [
  { name: 'create', prepare: (p: RitualActionPreparer) => p.prepareCreate({ programId: eventProgramId, creator: actors[0], stakeMint: key(2), feeRecipientToken: key(3), ritual: { nonce: 7n, ruleDigest: '1f'.repeat(32) as never, members: [actors[0], actors[1], actors[2]], memberTotalStake: 100n, schedule: lifecycleSource.schedule, additionalConfirmationThreshold: 2, feePayerMode: 'HOST' } }), expected: { kind: 'created', creator: actors[0].toBase58(), nonce: 7n }, signer: actors[0] },
  { name: 'fund', prepare: (p: RitualActionPreparer) => p.prepareFund({ programId: eventProgramId, ritual: fundingRitual, member: actors[0], memberSource: sourceFor(actors[0]) }), expected: { kind: 'funded', member: actors[0].toBase58(), expectedFundedMemberCount: 1, expectedFundedStakeTotal: 200n, expectedFundedFeeTotal: lifecycleSource.lockedActivationFee }, signer: actors[0] },
  { name: 'activate', prepare: (p: RitualActionPreparer) => p.prepareActivate({ programId: eventProgramId, ritual: fullFundingRitual, feePayer: actors[3] }), expected: { kind: 'activated' }, signer: actors[3] },
  { name: 'cancel', prepare: (p: RitualActionPreparer) => p.prepareCancel({ programId: eventProgramId, ritual, caller: actors[4], destinationTokenAccounts: actors.slice(0, 3).map((_, i) => eventKey(100 + i)) }), expected: { kind: 'cancelled' }, signer: actors[4] },
  { name: 'close', prepare: (p: RitualActionPreparer) => p.prepareClose({ programId: eventProgramId, ritual: { ...ritual, account: { ...ritual.account, status: 'Completed', currentEventIndex: ritual.account.schedule.length, settledEventCount: ritual.account.schedule.length, fundedStakeTotal: 0n } }, feePayer: actors[5] }), expected: { kind: 'vaults-closed' }, signer: actors[5] },
  { name: 'initialize-event', prepare: (p: RitualActionPreparer) => p.prepareInitializeEvent({ programId: eventProgramId, ritual: activeRitual, eventIndex: 0, payer: actors[0] }), expected: { kind: 'event-initialized', eventIndex: 0 }, signer: actors[0] },
  { name: 'claim', prepare: (p: RitualActionPreparer) => p.prepareClaim({ programId: eventProgramId, ritual: activeRitual, event, claimant: actors[0] }), expected: { kind: 'claimed', claimant: actors[0].toBase58(), eventIndex: 0, expectedClaimStatus: 'Pending' }, signer: actors[0] },
  { name: 'approve', prepare: (p: RitualActionPreparer) => p.prepareApprove({ programId: eventProgramId, ritual: activeRitual, event: { ...event, account: { ...event.account, status: 'Claiming', claimedMembersBitmap: 1 } }, claim, approver: actors[1] }), expected: { kind: 'approved', claimant: actors[0].toBase58(), approver: actors[1].toBase58(), eventIndex: 0, expectedApprovalCount: 1, expectedClaimStatus: 'Pending' }, signer: actors[1] },
  { name: 'question', prepare: (p: RitualActionPreparer) => p.prepareQuestion({ programId: eventProgramId, ritual: activeRitual, event: { ...event, account: { ...event.account, status: 'Claiming', claimedMembersBitmap: 1 } }, claim, questioner: actors[1] }), expected: { kind: 'questioned', claimant: actors[0].toBase58(), questioner: actors[1].toBase58(), eventIndex: 0 }, signer: actors[1] },
  { name: 'finalize', prepare: (p: RitualActionPreparer) => p.prepareFinalize({ programId: eventProgramId, ritual: activeRitual, event: { ...event, account: { ...event.account, status: 'Claiming', claimedMembersBitmap: 1, confirmedMembersBitmap: 1 } }, destinationTokenAccounts: actors.slice(0, 3).map((_, i) => eventKey(110 + i)), feePayer: actors[6] }), expected: { kind: 'finalized', eventIndex: 0, expectedEventStatus: 'Settled', expectedVoidReason: 'None', expectedRitualStatus: 'Active', expectedCurrentEventIndex: 1, expectedSettledEventCount: 1 }, signer: actors[6] },
] as const

describe('Ritual action submission', () => {
  it.each([
    [new WalletNetworkMismatchError(), 'network-mismatch'],
    [Object.assign(new Error('wallet request was rejected'), { userRejected: true }), 'wallet-rejected'],
    [new Error('java.util.concurrent.CancellationException'), 'wallet-rejected'],
  ])('preserves wallet evidence through sanitization and both UI machines (%s)', async (error, category) => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    const verifier = new CapturingVerifier()
    const submitter = new RitualActionSubmitter(preparer, verifier, { signAndSendTransaction: async () => { throw error } })
    const submit = async () => { await submitter.submitPrepared(prepared); throw new Error('unreachable') }
    const confirm = async () => { throw new Error('must not confirm') }
    let lifecycle = lifecycleInitialState()
    await runLifecycleAction({ prepare: async () => ({ kind: 'claim', messageDigest: prepared.messageDigest, ritualAddress: prepared.ritualAddress }), submit, confirm }, (event) => { lifecycle = lifecycleReducer(lifecycle, event) })
    let create = createMachineInitialState()
    await runCreateRitual({ prepare: async () => ({ kind: 'create', messageDigest: prepared.messageDigest, ritualAddress: prepared.ritualAddress }), submit, confirm }, (event) => { create = createMachineReducer(create, event) })
    for (const state of [create, lifecycle]) expect(state).toMatchObject({ status: 'error', category, retryable: true, submitted: false })
    for (const copy of [createStatusCopy(create), lifecycleStatusCopy(lifecycle)]) {
      expect(copy.tone).toBe('neutral')
      expect(copy.body).toContain('Nothing was sent.')
      expect(copy.body).not.toContain('You declined')
    }
    expect(verifier.actions).toHaveLength(0)
  })

  it('keeps a sheet cancelled after signing began unresolved: Try again stays, and Create never says nothing was sent', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    // useMobileWallet marks a cancellation that arrives after sign_and_send: a decline, Seed Vault's network sheet, or Back after a broadcast.
    const cancelled = Object.assign(new Error('wallet request was rejected'), { category: 'wallet', userRejected: true, submitted: false, cancelled: true })
    const submitter = new RitualActionSubmitter(preparer, new CapturingVerifier(), { signAndSendTransaction: async () => { throw cancelled } })
    await expect(submitter.submitPrepared(prepared)).rejects.toMatchObject({ category: 'wallet', submitted: false, cancelled: true })
    const submit = async () => { await submitter.submitPrepared(prepared); throw new Error('unreachable') }
    const confirm = async () => { throw new Error('must not confirm') }
    let lifecycle = lifecycleInitialState()
    await runLifecycleAction({ prepare: async () => ({ kind: 'claim', messageDigest: prepared.messageDigest, ritualAddress: prepared.ritualAddress }), submit, confirm }, (event) => { lifecycle = lifecycleReducer(lifecycle, event) })
    let create = createMachineInitialState()
    await runCreateRitual({ prepare: async () => ({ kind: 'create', messageDigest: prepared.messageDigest, ritualAddress: prepared.ritualAddress }), submit, confirm }, (event) => { create = createMachineReducer(create, event) })
    for (const state of [lifecycle, create]) expect(state).toMatchObject({ status: 'error', category: 'wallet-rejected', submitted: false, retryable: true, unresolved: true })
    expect(lifecycleStatusCopy(lifecycle).body).toBe('Nothing was sent. Try again.')
    expect(createStatusCopy(create).body).toBe('Try again.')
  })

  it('converts every prepared expectation and binds exactly one deterministic signer', async () => {
    const observed: string[] = []
    for (const testCase of actionCases) {
      const preparer = new RitualActionPreparer(new PreparationTransport(), eventProgramId)
      const prepared = await testCase.prepare(preparer)
      const walletAction = preparer.getTransactionForWallet(prepared)
      const verifier = new CapturingVerifier()
      let walletCalls = 0
      let submittedTransaction!: Transaction
      const wallet: RitualWalletSubmissionTransport = { signAndSendTransaction: async (transaction: Transaction) => { walletCalls += 1; submittedTransaction = transaction; const signer = actorByAddress.get(transaction.feePayer!.toBase58()); if (!signer) throw new Error('missing deterministic signer'); expect(signer.publicKey.equals(testCase.signer)).toBe(true); transaction.partialSign(signer); return base58(transaction.signatures[0].signature as Uint8Array) } }
      const result = await new RitualActionSubmitter(preparer, verifier, wallet).submitAndConfirm(prepared)
      const submitted = verifier.actions[0] as any
      const compiled = submittedTransaction.compileMessage()
      expect(walletCalls).toBe(1)
      expect(verifier.actions).toHaveLength(1)
      expect(result.actionKind).toBe(testCase.name)
      expect(result.expectationKind).toBe(testCase.expected.kind)
      expect(submitted.signature).toBe(result.signature)
      expect(submitted.blockhash).toBe(walletAction.blockhash)
      expect(submitted.lastValidBlockHeight).toBe(walletAction.lastValidBlockHeight)
      expect(submitted.submittedContextSlot).toBe(walletAction.submittedContextSlot)
      expect(submitted.ritualAddress.toBase58()).toBe(prepared.ritualAddress)
      const converted = { ...submitted.expectation }
      for (const field of ['creator', 'member', 'claimant', 'approver', 'questioner']) if (converted[field]) converted[field] = converted[field].toBase58()
      expect(converted).toEqual(walletAction.expectation)
      expect(converted).toEqual(testCase.expected)
      expect(compiled.header.numRequiredSignatures).toBe(1)
      expect(compiled.accountKeys[0].toBase58()).toBe(submittedTransaction.feePayer!.toBase58())
      observed.push(testCase.name)
    }
    expect(observed).toEqual(['create', 'fund', 'activate', 'cancel', 'close', 'initialize-event', 'claim', 'approve', 'question', 'finalize'])
    expect(new Set(observed).size).toBe(10)
  })

  it('binds a wallet signature to the exact prepared message before confirmation', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)

    const walletCalls: unknown[] = []
    const wallet: RitualWalletSubmissionTransport = { signAndSendTransaction: async (transaction, slot) => { walletCalls.push(transaction, slot); transaction.partialSign(payer); return base58(transaction.signatures[0].signature as Uint8Array) } }
    const confirmed = { marker: 'authoritative' }
    const confirmer = new CapturingVerifier(confirmed)
    const submitter = new RitualActionSubmitter(preparer, confirmer, wallet)
    const result = await submitter.submitAndConfirm(prepared)
    expect(result).toMatchObject({ actionKind: 'create', expectationKind: 'created', confirmed })
    expect(Object.isFrozen(result)).toBe(true)
    expect(walletCalls).toHaveLength(2)
    expect(walletCalls[0]).toBeInstanceOf(Object)
    expect(walletCalls[1]).toBe(12)
  })

  it('rejects malformed wallet signatures before confirmation', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    const verifier = new CapturingVerifier()
    const submitter = new RitualActionSubmitter(preparer, verifier, { signAndSendTransaction: async () => 'not-a-signature' })
    await expect(submitter.submitPrepared(prepared)).rejects.toMatchObject({ category: 'signature' })
    expect(verifier.actions).toHaveLength(0)
  })

  it('rejects a valid signature made for a different message', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    const verifier = new CapturingVerifier()
    const submitter = new RitualActionSubmitter(preparer, verifier, { signAndSendTransaction: async (transaction: Transaction) => { const changed = new Transaction({ feePayer: payer.publicKey, blockhash: key(8).toBase58(), lastValidBlockHeight: 100 }); changed.add(transaction.instructions[0]); changed.partialSign(payer); return base58(changed.signatures[0].signature as Uint8Array) } })
    await expect(submitter.submitPrepared(prepared)).rejects.toMatchObject({ category: 'signature' })
    expect(verifier.actions).toHaveLength(0)
  })

  it('rejects wallet message mutation after handoff without confirmation', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    const verifier = new CapturingVerifier()
    const submitter = new RitualActionSubmitter(preparer, verifier, { signAndSendTransaction: async (transaction: Transaction) => { transaction.recentBlockhash = key(8).toBase58(); return '11111111111111111111111111111111111111111111111111111111111111111' } })
    await expect(submitter.submitPrepared(prepared)).rejects.toMatchObject({ category: 'mutation', submitted: true })
    expect(verifier.actions).toHaveLength(0)
  })

  it('rejects actions from another preparer before touching the wallet', async () => {
    const first = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const second = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await first.prepareCreate(args)
    let calls = 0
    const submitter = new RitualActionSubmitter(second, new CapturingVerifier(), { signAndSendTransaction: async () => { calls += 1; return '' } })
    await expect(submitter.submitAndConfirm(prepared)).rejects.toMatchObject({ category: 'input' })
    expect(calls).toBe(0)
  })

  it('rejects structurally compatible and revoked confirmation dependencies', () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const wallet = { signAndSendTransaction: async () => '' }
    expect(() => new RitualActionSubmitter(preparer, { confirmAndReadRitual: async () => null } as never, wallet)).toThrowError(/verifier is invalid/)
    const revoked = Proxy.revocable(new CapturingVerifier(), {})
    revoked.revoke()
    expect(() => new RitualActionSubmitter(preparer, revoked.proxy, wallet)).toThrowError(/verifier is invalid/)
  })

  it('returns a frozen opaque handle with detached canonical metadata after one wallet request', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    let walletCalls = 0
    const confirmer = new CapturingVerifier({ marker: 'confirmed' })
    const submitter = new RitualActionSubmitter(preparer, confirmer, { signAndSendTransaction: async transaction => { walletCalls += 1; transaction.partialSign(payer); return base58(transaction.signatures[0].signature as Uint8Array) } })
    const handle = await submitter.submitPrepared(prepared)
    expect(handle).toBeInstanceOf(SubmittedRitualActionHandle)
    expect(Object.isFrozen(handle)).toBe(true)
    expect(handle).toMatchObject({ signature: expect.any(String), messageDigest: expect.any(String), actionKind: 'create', expectationKind: 'created', ritualAddress: prepared.ritualAddress })
    expect(Object.keys(handle)).toEqual(['signature', 'messageDigest', 'actionKind', 'expectationKind', 'ritualAddress'])
    expect(walletCalls).toBe(1)
    expect(await submitter.confirmSubmitted(handle)).toMatchObject({ confirmed: { marker: 'confirmed' } })
    expect(confirmer.actions).toHaveLength(1)
  })

  it('rejects plain and prototype-only forged handles before confirmation transport', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    let confirmations = 0
    const confirmer = new CapturingVerifier()
    const submitter = new RitualActionSubmitter(preparer, confirmer, { signAndSendTransaction: async transaction => { transaction.partialSign(payer); return base58(transaction.signatures[0].signature as Uint8Array) } })
    const forged = { signature: 'x', messageDigest: 'y', actionKind: 'create', expectationKind: 'created', ritualAddress: prepared.ritualAddress }
    const prototypeOnly = Object.create(SubmittedRitualActionHandle.prototype)
    const guarded = new Proxy(confirmer, { get(target, property, receiver) { if (property === 'confirmAndReadRitual') confirmations += 1; return Reflect.get(target, property, receiver) } })
    const guardedSubmitter = new RitualActionSubmitter(preparer, guarded, { signAndSendTransaction: async transaction => { transaction.partialSign(payer); return base58(transaction.signatures[0].signature as Uint8Array) } })
    await expect(guardedSubmitter.confirmSubmitted(forged as never)).rejects.toMatchObject({ category: 'input' })
    await expect(guardedSubmitter.confirmSubmitted(prototypeOnly as never)).rejects.toMatchObject({ category: 'input' })
    expect(confirmations).toBe(0)
  })

  it('rejects a handle issued by another submitter', async () => {
    const firstPreparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const secondPreparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await firstPreparer.prepareCreate(args)
    const wallet = { signAndSendTransaction: async (transaction: Transaction) => { transaction.partialSign(payer); return base58(transaction.signatures[0].signature as Uint8Array) } }
    const first = new RitualActionSubmitter(firstPreparer, new CapturingVerifier(), wallet)
    let confirmations = 0
    const secondVerifier = new CapturingVerifier()
    const second = new RitualActionSubmitter(secondPreparer, new Proxy(secondVerifier, { get(target, property, receiver) { if (property === 'confirmAndReadRitual') confirmations += 1; return Reflect.get(target, property, receiver) } }), wallet)
    const handle = await first.submitPrepared(prepared)
    await expect(second.confirmSubmitted(handle)).rejects.toMatchObject({ category: 'input' })
    expect(confirmations).toBe(0)
  })

  it('shares duplicate confirmation promises and a failed confirmation without retrying', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    let confirmations = 0
    const failure = new Error('readback failed')
    const verifier = new CapturingVerifier()
    verifier.confirmAndReadRitual = async () => { confirmations += 1; throw failure }
    const submitter = new RitualActionSubmitter(preparer, verifier, { signAndSendTransaction: async transaction => { transaction.partialSign(payer); return base58(transaction.signatures[0].signature as Uint8Array) } })
    const handle = await submitter.submitPrepared(prepared)
    const first = submitter.confirmSubmitted(handle)
    const second = submitter.confirmSubmitted(handle)
    expect(first).toBe(second)
    await expect(first).rejects.toBe(failure)
    await expect(submitter.confirmSubmitted(handle)).rejects.toBe(failure)
    expect(confirmations).toBe(1)
  })

  it('normalizes and memoizes a synchronous confirmation failure', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    const failure = new Error('synchronous readback failure')
    let confirmations = 0
    const verifier = new CapturingVerifier()
    verifier.confirmAndReadRitual = (() => { confirmations += 1; throw failure }) as never
    const submitter = new RitualActionSubmitter(preparer, verifier, { signAndSendTransaction: async transaction => { transaction.partialSign(payer); return base58(transaction.signatures[0].signature as Uint8Array) } })
    const handle = await submitter.submitPrepared(prepared)
    const first = submitter.confirmSubmitted(handle)
    const second = submitter.confirmSubmitted(handle)
    expect(first).toBe(second)
    await expect(first).rejects.toBe(failure)
    await expect(submitter.confirmSubmitted(handle)).rejects.toBe(failure)
    expect(confirmations).toBe(1)
  })

  it('normalizes and memoizes a hostile confirmation thenable', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    const failure = new Error('hostile thenable')
    let confirmations = 0
    const verifier = new CapturingVerifier()
    verifier.confirmAndReadRitual = (() => {
      confirmations += 1
      return Object.defineProperty({}, 'then', { get() { throw failure } })
    }) as never
    const submitter = new RitualActionSubmitter(preparer, verifier, { signAndSendTransaction: async transaction => { transaction.partialSign(payer); return base58(transaction.signatures[0].signature as Uint8Array) } })
    const handle = await submitter.submitPrepared(prepared)
    const first = submitter.confirmSubmitted(handle)
    const second = submitter.confirmSubmitted(handle)
    expect(first).toBe(second)
    await expect(first).rejects.toBe(failure)
    expect(confirmations).toBe(1)
  })

  it('keeps submitAndConfirm on the split path', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    let walletCalls = 0
    const verifier = new CapturingVerifier({ marker: 'split' })
    const submitter = new RitualActionSubmitter(preparer, verifier, { signAndSendTransaction: async transaction => { walletCalls += 1; transaction.partialSign(payer); return base58(transaction.signatures[0].signature as Uint8Array) } })
    const result = await submitter.submitAndConfirm(prepared)
    expect(result.confirmed).toEqual({ marker: 'split' })
    expect(walletCalls).toBe(1)
    expect(verifier.actions).toHaveLength(1)
  })

  it('keeps low-level submission constructors out of the rituals barrel', () => {
    expect((api as Record<string, unknown>).RitualActionSubmitter).toBeUndefined()
    expect((api as Record<string, unknown>).createRitualActionSubmitter).toBeUndefined()
    expect(api.RitualSubmissionError).toBeTypeOf('function')
  })
})

describe('post-wallet failures are never reported as "nothing was sent"', () => {
  it.each([
    Object.assign(new Error('wallet submission failed'), { submitted: true, userRejected: false }),
    new Error('java.util.concurrent.TimeoutException: Timed out waiting for response with id=2'),
    { name: 'java.util.concurrent.ExecutionException', code: 'Timed out waiting for response', userRejected: true },
  ])('keeps a lost signing response non-retryable in both machines (%j)', async (error) => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    const submitter = new RitualActionSubmitter(preparer, new CapturingVerifier(), { signAndSendTransaction: async () => { throw error } })
    const submit = async () => { await submitter.submitPrepared(prepared); throw new Error('unreachable') }
    const confirm = async () => { throw new Error('must not confirm') }
    let lifecycle = lifecycleInitialState()
    await runLifecycleAction({ prepare: async () => ({ kind: 'claim', messageDigest: prepared.messageDigest, ritualAddress: prepared.ritualAddress }), submit, confirm }, (event) => { lifecycle = lifecycleReducer(lifecycle, event) })
    let create = createMachineInitialState()
    await runCreateRitual({ prepare: async () => ({ kind: 'create', messageDigest: prepared.messageDigest, ritualAddress: prepared.ritualAddress }), submit, confirm }, (event) => { create = createMachineReducer(create, event) })
    for (const state of [lifecycle, create]) expect(state).toMatchObject({ status: 'error', category: 'confirmation', retryable: false, submitted: true })
    for (const copy of [lifecycleStatusCopy(lifecycle), createStatusCopy(create)]) expect(copy.body).not.toContain('Nothing was sent')
  })
  it('does not turn a known pre-signing timeout into a possible broadcast', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    const error = Object.assign(new Error('request timed out'), { category: 'authorization', submitted: false, userRejected: false })
    const submitter = new RitualActionSubmitter(preparer, new CapturingVerifier(), { signAndSendTransaction: async () => { throw error } })
    await expect(submitter.submitPrepared(prepared)).rejects.toMatchObject({ submitted: false, message: 'wallet submission failed' })
  })
  it('a signature that does not verify our message is marked submitted and carries the signature', async () => {
    // Phantom-style: wallet signs a different (rewritten) message and returns that signature.
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    const verifier = new CapturingVerifier()
    const sig = '4RbVZJqLgpusoPskgbuCzYxJqq4crFB44kBks58nzQGw6eQjMthqBkt5UY8oENB5h6UPNFAdP3GuhaXAkteii4FK'
    const submitter = new RitualActionSubmitter(preparer, verifier, { signAndSendTransaction: async () => sig })
    await expect(submitter.submitPrepared(prepared)).rejects.toMatchObject({ category: 'signature', submitted: true, signature: sig })
    expect(verifier.actions).toHaveLength(0)
  })
  it('a wallet error before any signature stays pre-submission', async () => {
    const preparer = new RitualActionPreparer(new PreparationTransport(), LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await preparer.prepareCreate(args)
    const submitter = new RitualActionSubmitter(preparer, new CapturingVerifier(), { signAndSendTransaction: async () => { throw new Error('auth_token not valid for signing') } })
    await expect(submitter.submitPrepared(prepared)).rejects.toMatchObject({ category: 'wallet', submitted: false })
  })
})
