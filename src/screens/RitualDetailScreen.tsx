import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { useRitualBundle, formatAtomic, nextEventLabel, statusLabel } from '../features/rituals/authoritativeRituals'
import { claimCompletionTarget, parseRitualRouteParams } from '../features/rituals/claims/routeHelpers'

export function RitualDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute()
  const theme = useTheme()
  const parsed = parseRitualRouteParams((route as { params?: unknown }).params)
  const client = useRitualClient()
  const state = useRitualBundle(client, parsed?.ritualId ?? '', undefined)
  const styles = makeStyles(theme)
  if (!parsed) return <SafeError onHome={() => navigation.navigate('RitualsHome')} message="That link is not a valid Ritual address." />
  if (state.status === 'loading') return <View style={styles.center}><Text>Reading this Ritual from devnet…</Text></View>
  if (state.status === 'error' || !state.bundle) return <SafeError onHome={() => navigation.navigate('RitualsHome')} onRetry={state.retry} message={state.message ?? 'The Ritual could not be read. Check your connection and try again.'} />
  const { bundle } = state
  const eventIndex = bundle.event?.account.eventIndex ?? bundle.ritual.account.currentEventIndex
  const target = claimCompletionTarget(parsed.ritualId, eventIndex)
  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Ritual detail">
    <View accessibilityRole="header"><Text variant="headlineSmall">Ritual</Text><Text style={styles.disclosure}>DEVNET · TEST TOKENS · AUTHORITATIVE RPC · NO REAL VALUE</Text></View>
    <Card><Card.Content><Text variant="titleMedium">{statusLabel(bundle.ritual.account.status)}</Text><Text style={styles.body}>Members show up, then friends confirm it. Your stake is held by the Ritual until each event is resolved.</Text><Text>Stake per member · {formatAtomic(bundle.ritual.account.memberTotalStake, bundle.ritual.account.stakeDecimals)}</Text><Text>Funding · {bundle.ritual.account.fundedMemberCount} of {bundle.ritual.account.members.length}</Text><Text>Next event · {nextEventLabel(bundle)}</Text><Text>{bundle.event ? `Event status · ${bundle.event.account.status}` : 'The current event has not been initialized.'}</Text>{!bundle.event && bundle.ritual.account.status === 'Active' && <Button mode="contained-tonal" onPress={() => navigation.navigate('RitualAction', { ritualId: parsed.ritualId, phase: 'initialize-event', eventIndex })}>Initialize event</Button>}{bundle.event?.account.status === 'Resolving' && <Button mode="contained-tonal" onPress={() => navigation.navigate('RitualAction', { ritualId: parsed.ritualId, phase: 'finalize', eventIndex })}>Settle event</Button>}<Button mode="contained" disabled={!bundle.event || bundle.event.account.status !== 'Claiming'} onPress={() => navigation.navigate(target.name, target.params)} accessibilityLabel="Claim completion">I did it</Button></Card.Content></Card>
  </ScrollView>
}
function SafeError({ onHome, onRetry, message }: { onHome: () => void; onRetry?: () => void; message: string }) { return <View style={stylesError.content} accessibilityLiveRegion="polite"><Text variant="headlineSmall">This ritual is unavailable</Text><Text>{message}</Text>{onRetry && <Button mode="outlined" onPress={onRetry}>Try again</Button>}<Button mode="contained" onPress={onHome} accessibilityLabel="Return home">Return home</Button></View> }
const stylesError = StyleSheet.create({ content: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' } })
const makeStyles = (_theme: MD3Theme) => StyleSheet.create({ content: { padding: 20, gap: 14 }, body: { marginVertical: 12, lineHeight: 21 }, disclosure: { color: _theme.colors.onSurfaceVariant, fontSize: 11, letterSpacing: 0.7, marginTop: 6 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' } })
