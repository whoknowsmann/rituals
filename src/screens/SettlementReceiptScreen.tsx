import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { buildSettlementReceiptViewModel } from '../features/rituals/claims/viewModels'
import { getClaimFixture } from '../features/rituals/claims/fixtures'
import { parseEventRouteParams } from '../features/rituals/claims/routeHelpers'

export function SettlementReceiptScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute()
  const theme = useTheme()
  const styles = makeStyles(theme)
  const parsed = parseEventRouteParams((route as { params?: unknown }).params)
  const fixture = parsed && getClaimFixture(parsed.ritualId, parsed.eventIndex)
  if (!fixture || !['SETTLED', 'VOIDED'].includes(fixture.receipt.status)) return <View style={styles.error} accessibilityLiveRegion="polite"><Text variant="headlineSmall">Receipt unavailable</Text><Text>That link is not a valid settlement fixture.</Text><Button mode="contained" onPress={() => navigation.navigate('RitualsHome')} accessibilityLabel="Return home">Return home</Button></View>
  const view = buildSettlementReceiptViewModel(fixture.receipt)
  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Settlement receipt">
    <View accessibilityRole="header"><Text variant="headlineSmall">Settlement receipt</Text><Text style={styles.disclosure}>FIXTURE PREVIEW · NO TRANSFER · NO SETTLEMENT SUBMITTED</Text></View>
    <Card><Card.Content><Text variant="titleMedium">{view.status === 'settled' ? 'Settled' : view.status === 'voided' ? 'Voided' : 'Invalid receipt'}</Text><Text style={styles.body} accessibilityLiveRegion="polite">{view.explanation}</Text>{view.lines.map(([label, value]) => <View key={label} style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}</Card.Content></Card>
  </ScrollView>
}
const makeStyles = (theme: MD3Theme) => StyleSheet.create({ content: { padding: 20, gap: 14 }, body: { marginVertical: 12, lineHeight: 21 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginVertical: 7, flexWrap: 'wrap' }, label: { color: theme.colors.onSurfaceVariant, flexShrink: 1 }, value: { flexShrink: 1, textAlign: 'right' }, disclosure: { color: theme.colors.onSurfaceVariant, fontSize: 11, letterSpacing: 0.7, marginTop: 6 }, error: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' } })
