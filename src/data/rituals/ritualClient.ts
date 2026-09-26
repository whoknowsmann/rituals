import { PublicKey } from '@solana/web3.js'
import { RITUALS_CURRENT_CONFIG } from './programIds'
import { RitualsRpcReader, type ReadOptions, type RitualRead, type RitualBundleRead, type RitualRpcTransport } from './ritualsRpc'
import type { ProtocolConfigAccountView } from './accounts'
import { RitualActionPreparer, type BuildCreateAndFundArgs, type BuildFundAndActivateArgs, type BuildInitializeAndClaimArgs, type PreparedRitualAction, type RitualPreparationTransport } from './ritualPreparedAction'
import { RitualConfirmationVerifier, type RitualConfirmationTransport } from './ritualConfirmation'
import { RitualActionSubmitter, type RitualWalletSubmissionTransport, type RitualSubmissionResult, type SubmittedRitualActionHandle } from './ritualSubmission'
import type { BuildCreateRitualArgs, BuildFundMemberArgs, BuildActivateRitualArgs, BuildCancelUnactivatedArgs } from './instructionsLifecycle'
import type { BuildCloseTerminalVaultsArgs, BuildInitializeCurrentEventArgs, BuildClaimCompletionArgs, BuildApproveClaimArgs, BuildQuestionClaimArgs, BuildFinalizeEventArgs } from './instructionsEvents'

export type { SubmittedRitualActionHandle } from './ritualSubmission'

/**
 * Application boundary for Ritual reads, preparation, signing, and authoritative confirmation.
 * Low-level reader/preparer/confirmation/submission modules are internal/test tooling.
 * This facade does not defend against arbitrary modified app code; on-chain custody remains
 * the security authority and the real wallet is still responsible for user authorization.
 */
export interface RitualClient {
  /** Authorized program identity used by the prepared-action boundary. */
  readonly programId: PublicKey
  /** Authoritative protocol configuration: the only valid source of stake mint and fee recipient. */
  getProtocolConfig(options?: ReadOptions): Promise<Readonly<{ slot: number; address: PublicKey; account: ProtocolConfigAccountView }>>
  readRitual(address: PublicKey, options?: ReadOptions): Promise<RitualRead>
  getRitualBundle(address: PublicKey, options?: ReadOptions): Promise<RitualBundleRead>
  getEventBundle(address: PublicKey, eventIndex: number, options?: ReadOptions): Promise<RitualBundleRead>
  prepareCreate(args: BuildCreateRitualArgs): Promise<PreparedRitualAction>
  prepareCreateAndFund(args: BuildCreateAndFundArgs): Promise<PreparedRitualAction>
  prepareFund(args: BuildFundMemberArgs): Promise<PreparedRitualAction>
  prepareFundAndActivate(args: BuildFundAndActivateArgs): Promise<PreparedRitualAction>
  prepareActivate(args: BuildActivateRitualArgs & Readonly<{ feePayer: PublicKey }>): Promise<PreparedRitualAction>
  prepareCancel(args: BuildCancelUnactivatedArgs): Promise<PreparedRitualAction>
  prepareClose(args: BuildCloseTerminalVaultsArgs & Readonly<{ feePayer: PublicKey }>): Promise<PreparedRitualAction>
  prepareInitializeEvent(args: BuildInitializeCurrentEventArgs): Promise<PreparedRitualAction>
  prepareInitializeAndClaim(args: BuildInitializeAndClaimArgs): Promise<PreparedRitualAction>
  prepareClaim(args: BuildClaimCompletionArgs): Promise<PreparedRitualAction>
  prepareApprove(args: BuildApproveClaimArgs): Promise<PreparedRitualAction>
  prepareQuestion(args: BuildQuestionClaimArgs): Promise<PreparedRitualAction>
  prepareFinalize(args: BuildFinalizeEventArgs & Readonly<{ feePayer: PublicKey }>): Promise<PreparedRitualAction>
  submitPrepared(prepared: PreparedRitualAction): Promise<SubmittedRitualActionHandle>
  confirmSubmitted(handle: SubmittedRitualActionHandle): Promise<RitualSubmissionResult>
  submitAndConfirm(prepared: PreparedRitualAction): Promise<RitualSubmissionResult>
}

export type RitualClientTransport = RitualRpcTransport & RitualPreparationTransport & RitualConfirmationTransport

function makeClient(rpc: RitualClientTransport, wallet: RitualWalletSubmissionTransport, programId: PublicKey): RitualClient {
  const reader = new RitualsRpcReader(rpc, programId)
  const preparer = new RitualActionPreparer(rpc, programId)
  const confirmer = new RitualConfirmationVerifier(reader, rpc)
  const submitter = new RitualActionSubmitter(preparer, confirmer, wallet)
  const client = Object.create(null) as RitualClient
  const methods: Partial<Record<keyof RitualClient, (...args: any[]) => unknown>> = {
    getProtocolConfig: reader.getProtocolConfig.bind(reader),
    readRitual: reader.getRitual.bind(reader),
    getRitualBundle: reader.getRitualBundle.bind(reader),
    getEventBundle: reader.getEventBundle.bind(reader),
    prepareCreate: preparer.prepareCreate.bind(preparer),
    prepareCreateAndFund: preparer.prepareCreateAndFund.bind(preparer),
    prepareFund: preparer.prepareFund.bind(preparer),
    prepareFundAndActivate: preparer.prepareFundAndActivate.bind(preparer),
    prepareActivate: preparer.prepareActivate.bind(preparer),
    prepareCancel: preparer.prepareCancel.bind(preparer),
    prepareClose: preparer.prepareClose.bind(preparer),
    prepareInitializeEvent: preparer.prepareInitializeEvent.bind(preparer),
    prepareInitializeAndClaim: preparer.prepareInitializeAndClaim.bind(preparer),
    prepareClaim: preparer.prepareClaim.bind(preparer),
    prepareApprove: preparer.prepareApprove.bind(preparer),
    prepareQuestion: preparer.prepareQuestion.bind(preparer),
    prepareFinalize: preparer.prepareFinalize.bind(preparer),
    submitPrepared: submitter.submitPrepared.bind(submitter),
    confirmSubmitted: submitter.confirmSubmitted.bind(submitter),
    submitAndConfirm: submitter.submitAndConfirm.bind(submitter),
  }
  for (const [name, method] of Object.entries(methods)) Object.defineProperty(client, name, { value: method, enumerable: false, writable: false, configurable: false })
  Object.defineProperty(client, 'programId', { value: new PublicKey(programId.toBytes()), enumerable: false, writable: false, configurable: false })
  return Object.freeze(client)
}

/** Compose genuine internal Ritual components for deterministic local/fake transports. */
export function createLocalTestRitualClient(rpcTransport: RitualClientTransport, walletTransport: RitualWalletSubmissionTransport, programId: PublicKey): RitualClient {
  return makeClient(rpcTransport, walletTransport, programId)
}

/** Current deployment entry point; deployment is checked before touching dependencies. */
export function createCurrentRitualClient(rpcTransport: RitualClientTransport, walletTransport: RitualWalletSubmissionTransport): RitualClient {
  const config: { deployment: string; programId: unknown } = RITUALS_CURRENT_CONFIG
  if (config.deployment !== 'deployed' || !(config.programId instanceof PublicKey)) throw new Error('No authorized Rituals deployment is configured')
  return makeClient(rpcTransport, walletTransport, config.programId)
}
