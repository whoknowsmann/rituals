import React, { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Text, TextInput, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { useAuthorization } from '../utils/useAuthorization'
import { useMobileWallet } from '../utils/useMobileWallet'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { fundingLobbyNavigationParams, parseRitualRosterRoute } from '../features/rituals/create/routeHelpers'
import { validateMemberRoster } from '../features/rituals/create/roster'

type Props = NativeStackScreenProps<RootStackParamList, 'RitualRoster'>

export function RitualRosterScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const styles = makeStyles(useTheme())
  const { selectedAccount } = useAuthorization()
  const { connect } = useMobileWallet()
  const client = useRitualClient()
  const parsed = useMemo(() => parseRitualRosterRoute(route.params), [route.params])
  const count = parsed.ok ? Number(parsed.value.memberCount) : 0
  const [friends, setFriends] = useState<string[]>(() => Array.from({ length: Math.max(0, count - 1) }, () => ''))
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const [connecting, setConnecting] = useState(false)

  if (!parsed.ok) return <SafeError message={parsed.error} onHome={() => navigation.navigate('RitualsHome')} styles={styles} />
  const draft = parsed.value
  const host = selectedAccount?.publicKey.toBase58() ?? ''
  const submit = () => {
    if (!selectedAccount) return
    const result = validateMemberRoster({ hostAddress: host, memberCount: count, friendAddresses: friends })
    if (!result.ok) { setErrors(result.errors); return }
    navigation.navigate('RitualFundingLobby', fundingLobbyNavigationParams(draft, result.value))
  }
  const doConnect = async () => { setConnecting(true); try { await connect() } finally { setConnecting(false) } }

  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text variant="headlineMedium" accessibilityRole="header">Add member wallets</Text>
    <Text style={styles.muted}>The host wallet is the connected account. Add each member in order.</Text>
    <Card style={styles.card} accessibilityLabel="Host wallet">
      <Card.Content><Text variant="labelLarge">Host</Text><Text style={styles.address}>{host ? `${host.slice(0, 5)}…${host.slice(-5)}` : 'Not connected'}</Text></Card.Content>
    </Card>
    {!selectedAccount && <Card style={styles.notice} accessibilityLabel="Connect wallet required"><Card.Content><Text variant="titleMedium">Connect your wallet to continue</Text><Text style={styles.muted}>The host must be a real connected wallet. No transaction will be prepared here.</Text><Button mode="contained" onPress={doConnect} loading={connecting} disabled={connecting}>Connect wallet</Button></Card.Content></Card>}
    {Array.from({ length: count - 1 }, (_, index) => <View key={index} style={styles.field}><TextInput label={`Friend wallet ${index + 1}`} value={friends[index] ?? ''} onChangeText={(value) => { setFriends((current) => { const next = [...current]; next[index] = value; return next }); setErrors((current) => { const next = { ...current }; delete next[`friend${index}`]; return next }) }} error={Boolean(errors[`friend${index}`])} accessibilityLabel={`Friend wallet ${index + 1}`} /><>{errors[`friend${index}`] && <Text style={styles.error} accessibilityLiveRegion="polite">{errors[`friend${index}`]}</Text>}</></View>)}
    {errors.roster && <Text style={styles.error} accessibilityLiveRegion="polite">{errors.roster}</Text>}
    <Card style={styles.notice} accessibilityLabel="Ritual readiness"><Card.Content><Text variant="titleMedium">{client.status === 'not-deployed' ? 'Local preview only' : client.status === 'ready' ? 'Deployment ready' : 'Rituals unavailable'}</Text><Text style={styles.muted}>{client.status === 'not-deployed' ? 'This roster is local preview data, not saved. No transaction can be prepared or submitted until deployment.' : client.status === 'ready' ? 'Wallet and network readiness are checked before creation.' : client.reason}</Text></Card.Content></Card>
    <Button mode="contained" onPress={submit} disabled={!selectedAccount}>Continue to funding lobby</Button>
    <Button mode="outlined" onPress={() => navigation.goBack()}>Back to review</Button>
  </ScrollView>
}

function SafeError({ message, onHome, styles }: { message: string; onHome: () => void; styles: ReturnType<typeof makeStyles> }) { return <ScrollView contentContainerStyle={styles.content}><Card style={styles.notice} accessibilityLabel="Invalid ritual roster"><Card.Content><Text variant="headlineSmall">This ritual link is invalid</Text><Text>{message} Nothing was saved and no transaction was submitted.</Text></Card.Content></Card><Button mode="contained" onPress={onHome}>Home</Button></ScrollView> }
const makeStyles = (theme: MD3Theme) => StyleSheet.create({ content: { padding: 20, gap: 14 }, card: { borderRadius: 18 }, notice: { borderRadius: 18 }, field: { minWidth: 0 }, muted: { color: theme.colors.onSurfaceVariant, lineHeight: 20 }, address: { fontWeight: '700', marginTop: 5 }, error: { color: theme.colors.error, fontSize: 12, marginTop: 4 } })
