import type { LifecycleEvent, LifecycleFailureCategory, LifecyclePreparedRef, LifecycleSubmittedRef, LifecycleConfirmedRef } from './lifecycleMachine'

export type LifecycleActionDeps = Readonly<{
  prepare: () => Promise<LifecyclePreparedRef>
  submit: (prepared: LifecyclePreparedRef) => Promise<LifecycleSubmittedRef>
  confirm: (handle: LifecycleSubmittedRef) => Promise<LifecycleConfirmedRef>
}>
export type LifecycleOutcome = Readonly<{ ok: true; result: LifecycleConfirmedRef }> | Readonly<{ ok: false; category: LifecycleFailureCategory }>
type Dispatch = (event: LifecycleEvent) => void
const rejection = ['user rejected', 'user declined', 'declined by user', 'rejected the request', 'request rejected', 'cancelled by user', 'canceled by user']
const messageFor: Record<LifecycleFailureCategory, string> = {
  preparation: 'Could not prepare the action. Nothing was sent. Check your connection and try again.',
  'wallet-rejected': 'The request was declined in your wallet. Nothing was sent.',
  'wallet-unavailable': 'No wallet was available to approve the request.',
  'blockhash-expired': 'The prepared transaction expired before wallet approval. Nothing was sent; prepare again.',
  submission: 'Could not send the transaction to the network. Nothing was sent; you can try again.',
  confirmation: 'The transaction was sent but could not be confirmed.',
}
const isRejection = (error: unknown): boolean => rejection.some((value) => (error instanceof Error ? error.message : String(error)).toLowerCase().includes(value))

export async function runLifecycleAction(deps: LifecycleActionDeps, dispatch: Dispatch): Promise<LifecycleOutcome> {
  const fail = (category: LifecycleFailureCategory): LifecycleOutcome => { dispatch({ type: 'FAILED', category, message: messageFor[category] }); return { ok: false, category } }
  dispatch({ type: 'PREPARE' })
  let prepared: LifecyclePreparedRef
  try { prepared = await deps.prepare() } catch { return fail('preparation') }
  dispatch({ type: 'PREPARED', prepared })
  let handle: LifecycleSubmittedRef
  try { handle = await deps.submit(prepared) } catch (error) {
    if (error !== null && typeof error === 'object' && (error as { submitted?: unknown }).submitted === true) return fail('confirmation')
    if (error !== null && typeof error === 'object' && (error as { blockhashExpired?: unknown }).blockhashExpired === true) return fail('blockhash-expired')
    return fail(isRejection(error) ? 'wallet-rejected' : 'submission')
  }
  dispatch({ type: 'SUBMITTED', handle })
  dispatch({ type: 'CONFIRMING' })
  try {
    const result = await deps.confirm(handle)
    dispatch({ type: 'CONFIRMED', result })
    return { ok: true, result }
  } catch { return fail('confirmation') }
}
