import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'
import { needsDevnetSwitchHint } from './walletChoice'

export const DEVNET_HINT_STORAGE_KEY = '@rituals/devnet-hint/v1'
let acknowledged = false
let pending: Promise<void> | null = null

async function acknowledgeHint(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(DEVNET_HINT_STORAGE_KEY) === 'shown') {
      acknowledged = true
      return
    }
  } catch { /* An unreadable flag must not prevent the wallet action. */ }

  await new Promise<void>((resolve) => {
    let done = false
    Alert.alert('Set Seed Vault to Devnet', 'Seed Vault Wallet → Settings → Network → Devnet.', [
      { text: 'Done', onPress: async () => {
        if (done) return
        done = true
        acknowledged = true
        try { await AsyncStorage.setItem(DEVNET_HINT_STORAGE_KEY, 'shown') }
        catch { /* Still continue, and remember Done for this app session. */ }
        resolve()
      } },
    ], { cancelable: false })
  })
}

/** Before the first Seed Vault action, acknowledge once and resume that same handoff. */
export async function withDevnetHintOnce<T>(walletPackage: string | null | undefined, start: () => T | Promise<T>): Promise<T> {
  if (needsDevnetSwitchHint(walletPackage) && !acknowledged) {
    pending ??= acknowledgeHint().finally(() => { pending = null })
    await pending
  }
  return start()
}
