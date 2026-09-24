import { useCallback, useRef } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { PublicKey } from '@solana/web3.js'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { useAuthorization } from '../utils/useAuthorization'
import { useConnection } from '../utils/ConnectionProvider'
import { useRitualBundle } from '../features/rituals/authoritativeRituals'
import { buildRitualActionDeps } from '../features/rituals/buildRitualActionDeps'
import { useRitualAction } from '../features/rituals/useRitualAction'
import { asyncStoragePendingActionStore } from '../features/rituals/recovery/pendingAction'
import { parseEventRouteParams } from '../features/rituals/claims/routeHelpers'

export function ConfirmationInboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute(); const theme = useTheme(); const styles = makeStyles(theme)
  const client = useRitualClient(); const { connection } = useConnection(); const { selectedAccount } = useAuthorization()
  const parsed = parseEventRouteParams((route as { params?: unknown }).params)
  const state = useRitualBundle(client, parsed?.ritualId ?? '', parsed?.eventIndex)
  const accountRef = useRef(selectedAccount); accountRef.current = selectedAccount
  const claimant = state.status === 'ready' ? state.bundle?.claims.find((entry) => entry.account !== null && (!selectedAccount || !entry.member.equals(selectedAccount.publicKey)))?.member ?? null : null
  const makeDeps = useCallback((kind: 'approve' | 'question') => {
    if (!parsed || client.status !== 'ready' || !selectedAccount || !claimant || state.status !== 'ready') throw new Error('Ritual or wallet is not ready')
    return buildRitualActionDeps({ client: client.client, ritualAddress: new PublicKey(parsed.ritualId), actor: selectedAccount.publicKey, kind, eventIndex: parsed.eventIndex, claimant, pendingActionStore: asyncStoragePendingActionStore, authorizedActor: () => accountRef.current?.publicKey ?? null, getBlockHeight: () => connection.getBlockHeight('confirmed') })
  }, [parsed, client, selectedAccount, claimant, state.status, connection])
  const approve = useRitualAction(() => makeDeps('approve'))
  const question = useRitualAction(() => makeDeps('question'))
  if (!parsed) return <SafeError onHome={() => navigation.navigate('RitualsHome')} message="That link is not a valid confirmation route." />
  if (state.status === 'loading') return <View style={styles.center}><Text>Reading confirmations from devnet…</Text></View>
  if (state.status === 'error' || !state.bundle?.event) return <SafeError onHome={() => navigation.navigate('RitualsHome')} onRetry={state.retry} message={state.message ?? 'Confirmations are unavailable. Check your connection and try again.'} />
  const claim = claimant ? state.bundle.claims.find((entry) => entry.member.equals(claimant))?.account : null
  const canAct = Boolean(claim && selectedAccount && claimant && claim.status === 'Pending')
  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Confirmation inbox">
    <View accessibilityRole="header"><Text variant="headlineSmall">Confirmation inbox</Text><Text style={styles.disclosure}>DEVNET · TEST TOKENS · AUTHORITATIVE RPC · PENDING ACTIONS SAVED</Text></View>
    <Card><Card.Content><Text variant="titleMedium">{claim ? `Claim from ${claimant?.toBase58().slice(0, 6)}…` : 'No pending claim'}</Text><Text>Event {parsed.eventIndex + 1} · {state.bundle.event.account.status}</Text><Text style={styles.body}>Friends confirm whether someone showed up. Your own claim cannot be confirmed by you.</Text><Text style={approve.copy.tone === 'warning' || question.copy.tone === 'warning' ? styles.error : styles.muted} accessibilityLiveRegion="polite">{approve.state.status === 'error' ? approve.copy.body : question.state.status === 'error' ? question.copy.body : approve.state.status === 'confirmed' ? 'Claim confirmed on-chain.' : question.state.status === 'confirmed' ? 'Claim questioned on-chain.' : 'Review the requirement, then choose an outcome.'}</Text>{approve.state.status === 'error' && approve.canSubmit && <Button mode="outlined" onPress={approve.reset}>Try again</Button>}{question.state.status === 'error' && question.canSubmit && <Button mode="outlined" onPress={question.reset}>Try again</Button>}<Button mode="contained" disabled={!canAct || approve.isBusy || question.isBusy || !approve.canSubmit} loading={approve.isBusy} onPress={approve.start}>Confirm showed up</Button><Button mode="outlined" disabled={!canAct || approve.isBusy || question.isBusy || !question.canSubmit} loading={question.isBusy} onPress={question.start}>Question this claim</Button></Card.Content></Card>
  </ScrollView>
}
function SafeError({ onHome, onRetry, message }: { onHome: () => void; onRetry?: () => void; message: string }) { return <View style={stylesError.content}><Text variant="headlineSmall">Confirmations unavailable</Text><Text>{message}</Text>{onRetry && <Button mode="outlined" onPress={onRetry}>Try again</Button>}<Button mode="contained" onPress={onHome}>Return home</Button></View> }
const stylesError = StyleSheet.create({ content: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' } })
const makeStyles = (theme: MD3Theme) => StyleSheet.create({ content: { padding: 20, gap: 14 }, body: { marginVertical: 12, lineHeight: 21 }, muted: { color: theme.colors.onSurfaceVariant, marginTop: 10 }, error: { color: theme.colors.error, marginTop: 10 }, disclosure: { color: theme.colors.onSurfaceVariant, fontSize: 11, letterSpacing: 0.7, marginTop: 6 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' } })
