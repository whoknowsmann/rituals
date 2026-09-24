import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { useAuthorization } from '../utils/useAuthorization'
import { useRitualBundle, eventLabel, formatAtomic, nextEventLabel } from '../features/rituals/authoritativeRituals'
import { parseEventRouteParams } from '../features/rituals/claims/routeHelpers'

export function SettlementReceiptScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute(); const theme = useTheme(); const styles = makeStyles(theme); const client = useRitualClient(); const { selectedAccount } = useAuthorization()
  const parsed = parseEventRouteParams((route as { params?: unknown }).params)
  const state = useRitualBundle(client, parsed?.ritualId ?? '', parsed?.eventIndex)
  if (!parsed) return <SafeError onHome={() => navigation.navigate('RitualsHome')} message="That link is not a valid receipt route." />
  if (state.status === 'loading') return <View style={styles.center}><Text>Reading the settlement from devnet…</Text></View>
  if (state.status === 'error' || !state.bundle?.event || !['Settled', 'Voided'].includes(state.bundle.event.account.status)) return <SafeError onHome={() => navigation.navigate('RitualsHome')} onRetry={state.retry} message={state.message ?? 'This event has not settled on-chain yet.'} />
  const { bundle } = state; const eventRead = bundle.event
  if (!eventRead || !['Settled', 'Voided'].includes(eventRead.account.status)) return <SafeError onHome={() => navigation.navigate('RitualsHome')} message="This event has not settled on-chain yet." />
  const event = eventRead.account; const decimals = bundle.ritual.account.stakeDecimals
  const claim = selectedAccount ? bundle.claims.find((entry) => entry.member.equals(selectedAccount.publicKey))?.account : null
  const confirmed = claim?.status === 'Confirmed'
  const principal = event.status === 'Voided' || confirmed ? bundle.ritual.account.perEventAllocation : 0n
  const bonus = event.status === 'Settled' && confirmed ? event.forfeitedTotal : 0n
  const forfeiture = event.status === 'Settled' && !confirmed ? bundle.ritual.account.perEventAllocation : 0n
  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Settlement receipt">
    <View accessibilityRole="header"><Text variant="headlineSmall">Settlement receipt</Text><Text style={styles.disclosure}>DEVNET · TEST TOKENS · AUTHORITATIVE RPC · NO PLATFORM SHARE</Text></View>
    <Card><Card.Content><Text variant="titleMedium">{event.status === 'Settled' ? 'Settled on-chain' : 'Voided on-chain'}</Text><Text style={styles.body}>{event.status === 'Settled' ? 'The event settled after the resolution window. Your principal, any bonus, and forfeiture are derived from the authoritative receipt.' : 'The event was voided. The authoritative program returned the exact principal.'}</Text>{([['Event', eventLabel(bundle)], ['Principal returned', formatAtomic(principal, decimals)], ['Bonus', formatAtomic(bonus, decimals)], ['Forfeiture', formatAtomic(forfeiture, decimals)], ['Remaining stake', formatAtomic(event.remainingStakeTotalAfter, decimals)], ['Event pool', formatAtomic(event.eventPool, decimals)], ['Next event', nextEventLabel(bundle)]] as const).map(([label, value]) => <View key={label} style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}</Card.Content></Card><Button mode="contained" onPress={() => navigation.navigate('RitualsHome')}>Done</Button>
  </ScrollView>
}
function SafeError({ onHome, onRetry, message }: { onHome: () => void; onRetry?: () => void; message: string }) { return <View style={stylesError.content}><Text variant="headlineSmall">Receipt unavailable</Text><Text>{message}</Text>{onRetry && <Button mode="outlined" onPress={onRetry}>Try again</Button>}<Button mode="contained" onPress={onHome}>Return home</Button></View> }
const stylesError = StyleSheet.create({ content: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' } })
const makeStyles = (theme: MD3Theme) => StyleSheet.create({ content: { padding: 20, gap: 14 }, body: { marginVertical: 12, lineHeight: 21 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginVertical: 7, flexWrap: 'wrap' }, label: { color: theme.colors.onSurfaceVariant, flexShrink: 1 }, value: { flexShrink: 1, textAlign: 'right' }, disclosure: { color: theme.colors.onSurfaceVariant, fontSize: 11, letterSpacing: 0.7, marginTop: 6 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' } })
