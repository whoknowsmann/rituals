export type LifecycleActionKind = 'fund' | 'activate' | 'initialize-event' | 'claim' | 'approve' | 'question' | 'finalize' | 'eject'
export type LifecyclePreparedRef = Readonly<{ kind: LifecycleActionKind; messageDigest: string; ritualAddress: string }>
export type LifecycleSubmittedRef = Readonly<{ id: string }>
export type LifecycleConfirmedRef = Readonly<{ signature: string; messageDigest: string }>
export type LifecycleFailureCategory = 'preparation' | 'wallet-rejected' | 'wallet-unavailable' | 'network-mismatch' | 'blockhash-expired' | 'submission' | 'confirmation'

export type LifecycleState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'preparing' }>
  | Readonly<{ status: 'awaiting-wallet'; prepared: LifecyclePreparedRef; ritualAddress: string }>
  | Readonly<{ status: 'submitted'; prepared: LifecyclePreparedRef; handle: LifecycleSubmittedRef; ritualAddress: string }>
  | Readonly<{ status: 'confirming'; prepared: LifecyclePreparedRef; handle: LifecycleSubmittedRef; ritualAddress: string }>
  | Readonly<{ status: 'confirmed'; result: LifecycleConfirmedRef; ritualAddress: string }>
  | Readonly<{ status: 'error'; category: LifecycleFailureCategory; message: string; submitted: boolean; retryable: boolean; ritualAddress: string | null }>

export type LifecycleEvent =
  | Readonly<{ type: 'PREPARE' }>
  | Readonly<{ type: 'PREPARED'; prepared: LifecyclePreparedRef }>
  | Readonly<{ type: 'SUBMITTED'; handle: LifecycleSubmittedRef }>
  | Readonly<{ type: 'CONFIRMING' }>
  | Readonly<{ type: 'CONFIRMED'; result: LifecycleConfirmedRef }>
  | Readonly<{ type: 'FAILED'; category: LifecycleFailureCategory; message: string }>
  | Readonly<{ type: 'RESET' }>
  | Readonly<{ type: 'READBACK_OBSERVED'; ritualAddress: string }>

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value)
export const lifecycleInitialState = (): LifecycleState => freeze({ status: 'idle' as const })
export const lifecycleCanSubmit = (state: LifecycleState): boolean => state.status === 'idle' || (state.status === 'error' && state.retryable)
export const lifecycleIsBusy = (state: LifecycleState): boolean => !lifecycleCanSubmit(state) && state.status !== 'confirmed' && state.status !== 'error'
const addressOf = (state: LifecycleState): string | null => state.status === 'awaiting-wallet' || state.status === 'submitted' || state.status === 'confirming' || state.status === 'confirmed' || state.status === 'error' ? state.ritualAddress : null

export function lifecycleReducer(state: LifecycleState, event: LifecycleEvent): LifecycleState {
  // Only the action-specific authoritative reader may clear an unknown result.
  if (event.type === 'READBACK_OBSERVED') return state.status === 'error' && !state.retryable && state.ritualAddress === event.ritualAddress ? lifecycleInitialState() : state
  if (event.type === 'FAILED') {
    if (state.status === 'idle' || state.status === 'confirmed' || state.status === 'error') return state
    const submitted = state.status === 'submitted' || state.status === 'confirming'
    return freeze({ status: 'error' as const, category: event.category, message: event.message, submitted, retryable: !submitted && event.category !== 'confirmation', ritualAddress: addressOf(state) })
  }
  switch (state.status) {
    case 'idle': return event.type === 'PREPARE' ? freeze({ status: 'preparing' as const }) : state
    case 'preparing': return event.type === 'PREPARED' ? freeze({ status: 'awaiting-wallet' as const, prepared: event.prepared, ritualAddress: event.prepared.ritualAddress }) : state
    case 'awaiting-wallet': return event.type === 'SUBMITTED' ? freeze({ status: 'submitted' as const, prepared: state.prepared, handle: event.handle, ritualAddress: state.ritualAddress }) : state
    case 'submitted': return event.type === 'CONFIRMING' ? freeze({ status: 'confirming' as const, prepared: state.prepared, handle: state.handle, ritualAddress: state.ritualAddress }) : state
    case 'confirming': return event.type === 'CONFIRMED' ? freeze({ status: 'confirmed' as const, result: event.result, ritualAddress: state.ritualAddress }) : state
    // A retry may start straight from a retryable error (lifecycleCanSubmit allows it), so PREPARE must advance too.
    case 'error': return state.retryable && event.type === 'RESET' ? lifecycleInitialState() : state.retryable && event.type === 'PREPARE' ? freeze({ status: 'preparing' as const }) : state
    // Only an explicit RESET clears a confirmed step (a multi-step action on one screen); nothing resubmits it.
    case 'confirmed': return event.type === 'RESET' ? lifecycleInitialState() : state
  }
}

export function lifecycleStatusCopy(state: LifecycleState): Readonly<{ title: string; body: string; tone: 'neutral' | 'progress' | 'success' | 'warning' }> {
  if (state.status === 'idle') return { title: 'Ready', body: 'One approval in your wallet.', tone: 'neutral' }
  if (state.status === 'preparing') return { title: 'Getting it ready', body: 'A moment.', tone: 'progress' }
  if (state.status === 'awaiting-wallet') return { title: 'Approve in your wallet', body: 'Nothing is sent until you approve.', tone: 'progress' }
  if (state.status === 'submitted' || state.status === 'confirming') return { title: 'Confirming', body: 'Sent. Checking it landed.', tone: 'progress' }
  if (state.status === 'confirmed') return { title: 'Done', body: 'Confirmed on chain.', tone: 'success' }
  if (state.submitted || state.category === 'confirmation') return { title: 'Confirmation incomplete', body: 'Your transaction may already have gone through. Do not retry — check the ritual before acting again.', tone: 'warning' }
  if (state.category === 'wallet-rejected') return { title: 'Not sent', body: 'Nothing was sent. Try again.', tone: 'neutral' }
  if (state.category === 'network-mismatch') return { title: 'Switch to Devnet', body: 'Nothing was sent. Switch your wallet to Devnet, then try again.', tone: 'neutral' }
  return { title: 'Could not continue', body: 'Nothing was sent to the network. You can safely try again.', tone: 'warning' }
}
