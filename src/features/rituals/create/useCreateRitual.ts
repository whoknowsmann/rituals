/**
 * React binding for the Create journey.
 *
 * Owns the state machine, runs the orchestrator, and guarantees two things the
 * reducer cannot enforce on its own:
 *
 *   1. one in-flight attempt at a time, even under rapid taps;
 *   2. no state updates after unmount, so a backgrounded screen cannot write
 *      into a dead component.
 *
 * All transaction logic lives in runCreateRitual and buildCreateRitualDeps;
 * this hook is deliberately thin.
 */

import { logFailure } from '../../../utils/diagnostics'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  canSubmitCreate,
  createAwaitsChain,
  createMachineInitialState,
  createMachineReducer,
  createStatusCopy,
  isTerminalCreateState,
  type CreateMachineEvent,
  type CreateMachineState,
  type CreateStatusCopy,
} from './createMachine'
import { runCreateRitual, type CreateRitualDeps } from './runCreateRitual'
import { watchActionReconciliation } from '../recovery/reconcilePendingAction'
import { reportChainVerdict } from '../../../utils/chainVerdict'

export type UseCreateRitual = Readonly<{
  state: CreateMachineState
  copy: CreateStatusCopy
  /** True only when starting a new attempt is safe. */
  canSubmit: boolean
  isBusy: boolean
  isTerminal: boolean
  start: () => void
  reset: () => void
  observeReadback: (ritualAddress: string) => void
}>

type CreateSession = { walletAddress: string | null; inFlight: boolean; attempt: CreateRitualDeps | null }

export function useCreateRitual(makeDeps: () => CreateRitualDeps, walletAddress: string | null = null): UseCreateRitual {
  const session = useRef<CreateSession>({ walletAddress, inFlight: false, attempt: null })
  if (session.current.walletAddress !== walletAddress) session.current = { walletAddress, inFlight: false, attempt: null }
  const scope = session.current
  const [stored, dispatch] = useReducer(
    (previous: { scope: CreateSession; value: CreateMachineState }, action: { scope: CreateSession; event: CreateMachineEvent }) => ({
      scope: action.scope,
      value: createMachineReducer(previous.scope === action.scope ? previous.value : createMachineInitialState(), action.event),
    }), undefined, () => ({ scope, value: createMachineInitialState() }),
  )
  // Hide the old wallet's state on the very first render, including A → B → A.
  const state = stored.scope === scope ? stored.value : createMachineInitialState()

  // Guards against a second attempt slipping through before the reducer has
  // committed the first. A ref is synchronous; reducer state is not.
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const safeDispatch = useCallback((event: Parameters<typeof createMachineReducer>[1]) => {
    if (mounted.current && session.current === scope) dispatch({ scope, event })
  }, [scope])

  const start = useCallback(() => {
    if (!mounted.current || session.current !== scope || scope.inFlight) return
    if (!canSubmitCreate(state)) return
    // Try again after a cancelled sheet: the earlier attempt may still land at
    // the same ritual address, so a failure of this one keeps the chain check.
    const carry = state.status === 'error' && state.unresolved === true
    const dispatchAttempt = (event: CreateMachineEvent) => safeDispatch(carry && event.type === 'FAILED' ? { ...event, unresolved: true } : event)
    scope.inFlight = true
    void (async () => {
      try {
        // Every attempt is prepared from the terms on screen, with a fresh
        // blockhash. The screen keeps one nonce, so a retry targets the same
        // ritual address and can never make a second ritual.
        const deps = makeDeps()
        scope.attempt = deps
        await runCreateRitual(deps, dispatchAttempt)
      } catch (error) {
        logFailure('create.deps', error)
        // makeDeps itself can reject invalid input before any network work.
        dispatchAttempt({ type: 'FAILED', category: 'preparation', message: 'Could not prepare the ritual. Nothing was sent.' })
      } finally {
        scope.inFlight = false
      }
    })()
  }, [makeDeps, safeDispatch, scope, state])

  useEffect(() => {
    if (!createAwaitsChain(state) || !scope.attempt?.reconcile) return
    // A cancelled sheet's "Network mismatch?" hint waits for this first answer.
    return watchActionReconciliation(scope.attempt.reconcile, safeDispatch, state.status === 'error' && state.unresolved ? reportChainVerdict : undefined)
  }, [state, safeDispatch, scope])
  useEffect(() => { if (state.status === 'recovered') reportChainVerdict(true) }, [state])

  const reset = useCallback(() => {
    if (scope.inFlight || createAwaitsChain(state)) return
    safeDispatch({ type: 'RESET' })
  }, [safeDispatch, scope, state])

  const busy = !canSubmitCreate(state) && !isTerminalCreateState(state)
  const observeReadback = useCallback((ritualAddress: string) => safeDispatch({ type: 'READBACK_OBSERVED', ritualAddress }), [safeDispatch])

  return {
    state,
    copy: createStatusCopy(state),
    canSubmit: canSubmitCreate(state),
    isBusy: busy,
    isTerminal: isTerminalCreateState(state),
    start,
    reset,
    observeReadback,
  }
}
