import { useCallback, useEffect, useReducer, useRef } from 'react'
import { lifecycleAwaitsChain, lifecycleCanSubmit, lifecycleInitialState, lifecycleIsBusy, lifecycleReducer, lifecycleStatusCopy, type LifecycleEvent, type LifecycleState } from './lifecycleMachine'
import { runLifecycleAction, type LifecycleActionDeps } from './runLifecycleAction'
import { watchActionReconciliation } from './recovery/reconcilePendingAction'
import { reportChainVerdict } from '../../utils/chainVerdict'

export type UseRitualAction = Readonly<{
  state: LifecycleState
  copy: Readonly<{ title: string; body: string; tone: 'neutral' | 'progress' | 'success' | 'warning' }>
  canSubmit: boolean
  isBusy: boolean
  start: () => void
  reset: () => void
  observeReadback: (ritualAddress: string) => void
}>

export function useRitualAction(makeDeps: () => LifecycleActionDeps): UseRitualAction {
  const [state, dispatch] = useReducer(lifecycleReducer, undefined, lifecycleInitialState)
  const inFlight = useRef(false)
  const attempt = useRef<LifecycleActionDeps | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const safeDispatch = useCallback((event: LifecycleEvent) => { if (mounted.current) dispatch(event) }, [])
  const start = useCallback(() => {
    if (inFlight.current || !lifecycleCanSubmit(state)) return
    inFlight.current = true
    void (async () => { try { attempt.current = makeDeps(); await runLifecycleAction(attempt.current, safeDispatch) } catch { safeDispatch({ type: 'FAILED', category: 'preparation', message: 'Could not prepare the action. Nothing was sent.' }) } finally { inFlight.current = false } })()
  }, [makeDeps, safeDispatch, state])
  useEffect(() => {
    if (!lifecycleAwaitsChain(state) || !attempt.current?.reconcile) return
    // A cancelled sheet's "Network mismatch?" hint waits for this first answer.
    return watchActionReconciliation(attempt.current.reconcile, safeDispatch, state.status === 'error' && state.unresolved ? reportChainVerdict : undefined)
  }, [state, safeDispatch])
  // The screen's own read can show the landing first.
  useEffect(() => { if (state.status === 'recovered') reportChainVerdict(true) }, [state])
  const reset = useCallback(() => { if (!inFlight.current) safeDispatch({ type: 'RESET' }) }, [safeDispatch])
  const observeReadback = useCallback((ritualAddress: string) => safeDispatch({ type: 'READBACK_OBSERVED', ritualAddress }), [safeDispatch])
  return { state, copy: lifecycleStatusCopy(state), canSubmit: lifecycleCanSubmit(state), isBusy: lifecycleIsBusy(state), start, reset, observeReadback }
}
