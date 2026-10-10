import { useCallback, useEffect, useRef, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useConnection } from '../../../utils/ConnectionProvider'
import { useRitualClient } from '../client/useRitualClient'
import { readTestTokenBalance } from './testTokenBalance'
import { balanceMayHaveChanged, confirmFaucetCredit, readFaucetBaseline, requestTestTokens, type FaucetResult } from './devnetFaucet'

export type FaucetState = Readonly<{ status: 'idle' | 'requesting' | 'done'; result: FaucetResult | null }>
const idle: FaucetState = { status: 'idle', result: null }

/** One request per wallet session; a late result cannot follow a wallet switch. */
export function useDevnetFaucet(address: string | null, onSent?: () => void): FaucetState & { request: () => void } {
  const { connection } = useConnection()
  const client = useRitualClient()
  const session = useRef({ address, inFlight: false, controller: new AbortController() })
  if (session.current.address !== address) session.current = { address, inFlight: false, controller: new AbortController() }
  const scope = session.current
  const [state, setState] = useState({ scope, value: idle })
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => () => scope.controller.abort(), [scope])
  const request = useCallback(() => {
    if (!address || !mounted.current || session.current !== scope || scope.inFlight) return
    scope.inFlight = true
    setState({ scope, value: { status: 'requesting', result: null } })
    const current = () => mounted.current && session.current === scope
    const read = async () => {
      if (client.status !== 'ready') throw new Error('Balance reader unavailable')
      const owner = new PublicKey(address)
      const config = await client.client.getProtocolConfig()
      const [tokens, lamports] = await Promise.all([readTestTokenBalance(connection, config.account.allowedStakeMint, owner), connection.getBalance(owner, 'confirmed')])
      return { tokens, lamports }
    }
    void (async () => {
      try {
        const before = await readFaucetBaseline(read, scope.controller.signal)
        if (!current()) return
        const result = await requestTestTokens(fetch, address)
        if (!current()) return
        setState({ scope, value: { status: 'done', result } })
        if (balanceMayHaveChanged(result)) onSent?.()
        if (result.kind === 'sent' && !result.confirmed) {
          const checked = await confirmFaucetCredit(result, before, read, scope.controller.signal)
          if (!current()) return
          setState({ scope, value: { status: 'done', result: checked } })
          if (checked.kind === 'sent') onSent?.()
        }
      } finally { scope.inFlight = false }
    })()
  }, [address, client, connection, onSent, scope])
  return { ...(state.scope === scope ? state.value : idle), request }
}
