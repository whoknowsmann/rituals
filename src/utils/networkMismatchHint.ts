import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'
import { needsDevnetSwitchHint } from './walletChoice'
import { awaitChainVerdict, devnetProven } from './chainVerdict'

export const NETWORK_MISMATCH_HINT_STORAGE_KEY = '@rituals/network-mismatch-hint/v1'
const LIMIT = 2
/** How long the hint waits for the chain to show whether the action went through. */
const CHAIN_WAIT_MS = 4000
let shownThisRun = 0
let queue: Promise<void> = Promise.resolve()

async function showUnderLimit(): Promise<void> {
  let stored = 0
  try { stored = Number(await AsyncStorage.getItem(NETWORK_MISMATCH_HINT_STORAGE_KEY)) || 0 } catch { /* Unreadable: fail open. */ }
  const count = Math.max(stored, shownThisRun)
  if (count >= LIMIT) return
  Alert.alert('Network mismatch?', 'Rituals runs on Devnet. In Seed Vault Wallet: Settings → Network → Devnet. Then try again.', [{ text: 'OK' }])
  shownThisRun = count + 1
  try { await AsyncStorage.setItem(NETWORK_MISMATCH_HINT_STORAGE_KEY, String(shownThisRun)) } catch { /* This run's count still caps it. */ }
}

/**
 * Seed Vault Wallet answers a decline, its own "Network mismatch" sheet and
 * Back on its success sheet (after a broadcast) with the same cancellation, so
 * after a cancelled Seed Vault signing sheet name the likely cause, unless the
 * chain's first answer (at most 4 s) shows the action went through. At most
 * twice per phone, and at most once per failure.
 */
export function showNetworkMismatchHint(walletPackage: string | null | undefined): Promise<void> {
  if (!needsDevnetSwitchHint(walletPackage) || devnetProven()) return Promise.resolve()
  const landed = awaitChainVerdict(CHAIN_WAIT_MS)
  queue = queue.then(async () => { if (!(await landed)) await showUnderLimit() }).catch(() => undefined)
  return queue
}
