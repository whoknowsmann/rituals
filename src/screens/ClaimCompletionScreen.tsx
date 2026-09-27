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
import { walletHandoffNote, withWalletHandoff } from '../features/rituals/walletHandoff'
import { useRitualAction } from '../features/rituals/useRitualAction'
import { asyncStoragePendingActionStore } from '../features/rituals/recovery/pendingAction'
import { confirmationInboxTarget, parseEventRouteParams } from '../features/rituals/claims/routeHelpers'

type AccountLike = Readonly<{ publicKey: PublicKey }>
export function ClaimCompletionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute()
  const theme = useTheme()
  const styles = makeStyles(theme)
  const client = useRitualClient(); const { connection } = useConnection(); const { selectedAccount, walletPackage } = useAuthorization()
  const parsed = parseEventRouteParams((route as { params?: unknown }).params)
  const state = useRitualBundle(client, parsed?.ritualId ?? '', parsed?.eventIndex)
  const accountRef = useRef<AccountLike | null>(selectedAccount); accountRef.current = selectedAccount
  const makeDeps = useCallback(() => {
    if (!parsed || client.status !== 'ready' || !selectedAccount || state.status !== 'ready') throw new Error('Ritual or wallet is not ready')
    return buildRitualActionDeps({ client: client.client, ritualAddress: new PublicKey(parsed.ritualId), actor: selectedAccount.publicKey, kind: 'claim', eventIndex: parsed.eventIndex, claimant: selectedAccount.publicKey, pendingActionStore: asyncStoragePendingActionStore, authorizedActor: () => accountRef.current?.publicKey ?? null, getBlockHeight: () => connection.getBlockHeight('confirmed') })
  }, [client, selectedAccount, parsed, state.status, connection])
  const action = useRitualAction(makeDeps)
  const actionCopy = withWalletHandoff(action.copy, action.state.status, walletPackage)
  if (!parsed) return <SafeError onHome={() => navigation.navigate('RitualsHome')} message="That link is not a valid claim route." />
  if (state.status === 'loading') return <View style={styles.center}><Text>Reading the event from devnet…</Text></View>
  if (state.status === 'error' || !state.bundle?.event) return <SafeError onHome={() => navigation.navigate('RitualsHome')} onRetry={state.retry} message={state.message ?? 'The event is unavailable. Check your connection and try again.'} />
  const done = action.state.status === 'confirmed'
  const target = confirmationInboxTarget(parsed.ritualId, parsed.eventIndex)
  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Claim completion">
    <View accessibilityRole="header"><Text variant="headlineSmall">Showed up?</Text><Text style={styles.disclosure}>DEVNET · TEST TOKENS · AUTHORITATIVE RPC · PENDING ACTIONS SAVED</Text></View>
    <Card><Card.Content><Text variant="titleMedium">{state.bundle.event.account.status}</Text><Text style={styles.body}>Claim your completion. Your friend will confirm it from their wallet. Nothing is final until the authoritative readback succeeds.</Text><Text>Event {parsed.eventIndex + 1} · {new Date(Number(state.bundle.event.account.window.opens) * 1000).toLocaleString()}</Text><Text style={actionCopy.tone === 'warning' ? styles.error : styles.muted} accessibilityLiveRegion="polite">{action.state.status === 'awaiting-wallet' ? `${actionCopy.title} ${actionCopy.body}` : action.state.status === 'idle' ? walletHandoffNote(walletPackage) : actionCopy.body}</Text>{action.state.status === 'error' && action.state.retryable && <Button mode="outlined" onPress={action.reset}>Try again</Button>}{!done && <Button mode="contained" onPress={action.start} disabled={!selectedAccount || !action.canSubmit || action.isBusy} loading={action.isBusy}>Claim completion</Button>}{done && <Button mode="contained" onPress={() => navigation.navigate(target.name, target.params)}>Open confirmations</Button>}</Card.Content></Card>
  </ScrollView>
}
function SafeError({ onHome, onRetry, message }: { onHome: () => void; onRetry?: () => void; message: string }) { return <View style={stylesError.content}><Text variant="headlineSmall">This claim is unavailable</Text><Text>{message}</Text>{onRetry && <Button mode="outlined" onPress={onRetry}>Try again</Button>}<Button mode="contained" onPress={onHome}>Return home</Button></View> }
const stylesError = StyleSheet.create({ content: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' } })
const makeStyles = (theme: MD3Theme) => StyleSheet.create({ content: { padding: 20, gap: 14 }, body: { marginVertical: 12, lineHeight: 21 }, muted: { color: theme.colors.onSurfaceVariant, marginTop: 10 }, error: { color: theme.colors.error, marginTop: 10 }, disclosure: { color: theme.colors.onSurfaceVariant, fontSize: 11, letterSpacing: 0.7, marginTop: 6 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' } })
