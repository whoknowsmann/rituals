import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { buildRitualDetailViewModel } from '../features/rituals/claims/viewModels'
import { claimCompletionTarget, parseRitualRouteParams } from '../features/rituals/claims/routeHelpers'
import { getRitualFixture } from '../features/rituals/claims/fixtures'

export function RitualDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute()
  const theme = useTheme()
  const parsed = parseRitualRouteParams((route as { params?: unknown }).params)
  const fixture = parsed && getRitualFixture(parsed.ritualId)
  const styles = makeStyles(theme)
  if (!fixture) return <SafeError onHome={() => navigation.navigate('RitualsHome')} />
  const view = buildRitualDetailViewModel(fixture.detail)
  const target = claimCompletionTarget(fixture.ritualId, fixture.eventIndex)
  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Ritual detail">
    <View accessibilityRole="header"><Text variant="headlineSmall">{view.title}</Text><Text style={styles.disclosure}>DEVNET · TEST TOKENS · FIXTURE PREVIEW · NO REAL VALUE</Text></View>
    <Card><Card.Content><Text variant="titleMedium">{view.statusLabel}</Text><Text style={styles.body}>{view.requirement}</Text><Text>Next claim window · {view.nextClaimWindow}</Text><Text>Stake per event · {view.stake}</Text><Text>{view.confirmationLabel}</Text><Button mode="contained" onPress={() => navigation.navigate(target.name, target.params)} accessibilityLabel="Preview claim">{view.ctaLabel}</Button></Card.Content></Card>
  </ScrollView>
}
function SafeError({ onHome }: { onHome: () => void }) { return <View style={stylesError.content} accessibilityLiveRegion="polite"><Text variant="headlineSmall">This ritual is unavailable</Text><Text>That link is not a valid fixture route.</Text><Button mode="contained" onPress={onHome} accessibilityLabel="Return home">Return home</Button></View> }
const stylesError = StyleSheet.create({ content: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' } })
const makeStyles = (theme: MD3Theme) => StyleSheet.create({ content: { padding: 20, gap: 14 }, body: { marginVertical: 12, lineHeight: 21 }, disclosure: { color: theme.colors.onSurfaceVariant, fontSize: 11, letterSpacing: 0.7, marginTop: 6 } })
