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

export function useCreateRitual(makeDeps: () => CreateRitualDeps, walletAddress?: string | null): UseCreateRitual {
  const session = useRef({ walletAddress })
  if (session.current.walletAddress !== walletAddress) session.current = { walletAddress }
  const scope = session.current
  const [snapshot, dispatch] = useReducer(
    (previous: { scope: object; value: CreateMachineState }, action: { scope: object; event: CreateMachineEvent }) => ({
      scope: action.scope,
      value: createMachineReducer(previous.scope === action.scope ? previous.value : createMachineInitialState(), action.event),
    }), scope, (scope) => ({ scope, value: createMachineInitialState() }),
  )
  // Hide the previous wallet's result on the first render, preserving the draft.
  const state = snapshot.scope === scope ? snapshot.value : createMachineInitialState()

  // Guards against a second attempt slipping through before the reducer has
  // committed the first. A ref is synchronous; reducer state is not.
  const inFlight = useRef(false)
  const attempt = useRef<CreateRitualDeps | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const safeDispatch = useCallback((event: Parameters<typeof createMachineReducer>[1]) => {
    if (mounted.current && session.current === scope) dispatch({ scope, event })
  }, [scope])

  const start = useCallback(() => {
    if (session.current !== scope || inFlight.current) return
    if (!canSubmitCreate(state)) return
    // Try again after a cancelled sheet: the earlier attempt may still land at
    // the same ritual address, so a failure of this one keeps the chain check.
    const carry = state.status === 'error' && state.unresolved === true
    const dispatchAttempt = (event: CreateMachineEvent) => safeDispatch(carry && event.type === 'FAILED' ? { ...event, unresolved: true } : event)
    inFlight.current = true
    void (async () => {
      try {
        // Every attempt is prepared from the terms on screen, with a fresh
        // blockhash. The screen keeps one nonce, so a retry targets the same
        // ritual address and can never make a second ritual.
        const deps = makeDeps()
        attempt.current = deps
        await runCreateRitual(deps, dispatchAttempt)
      } catch (error) {
        logFailure('create.deps', error)
        // makeDeps itself can reject invalid input before any network work.
        dispatchAttempt({ type: 'FAILED', category: 'preparation', message: 'Could not prepare the ritual. Nothing was sent.' })
      } finally {
        inFlight.current = false
      }
    })()
  }, [makeDeps, safeDispatch, scope, state])

  useEffect(() => {
    if (!createAwaitsChain(state) || !attempt.current?.reconcile) return
    // A cancelled sheet's "Network mismatch?" hint waits for this first answer.
    return watchActionReconciliation(attempt.current.reconcile, safeDispatch, state.status === 'error' && state.unresolved ? reportChainVerdict : undefined)
  }, [state, safeDispatch])
  useEffect(() => { if (state.status === 'recovered') reportChainVerdict(true) }, [state])

  const reset = useCallback(() => {
    if (inFlight.current || createAwaitsChain(state)) return
    safeDispatch({ type: 'RESET' })
  }, [safeDispatch, state])

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
