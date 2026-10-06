/**
 * Create transaction state machine.
 *
 * Models the visible Create journey: review -> wallet -> submitted -> confirming
 * -> confirmed/error. Pure and synchronous — it performs no RPC, signing, or
 * submission. The caller drives it with events as the real client progresses.
 *
 * Two safety properties matter more than anything else here:
 *
 *   1. The UI must never claim a ritual exists before AUTHORITATIVE confirmation.
 *      A wallet returning a signature only proves the transaction was accepted
 *      for processing, not that it landed or succeeded.
 *
 *   2. Once a transaction has been submitted, a failure is NOT retryable. The
 *      transaction may already be on-chain, and blindly resubmitting could
 *      create a second ritual and lock a second stake. These states deliberately
 *      dead-end and tell the user to check before acting again.
 */

export type CreatePreparedRef = Readonly<{
  kind: 'create'
  messageDigest: string
  ritualAddress: string
}>

export type CreateSubmittedRef = Readonly<{ id: string }>

export type CreateConfirmedRef = Readonly<{
  signature: string
  messageDigest: string
  /** Present only after authoritative Create readback produced a digest-bound invite. */
  invite?: string
}>

export type CreateFailureCategory =
  | 'preparation'
  | 'wallet-rejected'
  | 'wallet-unavailable'
  | 'blockhash-expired'
  | 'submission'
  | 'confirmation'

export type CreateMachineState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'preparing' }>
  | Readonly<{ status: 'awaiting-wallet'; prepared: CreatePreparedRef; ritualAddress: string }>
  | Readonly<{ status: 'submitted'; prepared: CreatePreparedRef; handle: CreateSubmittedRef; ritualAddress: string }>
  | Readonly<{ status: 'confirming'; prepared: CreatePreparedRef; handle: CreateSubmittedRef; ritualAddress: string }>
  | Readonly<{ status: 'confirmed'; result: CreateConfirmedRef; ritualAddress: string }>
  | Readonly<{ status: 'recovered'; ritualAddress: string }>
  | Readonly<{
      status: 'error'
      category: CreateFailureCategory
      message: string
      /** True once a transaction reached the network; retrying is then unsafe. */
      submitted: boolean
      retryable: boolean
      ritualAddress: string | null
    }>

export type CreateMachineEvent =
  | Readonly<{ type: 'PREPARE' }>
  | Readonly<{ type: 'PREPARED'; prepared: CreatePreparedRef }>
  | Readonly<{ type: 'SUBMITTED'; handle: CreateSubmittedRef }>
  | Readonly<{ type: 'CONFIRMING' }>
  | Readonly<{ type: 'CONFIRMED'; result: CreateConfirmedRef }>
  | Readonly<{ type: 'FAILED'; category: CreateFailureCategory; message: string }>
  | Readonly<{ type: 'RESET' }>
  | Readonly<{ type: 'READBACK_OBSERVED'; ritualAddress: string }>

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value)

export function createMachineInitialState(): CreateMachineState {
  return freeze({ status: 'idle' as const })
}

/** True only where starting a fresh Create attempt is safe. */
export function canSubmitCreate(state: CreateMachineState): boolean {
  if (state.status === 'idle') return true
  if (state.status === 'error') return state.retryable
  return false
}

export function isTerminalCreateState(state: CreateMachineState): boolean {
  if (state.status === 'confirmed' || state.status === 'recovered') return true
  return state.status === 'error' && !state.retryable
}

const inFlightAddress = (state: CreateMachineState): string | null => {
  switch (state.status) {
    case 'awaiting-wallet':
    case 'submitted':
    case 'confirming':
    case 'confirmed':
      return state.ritualAddress
    case 'error':
      return state.ritualAddress
    default:
      return null
  }
}

/**
 * A failure is retryable only if no transaction reached the network. After
 * submission the outcome is unknown, so the machine refuses to offer a retry.
 */
function failureState(
  state: CreateMachineState,
  category: CreateFailureCategory,
  message: string,
): CreateMachineState {
  const submitted = state.status === 'submitted' || state.status === 'confirming'
  return freeze({
    status: 'error' as const,
    category,
    message,
    submitted,
    retryable: !submitted && category !== 'confirmation',
    ritualAddress: inFlightAddress(state),
  })
}

