import { useCallback, useEffect, useReducer, useRef } from 'react'
import { lifecycleAwaitsChain, lifecycleCanSubmit, lifecycleInitialState, lifecycleIsBusy, lifecycleReducer, lifecycleStatusCopy, type LifecycleEvent, type LifecycleState } from './lifecycleMachine'
import { runLifecycleAction, type LifecycleActionDeps } from './runLifecycleAction'
import { retainActionReconciliation, watchActionReconciliation } from './recovery/reconcilePendingAction'
import { markDevnetProven, reportChainVerdict } from '../../utils/chainVerdict'

export type UseRitualAction = Readonly<{
  state: LifecycleState
  copy: Readonly<{ title: string; body: string; tone: 'neutral' | 'progress' | 'success' | 'warning' }>
  canSubmit: boolean
  isBusy: boolean
  start: () => void
  reset: () => void
  observeReadback: (ritualAddress: string) => void
}>

export function useRitualAction(makeDeps: () => LifecycleActionDeps, onFailure?: () => void): UseRitualAction {
  const [state, dispatch] = useReducer(lifecycleReducer, undefined, lifecycleInitialState)
  const failureRef = useRef(onFailure); failureRef.current = onFailure
  // Preparation can reject an obsolete week before the wallet ever opens.
  // Refresh the screen's premise once per error, not on each clock render.
  useEffect(() => { if (state.status === 'error') failureRef.current?.() }, [state])
  const inFlight = useRef(false)
  const attempt = useRef<LifecycleActionDeps | null>(null)
  const landed = useRef<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const safeDispatch = useCallback((event: LifecycleEvent) => { if (mounted.current) { if (event.type === 'READBACK_OBSERVED') landed.current = event.ritualAddress; dispatch(event) } }, [])
  const start = useCallback(() => {
    if (inFlight.current || !lifecycleCanSubmit(state)) return
    inFlight.current = true
    landed.current = null
    void (async () => {
      try {
        const deps = makeDeps()
        const reconcile = retainActionReconciliation(lifecycleAwaitsChain(state) ? attempt.current?.reconcile : undefined, deps.reconcile)
        attempt.current = { ...deps, reconcile }
        await runLifecycleAction({ ...deps, submit: (prepared) => {
          if (!mounted.current || landed.current === prepared.ritualAddress) throw new Error('Action already resolved or screen closed')
          return deps.submit(prepared)
        } }, safeDispatch)
      } catch { safeDispatch({ type: 'FAILED', category: 'preparation', message: 'Could not prepare the action. Nothing was sent.' }) }
      finally { inFlight.current = false }
    })()
  }, [makeDeps, safeDispatch, state])
  const awaitsChain = lifecycleAwaitsChain(state)
  useEffect(() => {
    if (!awaitsChain || !attempt.current?.reconcile) return
    // A cancelled sheet's "Network mismatch?" hint waits for this first answer.
    return watchActionReconciliation(() => attempt.current?.reconcile?.() ?? Promise.resolve(null), safeDispatch, state.status === 'error' && state.unresolved ? reportChainVerdict : undefined)
  }, [awaitsChain, safeDispatch])
  // The screen's own read can show the landing first.
  useEffect(() => { if (state.status === 'recovered') reportChainVerdict(true); if (state.status === 'confirmed' || state.status === 'recovered') markDevnetProven() }, [state])
  const reset = useCallback(() => { if (!inFlight.current) safeDispatch({ type: 'RESET' }) }, [safeDispatch])
  const observeReadback = useCallback((ritualAddress: string) => safeDispatch({ type: 'READBACK_OBSERVED', ritualAddress }), [safeDispatch])
  return { state, copy: lifecycleStatusCopy(state), canSubmit: lifecycleCanSubmit(state), isBusy: lifecycleIsBusy(state), start, reset, observeReadback }
}
