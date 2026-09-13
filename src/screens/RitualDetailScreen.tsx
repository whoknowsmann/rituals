import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Text } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { buildRitualDetailViewModel } from '../features/rituals/claims/viewModels'
import { claimCompletionTarget } from '../features/rituals/claims/routeHelpers'

const detail = { ritualId: 'ritual-weekly-run', title: 'Saturday morning miles', status: 'ACTIVE' as const, requirement: 'Run or walk 5 km together before Sunday evening.', nextClaimWindow: 'Saturday · 9:00 AM', stakeAtomicUnits: 1_250_000_000n, tokenDecimals: 6, tokenSymbol: 'TEST', confirmationMode: 'ONE_FRIEND' as const }
export function RitualDetailScreen() { const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>(); const view = buildRitualDetailViewModel(detail); return <ScrollView contentContainerStyle={styles.content}><Text variant="headlineSmall">{view.title}</Text><Text style={styles.disclosure}>DEVNET · TEST TOKENS · FIXTURE PREVIEW · NO REAL VALUE</Text><Card><Card.Content><Text variant="titleMedium">{view.statusLabel}</Text><Text style={styles.body}>{view.requirement}</Text><Text>Next claim window · {view.nextClaimWindow}</Text><Text>Stake per event · {view.stake}</Text><Text>{view.confirmationLabel}</Text><Button mode="contained" onPress={() => navigation.navigate(claimCompletionTarget(detail.ritualId, 0).name, claimCompletionTarget(detail.ritualId, 0).params)}>{view.ctaLabel}</Button></Card.Content></Card></ScrollView> }
const styles = StyleSheet.create({ content: { padding: 20, gap: 14 }, body: { marginVertical: 12, lineHeight: 21 }, disclosure: { fontSize: 11, letterSpacing: 0.7 } })
