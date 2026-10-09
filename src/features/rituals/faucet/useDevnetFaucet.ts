import { useCallback, useEffect, useRef, useState } from 'react'
import { balanceMayHaveChanged, requestTestTokens, type FaucetResult } from './devnetFaucet'

export type FaucetState = Readonly<{ status: 'idle' | 'requesting' | 'done'; result: FaucetResult | null }>
const idle: FaucetState = { status: 'idle', result: null }

/** One request per wallet session; a late result cannot follow a wallet switch. */
export function useDevnetFaucet(address: string | null, onSent?: () => void): FaucetState & { request: () => void } {
  const session = useRef({ address, inFlight: false })
  if (session.current.address !== address) session.current = { address, inFlight: false }
  const scope = session.current
  const [state, setState] = useState({ scope, value: idle })
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const request = useCallback(() => {
    if (!address || !mounted.current || session.current !== scope || scope.inFlight) return
    scope.inFlight = true
    setState({ scope, value: { status: 'requesting', result: null } })
    void requestTestTokens(fetch, address).then((result) => {
      scope.inFlight = false
      if (!mounted.current || session.current !== scope) return
      setState({ scope, value: { status: 'done', result } })
      if (balanceMayHaveChanged(result) && onSent) onSent()
    })
  }, [address, onSent, scope])
  return { ...(state.scope === scope ? state.value : idle), request }
}
