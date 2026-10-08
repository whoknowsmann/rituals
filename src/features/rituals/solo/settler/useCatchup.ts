import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { Connection, PublicKey } from '@solana/web3.js'
import type { RitualBundleRead } from '../../../../data/rituals/ritualsRpc'
import { demoSpeedNotice } from '../lifecycle/soloRitualModel'
import { ritualsForWallet } from '../../home/homeSections'
import { createSettlerClient } from './settlerClient'
import { loadOrCreateSettler } from './settlerKey'
import { catchupFailures, failureKey, overdue, runCatchup, runWalletCatchup } from './catchupRunner'
import { settlementVisibleEnough } from './settlementVisibility'

type Input = {
  connection: Connection
  rituals: readonly { bundle: RitualBundleRead }[]
  now: number | null
  focused: boolean
  scope: 'home' | 'ritual'
  wallet: PublicKey | null
  onChanged: () => void
}

/** Foreground entry points only; the send guard also checks focus/wallet after awaits. */
export function useCatchup(input: Input): { busy: boolean; blocked: boolean } {
  const latest = useRef(input); latest.current = input
  const mounted = useRef(false)
  const lock = useRef(false)
  const queueLock = useRef(false)
  const completedSnapshot = useRef<string | null>(null)
  const snapshot = `${input.scope}:${input.wallet?.toBase58() ?? ''}:${input.rituals.map(({ bundle }) => `${bundle.ritual.address.toBase58()}:${bundle.slot}:${bundle.ritual.account.currentEventIndex}`).join(',')}`
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!input.focused) completedSnapshot.current = null
    if (queueLock.current || !input.focused || input.now === null || AppState.currentState !== 'active') return
    if (completedSnapshot.current === snapshot) return
    const owned = input.scope === 'home' ? ritualsForWallet(input.rituals, input.wallet) : input.rituals
    const candidates = owned.filter(({ bundle }) => overdue(bundle, input.now) && (catchupFailures.get(failureKey(bundle)) ?? 0) < 3)
    if (!candidates.length || (input.scope === 'home' && !input.wallet)) return
    queueLock.current = true
    setBusy(true)
    setBlocked(false)
    const wallet = input.wallet?.toBase58()
    const mayContinue = () => mounted.current && latest.current.focused && AppState.currentState === 'active'
      && latest.current.connection === input.connection && latest.current.wallet?.toBase58() === wallet
    let changed = false
    let failed = false
    let deferred = false
    void (async () => {
      const key = await loadOrCreateSettler()
      const client = createSettlerClient(input.connection, key, mayContinue)
      const run = async ({ bundle }: { bundle: RitualBundleRead }) => {
        if (!mayContinue()) return
        const result = await runCatchup({ client, bundle, ritualAddress: bundle.ritual.address, settler: key.publicKey,
          lock, failures: catchupFailures, now: () => latest.current.now,
          getBalance: () => input.connection.getBalance(key.publicKey, 'confirmed'),
          getBlockHeight: () => input.connection.getBlockHeight('confirmed'),
          mayContinue: (read) => {
            const account = read.ritual.account
            return mayContinue() && latest.current.rituals.some((item) => item.bundle.ritual.address.equals(read.ritual.address))
              && settlementVisibleEnough({ demoSpeedNotice: demoSpeedNotice(account.schedule),
                showedUp: read.claims.some((claim) => claim.account?.status === 'Confirmed'),
                weekSkipped: account.skipDeclared && account.skipEventIndex === account.currentEventIndex,
              }, input.scope === 'ritual', AppState.currentState, input.scope === 'home')
          },
        })
        changed ||= result.changed
        failed ||= result.blocked
        deferred ||= Boolean(result.deferred)
      }
      if (input.scope === 'home') await runWalletCatchup(candidates, input.wallet, mayContinue, run)
      else for (const ritual of candidates) await run(ritual)
    })().catch(() => { failed = true }).finally(() => {
      queueLock.current = false
      if (!mounted.current) return
      if (mayContinue() && !deferred) completedSnapshot.current = snapshot
      setBusy(false)
      setBlocked(failed)
      if (changed) latest.current.onChanged()
    })
  }, [input.connection, input.focused, input.now, snapshot])
  const capped = input.rituals.some(({ bundle }) => overdue(bundle, input.now) && (catchupFailures.get(failureKey(bundle)) ?? 0) >= 3)
  return { busy, blocked: blocked || capped }
}