export function createMachineReducer(
  state: CreateMachineState,
  event: CreateMachineEvent,
): CreateMachineState {
  if (event === null || typeof event !== 'object' || typeof event.type !== 'string') return state
  // Recover the existing ritual, never reset Create to an enabled submit button.
  if (event.type === 'READBACK_OBSERVED') return state.status === 'error' && !state.retryable && state.ritualAddress === event.ritualAddress
    ? freeze({ status: 'recovered' as const, ritualAddress: event.ritualAddress }) : state

  // A failure can arrive in any active phase.
  if (event.type === 'FAILED') {
    if (state.status === 'idle' || state.status === 'confirmed' || state.status === 'recovered' || state.status === 'error') return state
    return failureState(state, event.category, event.message)
  }

  switch (state.status) {
    case 'idle':
      return event.type === 'PREPARE' ? freeze({ status: 'preparing' as const }) : state

    case 'preparing':
      return event.type === 'PREPARED'
        ? freeze({
            status: 'awaiting-wallet' as const,
            prepared: event.prepared,
            ritualAddress: event.prepared.ritualAddress,
          })
        : state

    case 'awaiting-wallet':
      return event.type === 'SUBMITTED'
        ? freeze({
            status: 'submitted' as const,
            prepared: state.prepared,
            handle: event.handle,
            ritualAddress: state.ritualAddress,
          })
        : state

    case 'submitted':
      return event.type === 'CONFIRMING'
        ? freeze({
            status: 'confirming' as const,
            prepared: state.prepared,
            handle: state.handle,
            ritualAddress: state.ritualAddress,
          })
        : state

    case 'confirming':
      return event.type === 'CONFIRMED'
        ? freeze({
            status: 'confirmed' as const,
            result: event.result,
            ritualAddress: state.ritualAddress,
          })
        : state

    case 'error':
      // Only a retryable error may be reset; post-submission errors dead-end.
      if (event.type === 'RESET' && state.retryable) return createMachineInitialState()
      // canSubmitCreate() allows starting again straight from a retryable error
      // (the Create button stays enabled). That attempt must drive the machine;
      // ignoring PREPARE here once let a real Create land on devnet while the
      // screen kept showing the previous "Could not create" error.
      if (event.type === 'PREPARE' && state.retryable) return freeze({ status: 'preparing' as const })
      return state

    case 'confirmed':
      return state

    default:
      return state
  }
}

export type CreateStatusCopy = Readonly<{
  title: string
  body: string
  tone: 'neutral' | 'progress' | 'success' | 'warning'
}>

/**
 * User-facing copy. Deliberately avoids success language until the ritual is
 * authoritatively confirmed.
 */
export function createStatusCopy(state: CreateMachineState): CreateStatusCopy {
  switch (state.status) {
    case 'idle':
      return freeze({
        title: 'Ready',
        body: 'One approval locks the weeks and puts your stake in.',
        tone: 'neutral' as const,
      })
    case 'preparing':
      return freeze({
        title: 'Getting it ready',
        body: 'Building your ritual. A moment.',
        tone: 'progress' as const,
      })
    case 'awaiting-wallet':
      return freeze({
        title: 'Approve in your wallet',
        body: 'Nothing is sent until you approve.',
        tone: 'progress' as const,
      })
    case 'submitted':
      return freeze({
        title: 'Sent',
        body: 'Waiting for the network.',
        tone: 'progress' as const,
      })
    case 'confirming':
      return freeze({
        title: 'Confirming',
        body: 'Checking the ritual landed exactly as shown.',
        tone: 'progress' as const,
      })
    case 'confirmed':
    case 'recovered':
      return freeze({
        title: 'Locked in.',
        body: 'Your stake is in.',
        tone: 'success' as const,
      })
    case 'error': {
      if (state.submitted || state.category === 'confirmation') {
        return freeze({
          title: 'Confirmation incomplete',
          body: "It may already have gone through. Don't try again until you've checked Home.",
          tone: 'warning' as const,
        })
      }
      if (state.category === 'wallet-rejected') {
        return freeze({
          title: 'Not approved',
          body: 'You declined the request in your wallet. Nothing was sent and nothing was charged.',
          tone: 'neutral' as const,
        })
      }
      return freeze({
        title: 'Could not create the ritual',
        body: 'Nothing was sent to the network. You can safely try again.',
        tone: 'warning' as const,
      })
    }
    default:
      return freeze({
        title: 'Create your ritual',
        body: 'Review the terms to continue.',
        tone: 'neutral' as const,
      })
  }
}
