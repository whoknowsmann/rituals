import React, { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Text } from 'react-native-paper'
import { useMobileWallet } from '../../utils/useMobileWallet'
import { CONNECT_OPTIONS, walletNotFound, type WalletOption } from '../../utils/walletChoice'
import { palette, space, type } from '../../theme'

/**
 * One button per supported wallet. Stock MWA lets Android pick the wallet, which
 * on a Seeker is always Seed Vault Wallet; this lets the user choose Phantom.
 */
export function WalletChoiceButtons({
  onConnected,
  failureCopy = 'Wallet connection was not completed. Nothing was sent. Try again.',
}: {
  onConnected?: () => void
  failureCopy?: string
}) {
  const { connect } = useMobileWallet()
  const [busy, setBusy] = useState<string | null>(null)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const choose = async (option: WalletOption) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(option.id)
    setError(null)
    try {
      await connect(option.androidPackage)
      onConnected?.()
    } catch (e) {
      setError(walletNotFound(e) ? `${option.label} is not installed on this phone.` : failureCopy)
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  return (
    <View style={styles.stack}>
      {CONNECT_OPTIONS.map((option, index) => (
        <View key={option.id} style={styles.option}>
          <Button
            mode={index === 0 ? 'contained' : 'contained-tonal'}
            icon="wallet"
            onPress={() => { void choose(option) }}
            loading={busy === option.id}
            disabled={busy !== null}
            accessibilityLabel={`Connect with ${option.label}`}
          >
            {option.label}
          </Button>
          <Text style={styles.detail}>{option.detail}</Text>
        </View>
      ))}
      {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: space.md, marginTop: space.sm },
  option: { gap: space.xs },
  detail: { ...type.caption, color: palette.bone50, textAlign: 'center' },
  error: { ...type.body, color: palette.red500 },
})
