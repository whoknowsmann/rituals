import { useCallback, useEffect, useRef, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useConnection } from '../../../utils/ConnectionProvider'
import { RITUALS_DEVNET_STAKE_MINT } from '../../../data/rituals/programIds'
import { balanceMayHaveChanged, requestTestTokens, type FaucetResult } from './devnetFaucet'
import { readTestTokenBalance } from './testTokenBalance'

export type FaucetState = Readonly<{ status: 'idle' | 'requesting' | 'done'; result: FaucetResult | null }>
const idle: FaucetState = { status: 'idle', result: null }
type Balance = Readonly<{ tokens: bigint; lamports: number }>
type Session = { address: string | null; inFlight: boolean; cancel?: () => void }

/** One request per wallet session; a late result cannot follow a wallet switch. */
export function useDevnetFaucet(address: string | null, onSent?: () => void): FaucetState & { request: () => void } {
  const { connection } = useConnection()
  const session = useRef<Session>({ address, inFlight: false })
  if (session.current.address !== address) session.current = { address, inFlight: false }
  const scope = session.current
  const [state, setState] = useState({ scope, value: idle })
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => () => scope.cancel?.(), [scope])
  const request = useCallback(() => {
    if (!address || !mounted.current || session.current !== scope || scope.inFlight) return
    scope.inFlight = true
    setState({ scope, value: { status: 'requesting', result: null } })
    const isCurrent = () => mounted.current && session.current === scope
    const readBalance = async (): Promise<Balance | null> => {
      try {
        const owner = new PublicKey(address)
        const [tokens, lamports] = await Promise.all([
          readTestTokenBalance(connection, RITUALS_DEVNET_STAKE_MINT, owner),
          connection.getBalance(owner, 'confirmed'),
        ])
        return { tokens, lamports }
      } catch { return null }
    }
    void (async () => {
      // Capture the pre-send balance, but never hold the faucet hostage to RPC.
      const before = await new Promise<Balance | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 5000)
        scope.cancel = () => { clearTimeout(timer); resolve(null) }
        void readBalance().then(resolve)
      })
      scope.cancel?.(); scope.cancel = undefined
      if (!isCurrent()) return
      const result = await requestTestTokens(fetch, address)
      if (!isCurrent()) return
      setState({ scope, value: { status: 'done', result } })
      if (balanceMayHaveChanged(result) && onSent) onSent()
      if (result.kind !== 'sent' || result.confirmed) { scope.inFlight = false; return }

      let active = true
      let timer: ReturnType<typeof setTimeout> | undefined
      const stop = () => { active = false; clearTimeout(deadline); clearTimeout(timer) }
      const finish = (resolved: FaucetResult) => {
        if (!active || !isCurrent()) return
        stop(); scope.cancel = undefined; scope.inFlight = false
        setState({ scope, value: { status: 'done', result: resolved } })
        onSent?.()
      }
      // The deadline also bounds a hung read; late responses cannot revive it.
      const deadline = setTimeout(() => finish({ kind: 'unreachable' }), 30_000)
      scope.cancel = stop
      const check = async () => {
        const after = await readBalance()
        if (!active || !isCurrent()) return
        if (before && after && after.tokens - before.tokens >= 50_000_000n && after.lamports - before.lamports >= 50_000_000) {
          finish({ ...result, confirmed: true })
        } else timer = setTimeout(() => { void check() }, 5000)
      }
      void check()
    })()
  }, [address, connection, onSent, scope])
  return { ...(state.scope === scope ? state.value : idle), request }
}
