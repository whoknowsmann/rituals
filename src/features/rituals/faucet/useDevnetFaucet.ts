import { useCallback, useRef, useState } from 'react'
import { requestTestTokens, type FaucetResult } from './devnetFaucet'

export type FaucetState = Readonly<{ status: 'idle' | 'requesting' | 'done'; result: FaucetResult | null }>

/** Screen-side state for "Get test tokens": one request at a time, result kept until the next tap. */
export function useDevnetFaucet(address: string | null, onSent?: () => void): FaucetState & { request: () => void } {
  const [state, setState] = useState<FaucetState>({ status: 'idle', result: null })
  const inFlight = useRef(false)
  const request = useCallback(() => {
    if (!address || inFlight.current) return
    inFlight.current = true
    setState({ status: 'requesting', result: null })
    void requestTestTokens(fetch, address).then((result) => {
      inFlight.current = false
      setState({ status: 'done', result })
      if (result.kind === 'sent' && onSent) onSent()
    })
  }, [address, onSent])
  return { ...state, request }
}
