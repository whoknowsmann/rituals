import { useCallback, useEffect, useReducer, useRef } from 'react'
import { lifecycleCanSubmit, lifecycleInitialState, lifecycleIsBusy, lifecycleReducer, lifecycleStatusCopy, type LifecycleEvent, type LifecycleState } from './lifecycleMachine'
import { runLifecycleAction, type LifecycleActionDeps } from './runLifecycleAction'

export type UseRitualAction = Readonly<{
  state: LifecycleState
  copy: Readonly<{ title: string; body: string; tone: 'neutral' | 'progress' | 'success' | 'warning' }>
  canSubmit: boolean
  isBusy: boolean
  start: () => void
  reset: () => void
}>

export function useRitualAction(makeDeps: () => LifecycleActionDeps): UseRitualAction {
  const [state, dispatch] = useReducer(lifecycleReducer, undefined, lifecycleInitialState)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const safeDispatch = useCallback((event: LifecycleEvent) => { if (mounted.current) dispatch(event) }, [])
  const start = useCallback(() => {
    if (inFlight.current || !lifecycleCanSubmit(state)) return
    inFlight.current = true
    void (async () => { try { await runLifecycleAction(makeDeps(), safeDispatch) } catch { safeDispatch({ type: 'FAILED', category: 'preparation', message: 'Could not prepare the action. Nothing was sent.' }) } finally { inFlight.current = false } })()
  }, [makeDeps, safeDispatch, state])
  const reset = useCallback(() => { if (!inFlight.current) safeDispatch({ type: 'RESET' }) }, [safeDispatch])
  return { state, copy: lifecycleStatusCopy(state), canSubmit: lifecycleCanSubmit(state), isBusy: lifecycleIsBusy(state), start, reset }
}
