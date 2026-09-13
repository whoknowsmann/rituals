import { ScrollView, StyleSheet, View } from 'react-native'
import { Card, Text } from 'react-native-paper'
import { buildSettlementReceiptViewModel } from '../features/rituals/claims/viewModels'
import { useRoute, type RouteProp } from '@react-navigation/native'
import type { RootStackParamList } from '../navigators/AppNavigator'
const receipt = { status: 'SETTLED' as const, principal: 1_250_000n, bonus: 250_000n, forfeiture: 250_000n, futureStake: 1_250_000n, activationFee: 50_000n, tokenDecimals: 6, tokenSymbol: 'TEST', settlement: { kind: 'SETTLED' as const } }
export function SettlementReceiptScreen() { useRoute<RouteProp<RootStackParamList, 'SettlementReceipt'>>(); const view = buildSettlementReceiptViewModel(receipt); return <ScrollView contentContainerStyle={styles.content}><Text variant="headlineSmall">Settlement receipt</Text><Text style={styles.disclosure}>FIXTURE PREVIEW · NO SETTLEMENT WAS SUBMITTED</Text><Card><Card.Content><Text variant="titleMedium">{view.status === 'settled' ? 'Settled' : 'Voided'}</Text><Text style={styles.body}>{view.explanation}</Text>{view.lines.map(([label, value]) => <View key={label} style={styles.row}><Text>{label}</Text><Text>{value}</Text></View>)}</Card.Content></Card></ScrollView> }
const styles = StyleSheet.create({ content: { padding: 20, gap: 14 }, body: { marginVertical: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginVertical: 7 }, disclosure: { fontSize: 11, letterSpacing: 0.7 } })
