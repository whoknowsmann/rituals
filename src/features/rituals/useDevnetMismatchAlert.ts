import { useEffect, useRef } from 'react'
import { Alert } from 'react-native'
import { DEVNET_MISMATCH_BODY, DEVNET_MISMATCH_TITLE, shouldWarnDevnetMismatch } from './devnetMismatch'

/** Show once per explicit mismatch; a generic failed wallet step never alerts. */
export function useDevnetMismatchAlert(status: string, category: string | null | undefined, walletPackage: string | null | undefined): void {
  const shownFor = useRef<string | null>(null)
  useEffect(() => {
    const key = `${status}:${category ?? ''}`
    if (!shouldWarnDevnetMismatch(status, category, walletPackage)) { if (status !== 'error') shownFor.current = null; return }
    if (shownFor.current === key) return
    shownFor.current = key
    Alert.alert(DEVNET_MISMATCH_TITLE, DEVNET_MISMATCH_BODY, [{ text: 'OK' }])
  }, [status, category, walletPackage])
}
