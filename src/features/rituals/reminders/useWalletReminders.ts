import { useEffect, useRef } from 'react'
import { PublicKey } from '@solana/web3.js'
import { applyWalletReminderPlan, walletReminderPlan } from './restore'

type Loaded = Parameters<typeof walletReminderPlan>[0]

/** Home supplies its existing read; this hook never starts an RPC. */
export function useWalletReminders(loaded: Loaded | null, walletKey: string | null, walletLoading: boolean): void {
  const session = useRef({ walletKey })
  if (session.current.walletKey !== walletKey) session.current = { walletKey }
  const scope = session.current
  // Home's last chain read this launch (every ritual on the phone); null until one succeeds.
  const lastRead = useRef<Loaded | null>(null)
  if (loaded) lastRead.current = loaded
  const applied = useRef<{ scope: typeof scope; key: string } | null>(null)
  useEffect(() => {
    if (walletLoading) return
    // A disconnect silences every alert without the RPC. A connected wallet's
    // alerts stay until a read shows which rituals are its own: a plan without
    // one would silence them all, and a failed launch read would leave none.
    if (walletKey !== null && lastRead.current === null) return
    const plan = walletReminderPlan(lastRead.current ?? [], walletKey ? new PublicKey(walletKey) : null, Math.floor(Date.now() / 1000))
    if (applied.current?.scope === scope && applied.current.key === plan.key) return
    let active = true
    const mayContinue = () => active && session.current === scope
    void applyWalletReminderPlan(plan, mayContinue).then((done) => {
      if (done && mayContinue()) applied.current = { scope, key: plan.key }
    }).catch(() => undefined) // the next Home read retries; no false completed key
    return () => { active = false }
  }, [loaded, walletKey, walletLoading, scope])
}
