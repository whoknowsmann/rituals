import { sha256 } from '@noble/hashes/sha256'
import { Buffer } from 'buffer'
import { PublicKey, Transaction } from '@solana/web3.js'
import { RITUALS_CURRENT_CONFIG } from './programIds'
import { canonicalBase58Signature, decodeCanonicalBase58Signature } from './base58Signature'
import { RitualActionPreparer, type PreparedExpectation, type PreparedRitualAction } from './ritualPreparedAction'
import { RitualConfirmationVerifier, type RitualActionExpectation, type ConfirmedRitualAction, type SubmittedRitualAction } from './ritualConfirmation'
import { logFailure, logNote } from '../../utils/diagnostics'
import { landedMessageIsFeeOnlyChange } from './walletFeeChange'
import { isWalletCancellation, isWalletTimeout } from '../../utils/walletErrors'

export type RitualWalletSubmissionTransport = Readonly<{
  signAndSendTransaction: (transaction: Transaction, minContextSlot: number) => Promise<unknown>
  /** Message bytes of a landed transaction by signature (null if not found in time). */
  getLandedTransactionMessage?: (signature: string) => Promise<Uint8Array | null>
}>
export type RitualSubmissionResult = Readonly<{
  signature: string
  messageDigest: string
  actionKind: PreparedRitualAction['kind']
  expectationKind: RitualActionExpectation['kind']
  confirmed: ConfirmedRitualAction
}>
export type RitualSubmissionErrorCategory = 'input' | 'wallet' | 'signature' | 'deployment' | 'network-mismatch'
export class RitualSubmissionError extends Error {
  readonly category: RitualSubmissionErrorCategory
  /**
   * True when a signature returned or a signing response was lost to a timeout.
   * The wallet may have broadcast the transaction, so callers must treat the
   * outcome as unknown (never "nothing was sent") and let recovery check chain.
   */
  readonly submitted: boolean
  /** The wallet-returned signature, when it was canonical; lets recovery look it up. */
  readonly signature: string | undefined
  constructor(category: RitualSubmissionErrorCategory, message: string, submitted = false, signature?: string) { super(message); this.name = 'RitualSubmissionError'; this.category = category; this.submitted = submitted; this.signature = signature }
}
const fail = (category: RitualSubmissionErrorCategory, message: string): never => { throw new RitualSubmissionError(category, message) }
const hex = (bytes: Uint8Array): string => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
const copyKey = (text: string, name: string): PublicKey => { try { const key = new PublicKey(text); if (key.toBase58() !== text || key.equals(PublicKey.default)) fail('input', `${name} is invalid`); return new PublicKey(key.toBytes()) } catch (error) { if (error instanceof RitualSubmissionError) throw error; return fail('input', `${name} is invalid`) } }
const copyExpectation = (value: PreparedExpectation): PreparedExpectation => value.kind === 'bundle' ? Object.freeze({ kind: 'bundle', expectations: Object.freeze(value.expectations.map(copyExpectation)) }) : Object.freeze({ ...value })
function expectation(value: PreparedExpectation): RitualActionExpectation {
  if (value.kind === 'bundle') return Object.freeze({ kind: 'bundle', expectations: Object.freeze(value.expectations.map(expectation)) })
  if (value.kind === 'created') return Object.freeze({ kind: value.kind, creator: copyKey(value.creator, 'creator'), nonce: value.nonce })
  if (value.kind === 'ejected') return Object.freeze({ kind: value.kind, creatorDestination: copyKey(value.creatorDestination, 'creatorDestination'), minimumCreatorBalance: value.minimumCreatorBalance })
  if (value.kind === 'skip-declared') return Object.freeze({ kind: value.kind, eventIndex: value.eventIndex })
  if (value.kind === 'funded') return Object.freeze({ kind: value.kind, member: copyKey(value.member, 'member'), expectedFundedMemberCount: value.expectedFundedMemberCount, expectedFundedStakeTotal: value.expectedFundedStakeTotal, expectedFundedFeeTotal: value.expectedFundedFeeTotal })
  if (value.kind === 'activated' || value.kind === 'cancelled' || value.kind === 'vaults-closed') return Object.freeze({ kind: value.kind })
  if (value.kind === 'event-initialized') return Object.freeze({ kind: value.kind, eventIndex: value.eventIndex })
  if (value.kind === 'claimed') return Object.freeze({ kind: value.kind, claimant: copyKey(value.claimant, 'claimant'), eventIndex: value.eventIndex, expectedClaimStatus: value.expectedClaimStatus })
  if (value.kind === 'approved') return Object.freeze({ kind: value.kind, claimant: copyKey(value.claimant, 'claimant'), approver: copyKey(value.approver, 'approver'), eventIndex: value.eventIndex, expectedApprovalCount: value.expectedApprovalCount, expectedClaimStatus: value.expectedClaimStatus })
  if (value.kind === 'questioned') return Object.freeze({ kind: value.kind, claimant: copyKey(value.claimant, 'claimant'), questioner: copyKey(value.questioner, 'questioner'), eventIndex: value.eventIndex })
  return Object.freeze({ kind: value.kind, eventIndex: value.eventIndex, expectedEventStatus: value.expectedEventStatus, expectedVoidReason: value.expectedVoidReason, expectedRitualStatus: value.expectedRitualStatus, expectedCurrentEventIndex: value.expectedCurrentEventIndex, expectedSettledEventCount: value.expectedSettledEventCount })
}
function walletFailure(error: unknown): never {
  logFailure('wallet.raw', error)
  let mismatch = false
  let rejected = false
  let submitted = false
  try {
    if (error !== null && typeof error === 'object') {
      const name = (error as { name?: unknown }).name
      const code = (error as { code?: unknown }).code
      const userRejected = (error as { userRejected?: unknown }).userRejected
      mismatch = (error as { category?: unknown }).category === 'network-mismatch'
      const marked = (error as { submitted?: unknown }).submitted
      submitted = marked === true || (marked !== false && isWalletTimeout(error))
      rejected = !isWalletTimeout(error) && (userRejected === true || name === 'UserRejectedRequestError' || code === 4001 || isWalletCancellation(error))
    }
  } catch { /* sanitize hostile errors */ }
  if (mismatch) return fail('network-mismatch', 'wallet account does not support the requested network')
  if (submitted) throw new RitualSubmissionError('wallet', 'wallet submission outcome is unknown', true)
  if (rejected) return fail('wallet', 'wallet request was rejected')
  return fail('wallet', 'wallet submission failed')
}

