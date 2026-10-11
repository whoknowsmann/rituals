import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import type { Connection, PublicKey } from '@solana/web3.js'
import { feeConfigFromProtocol, type FeeConfig } from '../../../../domain/rituals/money'
import { RITUAL_FEE_CONFIG } from '../../create/draftForm'
import type { RitualClientState } from '../../client/useRitualClient'
import { readTestTokenBalance } from '../../faucet/testTokenBalance'

/** Balance help only; an unreadable balance never blocks Create. */
export function useCreateBalance(client: RitualClientState, connection: Connection, wallet: PublicKey | null) {
  const [feeConfig, setFeeConfig] = useState<FeeConfig>(RITUAL_FEE_CONFIG)
  const address = wallet?.toBase58() ?? null
  const session = useRef({ address })
  if (session.current.address !== address) session.current = { address }
  const scope = session.current
  const [balanceRead, setBalanceRead] = useState<{ scope: typeof scope; amount: bigint; sol: bigint | null } | null>(null)
  const balance = balanceRead?.scope === scope ? balanceRead.amount : null
  // Devnet SOL, for rent and the settle-key pre-payment; null when unread (never blocks).
  const sol = balanceRead?.scope === scope ? balanceRead.sol : null
  const generation = useRef(0)
  const [tick, setTick] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [scope])
  const onFaucetSent = useCallback(() => {
    if (session.current !== scope) return
    generation.current += 1
    setBalanceRead(null)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setTick((value) => value + 1), 4000)
  }, [scope])
  useFocusEffect(useCallback(() => {
    const request = ++generation.current
    if (client.status !== 'ready' || !wallet) { setBalanceRead(null); return }
    let active = true
    void client.client.getProtocolConfig().then(async (config) => {
      if (active) { try { setFeeConfig(feeConfigFromProtocol(config.account, RITUAL_FEE_CONFIG.tokenDecimals)) } catch { /* keep the constant */ } }
      const [amount, sol] = await Promise.all([
        readTestTokenBalance(connection, config.account.allowedStakeMint, wallet),
        Promise.resolve().then(() => connection.getBalance(wallet, 'confirmed')).then((value) => BigInt(value)).catch(() => null),
      ])
      if (active && request === generation.current && session.current === scope) setBalanceRead({ scope, amount, sol })
    }).catch(() => { if (active && request === generation.current) setBalanceRead(null) })
    return () => { active = false }
  }, [client, connection, wallet, tick, scope]))
  return { balance, sol, feeConfig, onFaucetSent }
}
