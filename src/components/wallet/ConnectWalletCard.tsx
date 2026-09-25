import React from 'react'
import { StyleSheet } from 'react-native'
import { Card, Text } from 'react-native-paper'
import { useAuthorization } from '../../utils/useAuthorization'
import { WalletChoiceButtons } from './WalletChoiceButtons'
import { palette, radius, space, type } from '../../theme'

/**
 * Shown wherever an action needs a signer but no wallet is connected.
 * Without it, action buttons sit disabled with no explanation — a dead end.
 * Renders nothing once a wallet is connected.
 */
export function ConnectWalletCard({ reason }: { reason: string }) {
  const { selectedAccount } = useAuthorization()
  if (selectedAccount) return null
  return (
    <Card style={styles.card} accessibilityLabel="Connect wallet required">
      <Card.Content style={styles.body}>
        <Text style={styles.title}>Connect your wallet</Text>
        <Text style={styles.muted}>{reason}</Text>
        <WalletChoiceButtons />
      </Card.Content>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: palette.ink800, borderWidth: 1, borderColor: palette.gold600 },
  body: { gap: space.sm },
  title: { ...type.heading, color: palette.bone },
  muted: { ...type.body, color: palette.bone70 },
})