export class SubmittedRitualActionHandle {
  readonly signature: string
  readonly messageDigest: string
  readonly actionKind: PreparedRitualAction['kind']
  readonly expectationKind: RitualActionExpectation['kind']
  readonly ritualAddress: string
  private constructor(metadata: Readonly<SubmittedRitualActionHandle>) {
    this.signature = metadata.signature
    this.messageDigest = metadata.messageDigest
    this.actionKind = metadata.actionKind
    this.expectationKind = metadata.expectationKind
    this.ritualAddress = metadata.ritualAddress
    Object.freeze(this)
  }
  static create(metadata: Readonly<SubmittedRitualActionHandle>): SubmittedRitualActionHandle {
    return new SubmittedRitualActionHandle(metadata)
  }
}

type SubmittedHandleState = {
  readonly submitted: SubmittedRitualAction
  readonly metadata: Readonly<SubmittedRitualActionHandle>
  confirmation?: Promise<RitualSubmissionResult>
}

export class RitualActionSubmitter {
  readonly #preparer: RitualActionPreparer
  readonly #confirmer: RitualConfirmationVerifier
  readonly #wallet: RitualWalletSubmissionTransport['signAndSendTransaction']
  readonly #landedMessage: RitualWalletSubmissionTransport['getLandedTransactionMessage'] | null
  readonly #handles = new WeakMap<SubmittedRitualActionHandle, SubmittedHandleState>()
  constructor(preparer: RitualActionPreparer, confirmer: RitualConfirmationVerifier, wallet: RitualWalletSubmissionTransport) {
    if (!(preparer instanceof RitualActionPreparer)) fail('input', 'Ritual action preparer is invalid')
    try { if (!(confirmer instanceof RitualConfirmationVerifier)) fail('input', 'Ritual confirmation verifier is invalid') } catch (error) { if (error instanceof RitualSubmissionError) throw error; fail('input', 'Ritual confirmation verifier is invalid') }
    if (wallet === null || typeof wallet !== 'object' || Array.isArray(wallet) || typeof wallet.signAndSendTransaction !== 'function') fail('input', 'Ritual wallet transport is invalid')
    this.#preparer = preparer; this.#confirmer = confirmer; this.#wallet = wallet.signAndSendTransaction.bind(wallet)
    this.#landedMessage = typeof wallet.getLandedTransactionMessage === 'function' ? wallet.getLandedTransactionMessage.bind(wallet) : null
  }
  async submitPrepared(prepared: PreparedRitualAction): Promise<SubmittedRitualActionHandle> {
    let walletAction: ReturnType<RitualActionPreparer['getTransactionForWallet']>
    try { walletAction = this.#preparer.getTransactionForWallet(prepared) } catch (error) { if (error instanceof RitualSubmissionError) throw error; throw error }
    const scalar = Object.freeze({ kind: walletAction.kind, blockhash: walletAction.blockhash, lastValidBlockHeight: walletAction.lastValidBlockHeight, submittedContextSlot: walletAction.submittedContextSlot, expectedMessageDigest: walletAction.expectedMessageDigest, ritualAddress: walletAction.ritualAddress, expectation: copyExpectation(walletAction.expectation) })
    this.#preparer.assertWalletTransactionUnchanged(prepared, walletAction.transaction)
    let returned: unknown
    try { returned = await Promise.resolve().then(() => this.#wallet(walletAction.transaction, scalar.submittedContextSlot)) } catch (error) { return walletFailure(error) }
    // From here on the wallet has answered with a signature and may have
    // broadcast. Any failure is post-submission: never report "nothing was sent".
    let returnedSignature: string | undefined
    let signature!: string
    let digest!: string
    try {
      this.#preparer.assertWalletTransactionUnchanged(prepared, walletAction.transaction)
      try { signature = canonicalBase58Signature(returned); returnedSignature = signature } catch { throw new RitualSubmissionError('signature', 'wallet returned an invalid transaction signature', true) }
      const reconstructed = this.#preparer.getTransactionForWallet(prepared)
      this.#preparer.assertWalletTransactionUnchanged(prepared, reconstructed.transaction)
      const message = Uint8Array.from(reconstructed.transaction.serializeMessage())
      digest = hex(sha256(message))
      if (digest !== scalar.expectedMessageDigest) fail('signature', 'prepared message digest changed')
      const compiled = reconstructed.transaction.compileMessage()
      if (compiled.header.numRequiredSignatures !== 1 || compiled.accountKeys.length === 0 || !compiled.accountKeys[0].equals(reconstructed.transaction.feePayer as PublicKey)) fail('signature', 'prepared transaction does not have exactly one fee-payer signer')
      try { reconstructed.transaction.addSignature(compiled.accountKeys[0], Buffer.from(decodeCanonicalBase58Signature(signature))) } catch { return fail('signature', 'wallet signature could not be attached') }
      let verified = false
      try { verified = reconstructed.transaction.verifySignatures(true) === true } catch { verified = false }
      if (!verified) {
        // The wallet signed different bytes. Accept only if what landed is the
        // reviewed transaction with nothing changed but the fee instructions.
        const landed = this.#landedMessage ? await this.#landedMessage(signature).catch(() => null) : null
        if (!landed || !landedMessageIsFeeOnlyChange(this.#preparer.getTransactionForWallet(prepared).transaction, landed, signature)) fail('signature', 'wallet signature does not verify the prepared message')
        logNote('wallet.fee-adjusted', 'wallet changed only the fee instructions; verified against the landed transaction')
      }
    } catch (error) {
      // Keep the original error (and its category, e.g. the preparer's
      // 'mutation') and only mark it as post-submission.
      let marked = false
      if (error !== null && typeof error === 'object') {
        try { Object.defineProperty(error, 'submitted', { value: true, enumerable: true }); Object.defineProperty(error, 'signature', { value: returnedSignature, enumerable: true }); marked = true } catch { /* frozen/hostile: fall back below */ }
      }
      if (marked) throw error
      throw new RitualSubmissionError('signature', 'wallet result could not be verified', true, returnedSignature)
    }
    const ritualAddress = copyKey(scalar.ritualAddress, 'ritualAddress').toBase58()
    const submitted: SubmittedRitualAction = Object.freeze({ signature, blockhash: scalar.blockhash, lastValidBlockHeight: scalar.lastValidBlockHeight, submittedContextSlot: scalar.submittedContextSlot, ritualAddress: new PublicKey(ritualAddress), expectation: expectation(scalar.expectation) })
    const metadata = SubmittedRitualActionHandle.create(Object.freeze({ signature, messageDigest: digest, actionKind: scalar.kind, expectationKind: submitted.expectation.kind, ritualAddress }))
    this.#handles.set(metadata, { submitted, metadata })
    return metadata
  }
  confirmSubmitted(handle: SubmittedRitualActionHandle): Promise<RitualSubmissionResult> {
    const state = this.#handles.get(handle)
    if (!state) return Promise.reject(new RitualSubmissionError('input', 'Submitted Ritual action handle is invalid'))
    if (!state.confirmation) {
      state.confirmation = Promise.resolve()
        .then(() => this.#confirmer.confirmAndReadRitual(state.submitted))
        .then(confirmed => Object.freeze({ ...state.metadata, confirmed }))
    }
    return state.confirmation
  }
  async submitAndConfirm(prepared: PreparedRitualAction): Promise<RitualSubmissionResult> {
    return this.confirmSubmitted(await this.submitPrepared(prepared))
  }
}

export function createCurrentRitualActionSubmitter(_preparer: RitualActionPreparer, _confirmer: RitualConfirmationVerifier, _wallet: RitualWalletSubmissionTransport): never {
  void _preparer; void _confirmer; void _wallet
  const config: { deployment: string; programId: unknown } = RITUALS_CURRENT_CONFIG
  if (config.deployment !== 'deployed' || config.programId === null) return fail('deployment', 'No authorized Rituals deployment is configured')
  return fail('deployment', 'Current Ritual action submitter is unavailable')
}
export const createRitualActionSubmitter = (preparer: RitualActionPreparer, confirmer: RitualConfirmationVerifier, wallet: RitualWalletSubmissionTransport): RitualActionSubmitter => new RitualActionSubmitter(preparer, confirmer, wallet)
