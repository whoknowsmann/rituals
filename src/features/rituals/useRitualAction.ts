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

export function useRitualAction(makeDeps: () => LifecycleActionDeps, onFailure?: () => void): UseRitualAction {
  const [state, dispatch] = useReducer(lifecycleReducer, undefined, lifecycleInitialState)
  const failureRef = useRef(onFailure); failureRef.current = onFailure
  // Preparation can reject an obsolete week before the wallet ever opens.
  // Refresh the screen's premise once per error, not on each clock render.
  useEffect(() => { if (state.status === 'error') failureRef.current?.() }, [state])
  const inFlight = useRef(false)
  const attempt = useRef<LifecycleActionDeps | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const safeDispatch = useCallback((event: LifecycleEvent) => { if (mounted.current) dispatch(event) }, [])
  const start = useCallback(() => {
    if (inFlight.current || !lifecycleCanSubmit(state)) return
    const carry = lifecycleAwaitsChain(state)
    const dispatchAttempt = (event: LifecycleEvent) => safeDispatch(carry && event.type === 'FAILED' ? { ...event, unresolved: true } : event)
    inFlight.current = true
    void (async () => {
      try {
        let deps = makeDeps()
        if (carry) {
          // Preparation has no new journal entry; keep the earlier chain check.
          const previous = attempt.current
          const prepared = await deps.prepare()
          if (!mounted.current || attempt.current !== previous) return
          const reconcile = deps.reconcile
          deps = { ...deps, prepare: async () => prepared,
            reconcile: async () => (await reconcile?.()) ?? previous?.reconcile?.() ?? null }
        }
        attempt.current = deps
        await runLifecycleAction(deps, dispatchAttempt)
      } catch { safeDispatch({ type: 'FAILED', category: 'preparation', message: 'Could not prepare the action. Nothing was sent.' }) }
      finally { inFlight.current = false }
    })()
  }, [makeDeps, safeDispatch, state])
  useEffect(() => {
    if (!lifecycleAwaitsChain(state) || !attempt.current?.reconcile) return
    // A cancelled sheet's "Network mismatch?" hint waits for this first answer.
    const watched = attempt.current
    return watchActionReconciliation(attempt.current.reconcile, (event) => {
      if (attempt.current !== watched) return
      attempt.current = null // A resolved earlier attempt must not open a retry's wallet.
      safeDispatch(event)
    }, state.status === 'error' && state.unresolved ? reportChainVerdict : undefined)
  }, [state, safeDispatch])
  // The screen's own read can show the landing first.
  useEffect(() => { if (state.status === 'recovered') reportChainVerdict(true) }, [state])
  const reset = useCallback(() => { if (!inFlight.current) safeDispatch({ type: 'RESET' }) }, [safeDispatch])
  const observeReadback = useCallback((ritualAddress: string) => {
    if (state.status === 'error' && state.ritualAddress === ritualAddress) attempt.current = null
    safeDispatch({ type: 'READBACK_OBSERVED', ritualAddress })
  }, [safeDispatch, state])
  return { state, copy: lifecycleStatusCopy(state), canSubmit: lifecycleCanSubmit(state), isBusy: lifecycleIsBusy(state), start, reset, observeReadback }
}
