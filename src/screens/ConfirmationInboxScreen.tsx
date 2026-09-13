import { useCallback, useReducer } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { buildConfirmationInboxViewModel, confirmationInboxReducer } from '../features/rituals/claims/viewModels'
import { getClaimFixture } from '../features/rituals/claims/fixtures'
import { parseEventRouteParams } from '../features/rituals/claims/routeHelpers'

export function ConfirmationInboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute()
  const theme = useTheme()
  const [state, dispatch] = useReducer(confirmationInboxReducer, { action: 'idle' as const })
  const runLocalAction = useCallback((type: 'CONFIRM' | 'QUESTION') => {
    dispatch({ type: 'START' })
    queueMicrotask(() => dispatch({ type }))
  }, [])
  const parsed = parseEventRouteParams((route as { params?: unknown }).params)
  const fixture = parsed && getClaimFixture(parsed.ritualId, parsed.eventIndex)
  const styles = makeStyles(theme)
  if (!fixture) return <View style={styles.error} accessibilityLiveRegion="polite"><Text variant="headlineSmall">Confirmations unavailable</Text><Button mode="contained" onPress={() => navigation.navigate('RitualsHome')} accessibilityLabel="Return home">Return home</Button></View>
  const view = buildConfirmationInboxViewModel({ claimant: fixture.claimant, ritualTitle: fixture.detail.title, eventLabel: fixture.eventLabel, requirement: fixture.detail.requirement, threshold: fixture.threshold, confirmations: fixture.confirmations, claimStatus: fixture.claimStatus, viewer: fixture.viewer, action: state.action })
  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Confirmation inbox">
    <View accessibilityRole="header"><Text variant="headlineSmall">Confirmation inbox</Text><Text style={styles.disclosure}>FIXTURE PREVIEW · CONFIRM/QUESTION ARE LOCAL ONLY</Text></View>
    <Card><Card.Content><Text variant="titleMedium">{view.ritualTitle}</Text><Text>Claimant · {view.claimant}</Text><Text>{view.eventLabel} · {view.requirement}</Text><Text>Progress · {view.progress}</Text><Text style={styles.body} accessibilityLiveRegion="polite">{view.outcomeCopy ?? view.statusCopy}</Text><Button mode="contained" disabled={!view.canConfirm} onPress={() => runLocalAction('CONFIRM')} accessibilityLabel="Confirm claim preview">Confirm · Preview</Button><Button mode="outlined" disabled={!view.canQuestion} onPress={() => runLocalAction('QUESTION')} accessibilityLabel="Question claim preview">Question · Preview</Button><Text style={styles.muted}>No on-chain claim, persistence, wallet, or signature is used. Your own claim cannot be confirmed here.</Text></Card.Content></Card>
  </ScrollView>
}
const makeStyles = (theme: MD3Theme) => StyleSheet.create({ content: { padding: 20, gap: 14 }, body: { marginVertical: 12, lineHeight: 21 }, disclosure: { color: theme.colors.onSurfaceVariant, fontSize: 11, letterSpacing: 0.7, marginTop: 6 }, muted: { color: theme.colors.onSurfaceVariant, marginTop: 14, lineHeight: 20 }, error: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' } })
