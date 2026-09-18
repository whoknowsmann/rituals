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

import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  canSubmitCreate,
  createMachineInitialState,
  createMachineReducer,
  createStatusCopy,
  isTerminalCreateState,
  type CreateMachineState,
  type CreateStatusCopy,
} from './createMachine'
import { runCreateRitual, type CreateRitualDeps } from './runCreateRitual'

export type UseCreateRitual = Readonly<{
  state: CreateMachineState
  copy: CreateStatusCopy
  /** True only when starting a new attempt is safe. */
  canSubmit: boolean
  isBusy: boolean
  isTerminal: boolean
  start: () => void
  reset: () => void
}>

export function useCreateRitual(makeDeps: () => CreateRitualDeps): UseCreateRitual {
  const [state, dispatch] = useReducer(createMachineReducer, undefined, createMachineInitialState)

  // Guards against a second attempt slipping through before the reducer has
  // committed the first. A ref is synchronous; reducer state is not.
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const safeDispatch = useCallback((event: Parameters<typeof createMachineReducer>[1]) => {
    if (mounted.current) dispatch(event)
  }, [])

  const start = useCallback(() => {
    if (inFlight.current) return
    if (!canSubmitCreate(state)) return
    inFlight.current = true
    void (async () => {
      try {
        const deps = makeDeps()
        await runCreateRitual(deps, safeDispatch)
      } catch {
        // makeDeps itself can reject invalid input before any network work.
        safeDispatch({ type: 'FAILED', category: 'preparation', message: 'Could not prepare the ritual. Nothing was sent.' })
      } finally {
        inFlight.current = false
      }
    })()
  }, [makeDeps, safeDispatch, state])

  const reset = useCallback(() => {
    if (inFlight.current) return
    safeDispatch({ type: 'RESET' })
  }, [safeDispatch])

  const busy = !canSubmitCreate(state) && !isTerminalCreateState(state)

  return {
    state,
    copy: createStatusCopy(state),
    canSubmit: canSubmitCreate(state),
    isBusy: busy,
    isTerminal: isTerminalCreateState(state),
    start,
    reset,
  }
}
