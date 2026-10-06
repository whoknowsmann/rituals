import React from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { useCluster } from '../components/cluster/cluster-data-access'
import { useAuthorization } from '../utils/useAuthorization'
import { useDevnetFaucet } from '../features/rituals/faucet/useDevnetFaucet'
import { faucetLine } from '../features/rituals/faucet/devnetFaucet'
import { ActionButton, Footnote, Hero } from '../components/crew'
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

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Hero>Settings</Hero>
      <View style={s.card} accessibilityLabel="Network information">
        <Text style={s.label}>NETWORK</Text>
        <Text style={s.value}>Devnet</Text>
        <Text style={s.muted}>tSKR is a test token with no real value</Text>
      </View>
      <View style={s.card} accessibilityLabel="Test tokens">
        <Text style={s.label}>tSKR</Text>
        {selectedAccount ? <Text style={s.muted}>Sends 50 tSKR and 0.05 devnet SOL. No approval needed.</Text> : <View><Text style={s.muted}>Set your wallet to Devnet.</Text><WalletChoiceButtons failureCopy="Connection not completed. Try again." /></View>}
        <ActionButton tone="quiet" label={faucet.status === 'requesting' ? 'Sending…' : 'Get test tokens'} onPress={faucet.request} disabled={!selectedAccount || faucet.status === 'requesting'} loading={faucet.status === 'requesting'} accessibilityLabel="Get test tokens from the devnet faucet" style={s.explorerButton} />
        {faucet.status === 'done' && faucet.result && <Text style={s.muted} accessibilityLiveRegion="polite">{faucetLine(faucet.result)}</Text>}
      </View>
      <View style={s.card} accessibilityLabel="Program information">
        <Text style={s.label}>PROGRAM</Text>
        <Text style={s.value}>{shortProgramId(programId)}</Text>
        <ActionButton tone="quiet" label="View on Explorer" onPress={() => { void Linking.openURL(explorerUrl).catch(() => {}) }} accessibilityLabel="View program on Solana Explorer" style={s.explorerButton} />
      </View>
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
  version: { ...type.caption, color: color.faint, textAlign: 'center' },
}))
