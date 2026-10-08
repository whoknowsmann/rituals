import React, { useState } from 'react'
import { Linking, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { useCluster } from '../components/cluster/cluster-data-access'
import { useAuthorization } from '../utils/useAuthorization'
import { useDevnetFaucet } from '../features/rituals/faucet/useDevnetFaucet'
import { faucetLine } from '../features/rituals/faucet/devnetFaucet'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { reminders } from '../features/rituals/reminders/runtime'
import { restoreRememberedReminders } from '../features/rituals/reminders/restore'
import { useReminderSettings } from '../features/rituals/reminders/useReminderSettings'
import { notificationPermissionLine, openNotificationSettings } from '../features/rituals/reminders/systemSettings'
import { EndEarly, YourRituals, type EndingRitual } from '../features/rituals/eject/EndEarly'
import { ActionButton, Footnote } from '../components/crew'
import { WalletChoiceButtons } from '../components/wallet/WalletChoiceButtons'
import { RITUALS_PROGRAM_ID } from '../data/rituals/programIds'
import { color, radius, space, type, themedStyles, useColors } from '../theme'

export function shortProgramId(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function SettingsScreen() {
  const s = useS()
  const { getExplorerUrl } = useCluster()
  const programId = RITUALS_PROGRAM_ID.toBase58()
  const explorerUrl = getExplorerUrl(`address/${programId}`)
  const version = Constants.expoConfig?.version ?? '0.1.0'
  const { selectedAccount } = useAuthorization()
  const faucet = useDevnetFaucet(selectedAccount?.publicKey.toBase58() ?? null)
  const client = useRitualClient()
  const notificationSettings = useReminderSettings()
  const setRemindMe = (enabled: boolean) => { void notificationSettings.update(async () => {
    const saved = await reminders.setMasterEnabled(enabled)
    if (!saved || !enabled) return saved
    return client.status === 'ready' ? restoreRememberedReminders(client.client) : false
  }) }
  // Ending a ritual early is the whole screen while it is open.
  const [ending, setEnding] = useState<EndingRitual | null>(null)
  if (ending) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <EndEarly ritual={ending} onClose={() => setEnding(null)} />
      </ScrollView>
    )
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.card} accessibilityLabel="Test tokens">
        <ActionButton tone="quiet" label={faucet.status === 'requesting' ? 'Sending…' : 'Get test tokens'} onPress={faucet.request} disabled={!selectedAccount || faucet.status === 'requesting'} loading={faucet.status === 'requesting'} accessibilityLabel="Get test tokens from the devnet faucet" style={s.explorerButton} />
        {selectedAccount ? <Text style={s.muted}>Sends 50 tSKR and 0.05 devnet SOL. No approval needed.</Text> : <View><Text style={s.muted}>Set your wallet to Devnet.</Text><WalletChoiceButtons failureCopy="Connection not completed. Try again." /></View>}
        {faucet.status === 'done' && faucet.result && <Text style={s.muted} accessibilityLiveRegion="polite">{faucetLine(faucet.result)}</Text>}
      </View>
      <View style={s.card} accessibilityLabel="Notifications">
        <Text style={s.value} accessibilityRole="header">Notifications</Text>
        <Text style={s.muted} accessibilityLiveRegion="polite">{notificationSettings.error ?? notificationPermissionLine(notificationSettings.permission, Platform.OS)}</Text>
        <ActionButton tone="link" label="Notification settings" onPress={() => { void openNotificationSettings() }} style={s.explorerButton} />
        <View style={s.switchRow}>
          <Text style={s.muted}>Remind me</Text>
          <Switch accessibilityLabel="Remind me" value={notificationSettings.preferences?.masterEnabled ?? false} onValueChange={setRemindMe} disabled={!notificationSettings.preferences || notificationSettings.busy} />
        </View>
      </View>
      <View style={s.card} accessibilityLabel="Network information">
        <Text style={s.label}>NETWORK</Text>
        <Text style={s.value}>Devnet</Text>
      </View>
      <View style={s.card} accessibilityLabel="Program information">
        <Text style={s.label}>PROGRAM</Text>
        <Text style={s.value}>{shortProgramId(programId)}</Text>
        <ActionButton tone="link" label="View on Explorer" onPress={() => { void Linking.openURL(explorerUrl).catch(() => {}) }} accessibilityLabel="View program on Solana Explorer" style={s.explorerButton} />
      </View>
      <YourRituals onEnd={setEnding} />
      <Text style={s.version}>App version {version}</Text>
      <Footnote>Devnet · tSKR is a test token with no real value</Footnote>
    </ScrollView>
  )
}

const useS = themedStyles((color) => StyleSheet.create({
  screen: { backgroundColor: color.bg },
  content: { padding: space.screen, paddingBottom: 48, gap: space.md },
  card: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.xs },
  label: { ...type.label, color: color.muted },
  value: { ...type.heading, color: color.fg, marginTop: space.xs },
  muted: { ...type.body, color: color.muted },
  explorerButton: { marginTop: space.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
  version: { ...type.caption, color: color.faint, textAlign: 'center' },
}))
