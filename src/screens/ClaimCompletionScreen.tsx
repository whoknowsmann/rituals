import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { buildClaimCompletionViewModel } from '../features/rituals/claims/viewModels'
import { confirmationInboxTarget, parseEventRouteParams } from '../features/rituals/claims/routeHelpers'
import { getClaimFixture } from '../features/rituals/claims/fixtures'

export function ClaimCompletionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute()
  const theme = useTheme()
  const parsed = parseEventRouteParams((route as { params?: unknown }).params)
  const fixture = parsed && getClaimFixture(parsed.ritualId, parsed.eventIndex)
  const styles = makeStyles(theme)
  if (!fixture) return <SafeError onHome={() => navigation.navigate('RitualsHome')} />
  const view = buildClaimCompletionViewModel({ claimant: fixture.claimant, friendConfirmations: fixture.confirmations, threshold: fixture.threshold })
  const target = confirmationInboxTarget(fixture.ritualId, fixture.eventIndex)
  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Claim preview">
    <View accessibilityRole="header"><Text variant="headlineSmall">Claim preview</Text><Text style={styles.disclosure}>FIXTURE PREVIEW · NO WALLET · NO SIGNATURE · NO STATE SAVED</Text></View>
    <Card><Card.Content><Text variant="titleMedium">Wallet</Text><Text>{view.walletSignature}</Text><Text variant="titleMedium">Friend confirmations</Text><Text>{view.friendConfirmations}</Text><Text style={styles.body}>Previewing this claim only prepares a local confirmation request. No wallet connection, signature, or state change is used.</Text><Button mode="contained" disabled={!view.canClaim} onPress={() => navigation.navigate(target.name, target.params)} accessibilityLabel="Preview claim and open confirmations">{view.ctaLabel}</Button></Card.Content></Card>
  </ScrollView>
}
function SafeError({ onHome }: { onHome: () => void }) { return <View style={stylesError.content} accessibilityLiveRegion="polite"><Text variant="headlineSmall">This claim is unavailable</Text><Text>That link is not a valid fixture route.</Text><Button mode="contained" onPress={onHome} accessibilityLabel="Return home">Return home</Button></View> }
const stylesError = StyleSheet.create({ content: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' } })
const makeStyles = (theme: MD3Theme) => StyleSheet.create({ content: { padding: 20, gap: 14 }, body: { marginVertical: 12, lineHeight: 21 }, disclosure: { color: theme.colors.onSurfaceVariant, fontSize: 11, letterSpacing: 0.7, marginTop: 6 } })
