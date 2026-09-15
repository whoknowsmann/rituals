import { sha256 } from '@noble/hashes/sha256'
import { Buffer } from 'buffer'
import { PublicKey, Transaction } from '@solana/web3.js'
import { RITUALS_CURRENT_CONFIG } from './programIds'
import { canonicalBase58Signature, decodeCanonicalBase58Signature } from './base58Signature'
import { RitualActionPreparer, type PreparedExpectation, type PreparedRitualAction } from './ritualPreparedAction'
import { RitualConfirmationVerifier, type RitualActionExpectation, type ConfirmedRitualAction, type SubmittedRitualAction } from './ritualConfirmation'

export type RitualWalletSubmissionTransport = Readonly<{
  signAndSendTransaction: (transaction: Transaction, minContextSlot: number) => Promise<unknown>
}>
export type RitualSubmissionResult = Readonly<{
  signature: string
  messageDigest: string
  actionKind: PreparedRitualAction['kind']
  expectationKind: RitualActionExpectation['kind']
  confirmed: ConfirmedRitualAction
}>
export type RitualSubmissionErrorCategory = 'input' | 'wallet' | 'signature' | 'deployment'
export class RitualSubmissionError extends Error {
  readonly category: RitualSubmissionErrorCategory
  constructor(category: RitualSubmissionErrorCategory, message: string) { super(message); this.name = 'RitualSubmissionError'; this.category = category }
}
const fail = (category: RitualSubmissionErrorCategory, message: string): never => { throw new RitualSubmissionError(category, message) }
const hex = (bytes: Uint8Array): string => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
const copyKey = (text: string, name: string): PublicKey => { try { const key = new PublicKey(text); if (key.toBase58() !== text || key.equals(PublicKey.default)) fail('input', `${name} is invalid`); return new PublicKey(key.toBytes()) } catch (error) { if (error instanceof RitualSubmissionError) throw error; return fail('input', `${name} is invalid`) } }
const copyExpectation = (value: PreparedExpectation): PreparedExpectation => Object.freeze({ ...value })
function expectation(value: PreparedExpectation): RitualActionExpectation {
  if (value.kind === 'created') return Object.freeze({ kind: value.kind, creator: copyKey(value.creator, 'creator'), nonce: value.nonce })
  if (value.kind === 'funded') return Object.freeze({ kind: value.kind, member: copyKey(value.member, 'member'), expectedFundedMemberCount: value.expectedFundedMemberCount, expectedFundedStakeTotal: value.expectedFundedStakeTotal, expectedFundedFeeTotal: value.expectedFundedFeeTotal })
  if (value.kind === 'activated' || value.kind === 'cancelled' || value.kind === 'vaults-closed') return Object.freeze({ kind: value.kind })
  if (value.kind === 'event-initialized') return Object.freeze({ kind: value.kind, eventIndex: value.eventIndex })
  if (value.kind === 'claimed') return Object.freeze({ kind: value.kind, claimant: copyKey(value.claimant, 'claimant'), eventIndex: value.eventIndex, expectedClaimStatus: value.expectedClaimStatus })
  if (value.kind === 'approved') return Object.freeze({ kind: value.kind, claimant: copyKey(value.claimant, 'claimant'), approver: copyKey(value.approver, 'approver'), eventIndex: value.eventIndex, expectedApprovalCount: value.expectedApprovalCount, expectedClaimStatus: value.expectedClaimStatus })
  if (value.kind === 'questioned') return Object.freeze({ kind: value.kind, claimant: copyKey(value.claimant, 'claimant'), questioner: copyKey(value.questioner, 'questioner'), eventIndex: value.eventIndex })
  return Object.freeze({ kind: value.kind, eventIndex: value.eventIndex, expectedEventStatus: value.expectedEventStatus, expectedVoidReason: value.expectedVoidReason, expectedRitualStatus: value.expectedRitualStatus, expectedCurrentEventIndex: value.expectedCurrentEventIndex, expectedSettledEventCount: value.expectedSettledEventCount })
}
function walletFailure(error: unknown): never {
  try {
    if (error !== null && typeof error === 'object') {
      const name = (error as { name?: unknown }).name
      const code = (error as { code?: unknown }).code
      if (name === 'WalletSignAndSendTransactionError' || name === 'UserRejectedRequestError' || code === 4001) return fail('wallet', 'wallet request was rejected')
    }
  } catch { /* sanitize hostile errors */ }
  return fail('wallet', 'wallet submission failed')
}

