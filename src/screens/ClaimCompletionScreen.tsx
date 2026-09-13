import { ScrollView, StyleSheet } from 'react-native'
import { Button, Card, Text } from 'react-native-paper'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { buildClaimCompletionViewModel } from '../features/rituals/claims/viewModels'
import { confirmationInboxTarget } from '../features/rituals/claims/routeHelpers'
export function ClaimCompletionScreen() { const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>(); const route = useRoute<RouteProp<RootStackParamList, 'ClaimCompletion'>>(); const view = buildClaimCompletionViewModel({ claimant: 'You', friendConfirmations: 0, threshold: 1 }); return <ScrollView contentContainerStyle={styles.content}><Text variant="headlineSmall">Claim preview</Text><Text style={styles.disclosure}>FIXTURE PREVIEW · NO SIGNATURE · NO STATE SAVED</Text><Card><Card.Content><Text variant="titleMedium">Your wallet signature</Text><Text>{view.walletSignature}</Text><Text variant="titleMedium">Friend confirmations</Text><Text>{view.friendConfirmations}</Text><Text style={styles.body}>You cannot confirm your own claim. A friend must review it.</Text><Button mode="contained" disabled={!view.canClaim} onPress={() => navigation.navigate(confirmationInboxTarget(route.params.ritualId, route.params.eventIndex).name, confirmationInboxTarget(route.params.ritualId, route.params.eventIndex).params)}>{view.ctaLabel}</Button></Card.Content></Card></ScrollView> }
const styles = StyleSheet.create({ content: { padding: 20, gap: 14 }, body: { marginVertical: 12 }, disclosure: { fontSize: 11, letterSpacing: 0.7 } })
