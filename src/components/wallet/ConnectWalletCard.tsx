import React, { useState } from 'react'
import { StyleSheet } from 'react-native'
import { Button, Card, Text } from 'react-native-paper'
import { useAuthorization } from '../../utils/useAuthorization'
import { useMobileWallet } from '../../utils/useMobileWallet'
import { palette, radius, space, type } from '../../theme'

/**
 * Shown wherever an action needs a signer but no wallet is connected.
 * Without it, action buttons sit disabled with no explanation — a dead end.
 * Renders nothing once a wallet is connected.
 */
export function ConnectWalletCard({ reason }: { reason: string }) {
  const { selectedAccount } = useAuthorization()
  const { connect } = useMobileWallet()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (selectedAccount) return null
  const onConnect = async () => {
    setConnecting(true)
    setError(null)
    try { await connect() } catch { setError('Wallet connection was not completed. Nothing was sent. Try again.') } finally { setConnecting(false) }
  }
  return (
    <Card style={styles.card} accessibilityLabel="Connect wallet required">
      <Card.Content style={styles.body}>
        <Text style={styles.title}>Connect your wallet</Text>
        <Text style={styles.muted}>{reason}</Text>
        {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
        <Button mode="contained" onPress={() => { void onConnect() }} loading={connecting} disabled={connecting} accessibilityLabel="Connect wallet">Connect wallet</Button>
      </Card.Content>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: palette.ink800, borderWidth: 1, borderColor: palette.gold600 },
  body: { gap: space.sm },
  title: { ...type.heading, color: palette.bone },
  muted: { ...type.body, color: palette.bone70 },
  error: { ...type.body, color: palette.red500 },
})
