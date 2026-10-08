/**
 * Create orchestrator.
 *
 * Drives the Create state machine against injected client operations. Kept
 * separate from React so the whole transaction journey is testable without a
 * renderer, a wallet, or a deployed program.
 *
 * Error classification is the important part: it decides whether the UI is
 * allowed to offer a retry. Anything that fails AFTER the transaction reaches
 * the network is reported as 'confirmation', which the machine treats as
 * non-retryable — the transaction may already have landed.
 */

import type {
  CreateConfirmedRef,
  CreateFailureCategory,
  CreateMachineEvent,
  CreatePreparedRef,
  CreateSubmittedRef,
} from './createMachine'
import { logFailure } from '../../../utils/diagnostics'
import type { ActionReconciler } from '../recovery/reconcilePendingAction'

export type CreateRitualDeps = Readonly<{
  prepare: () => Promise<CreatePreparedRef>
  submit: (prepared: CreatePreparedRef) => Promise<CreateSubmittedRef>
  confirm: (handle: CreateSubmittedRef) => Promise<CreateConfirmedRef>
  reconcile?: ActionReconciler
}>

export type CreateRitualOutcome =
  | Readonly<{ ok: true; result: CreateConfirmedRef }>
  | Readonly<{ ok: false; category: CreateFailureCategory }>

type Dispatch = (event: CreateMachineEvent) => void

const REJECTION_PATTERNS = [
  'user rejected',
  'user declined',
  'declined by user',
  'rejected the request',
  'request rejected',
  'wallet request was rejected',
  'wallet authorization was rejected',
  'cancelled by user',
  'canceled by user',
  'user cancelled',
  'user canceled',
]

function isUserRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return REJECTION_PATTERNS.some((pattern) => message.includes(pattern))
}

/**
 * Safe, user-facing failure text.
 *
 * Raw errors can carry RPC endpoints, keys, or transaction internals, so they
 * never reach the UI. The full error stays available to the caller's logging.
 */
const SAFE_MESSAGES: Record<CreateFailureCategory, string> = {
  preparation: 'Could not prepare the ritual. Nothing was sent.',
  'wallet-rejected': 'The request was declined in your wallet. Nothing was sent.',
  'wallet-unavailable': 'No wallet was available to approve the request.',
  'network-mismatch': 'Nothing was sent. Switch your wallet to Devnet, then try again.',
  'blockhash-expired': 'The prepared transaction expired before wallet approval. Nothing was sent; prepare again.',
  submission: 'Could not send the transaction to the network. Nothing was sent; you can try again.',
  confirmation: 'The transaction was sent but could not be confirmed.',
}

export async function runCreateRitual(
  deps: CreateRitualDeps,
  dispatch: Dispatch,
): Promise<CreateRitualOutcome> {
  const failWith = (category: CreateFailureCategory): CreateRitualOutcome => {
    dispatch({ type: 'FAILED', category, message: SAFE_MESSAGES[category] })
    return { ok: false, category }
  }

  dispatch({ type: 'PREPARE' })

  let prepared: CreatePreparedRef
  try {
    prepared = await deps.prepare()
  } catch (error) {
    logFailure('create.prepare', error)
    return failWith('preparation')
  }
  dispatch({ type: 'PREPARED', prepared })

  let handle: CreateSubmittedRef
  try {
    handle = await deps.submit(prepared)
  } catch (error) {
    logFailure('create.submit', error)
    // A wallet-returned signature followed by a local persistence failure is
    // indistinguishable from any other post-submission uncertainty.
    if (error !== null && typeof error === 'object' && (error as { submitted?: unknown }).submitted === true) return failWith('confirmation')
    if (error !== null && typeof error === 'object' && (error as { category?: unknown }).category === 'network-mismatch') return failWith('network-mismatch')
    if (error !== null && typeof error === 'object' && (error as { blockhashExpired?: unknown }).blockhashExpired === true) return failWith('blockhash-expired')
    // A rejection is a normal user choice, not a fault; both are pre-network so
    // both stay retryable.
    return failWith(isUserRejection(error) ? 'wallet-rejected' : 'submission')
  }
  dispatch({ type: 'SUBMITTED', handle })

  dispatch({ type: 'CONFIRMING' })
  let result: CreateConfirmedRef
  try {
    result = await deps.confirm(handle)
  } catch (error) {
    logFailure('create.confirm', error)
    // Past this point the transaction may already be on-chain. Never retryable.
    return failWith('confirmation')
  }

  dispatch({ type: 'CONFIRMED', result })
  return { ok: true, result }
}