export class RitualActionSubmitter {
  readonly #preparer: RitualActionPreparer
  readonly #confirmer: RitualConfirmationVerifier
  readonly #wallet: RitualWalletSubmissionTransport['signAndSendTransaction']
  constructor(preparer: RitualActionPreparer, confirmer: RitualConfirmationVerifier, wallet: RitualWalletSubmissionTransport) {
    if (!(preparer instanceof RitualActionPreparer)) fail('input', 'Ritual action preparer is invalid')
    try { if (!(confirmer instanceof RitualConfirmationVerifier)) fail('input', 'Ritual confirmation verifier is invalid') } catch (error) { if (error instanceof RitualSubmissionError) throw error; fail('input', 'Ritual confirmation verifier is invalid') }
    if (wallet === null || typeof wallet !== 'object' || Array.isArray(wallet) || typeof wallet.signAndSendTransaction !== 'function') fail('input', 'Ritual wallet transport is invalid')
    this.#preparer = preparer; this.#confirmer = confirmer; this.#wallet = wallet.signAndSendTransaction.bind(wallet)
  }
  async submitAndConfirm(prepared: PreparedRitualAction): Promise<RitualSubmissionResult> {
    let walletAction: ReturnType<RitualActionPreparer['getTransactionForWallet']>
    try { walletAction = this.#preparer.getTransactionForWallet(prepared) } catch (error) { if (error instanceof RitualSubmissionError) throw error; throw error }
    const scalar = Object.freeze({ kind: walletAction.kind, blockhash: walletAction.blockhash, lastValidBlockHeight: walletAction.lastValidBlockHeight, submittedContextSlot: walletAction.submittedContextSlot, expectedMessageDigest: walletAction.expectedMessageDigest, ritualAddress: walletAction.ritualAddress, expectation: copyExpectation(walletAction.expectation) })
    this.#preparer.assertWalletTransactionUnchanged(prepared, walletAction.transaction)
    let returned: unknown
    try { returned = await Promise.resolve().then(() => this.#wallet(walletAction.transaction, scalar.submittedContextSlot)) } catch (error) { return walletFailure(error) }
    this.#preparer.assertWalletTransactionUnchanged(prepared, walletAction.transaction)
    let signature: string
    try { signature = canonicalBase58Signature(returned) } catch { return fail('signature', 'wallet returned an invalid transaction signature') }
    const reconstructed = this.#preparer.getTransactionForWallet(prepared)
    this.#preparer.assertWalletTransactionUnchanged(prepared, reconstructed.transaction)
    const message = Uint8Array.from(reconstructed.transaction.serializeMessage())
    const digest = hex(sha256(message))
    if (digest !== scalar.expectedMessageDigest) fail('signature', 'prepared message digest changed')
    const compiled = reconstructed.transaction.compileMessage()
    if (compiled.header.numRequiredSignatures !== 1 || compiled.accountKeys.length === 0 || !compiled.accountKeys[0].equals(reconstructed.transaction.feePayer as PublicKey)) fail('signature', 'prepared transaction does not have exactly one fee-payer signer')
    try { reconstructed.transaction.addSignature(compiled.accountKeys[0], Buffer.from(decodeCanonicalBase58Signature(signature))) } catch { return fail('signature', 'wallet signature could not be attached') }
    try { if (reconstructed.transaction.verifySignatures(true) !== true) fail('signature', 'wallet signature does not verify the prepared message') } catch (error) { if (error instanceof RitualSubmissionError) throw error; return fail('signature', 'wallet signature does not verify the prepared message') }
    const submitted: SubmittedRitualAction = Object.freeze({ signature, blockhash: scalar.blockhash, lastValidBlockHeight: scalar.lastValidBlockHeight, submittedContextSlot: scalar.submittedContextSlot, ritualAddress: copyKey(scalar.ritualAddress, 'ritualAddress'), expectation: expectation(scalar.expectation) })
    let confirmed: ConfirmedRitualAction
    try { confirmed = await this.#confirmer.confirmAndReadRitual(submitted) } catch (error) { throw error }
    return Object.freeze({ signature, messageDigest: digest, actionKind: scalar.kind, expectationKind: submitted.expectation.kind, confirmed })
  }
}

export function createCurrentRitualActionSubmitter(_preparer: RitualActionPreparer, _confirmer: RitualConfirmationVerifier, _wallet: RitualWalletSubmissionTransport): never {
  void _preparer; void _confirmer; void _wallet
  const config: { deployment: string; programId: unknown } = RITUALS_CURRENT_CONFIG
  if (config.deployment !== 'deployed' || config.programId === null) return fail('deployment', 'No authorized Rituals deployment is configured')
  return fail('deployment', 'Current Ritual action submitter is unavailable')
}
export const createRitualActionSubmitter = (preparer: RitualActionPreparer, confirmer: RitualConfirmationVerifier, wallet: RitualWalletSubmissionTransport): RitualActionSubmitter => new RitualActionSubmitter(preparer, confirmer, wallet)
