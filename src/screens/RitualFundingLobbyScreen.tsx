import React, { useMemo } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { buildReviewViewModel } from '../features/rituals/create/reviewViewModel'
import { parseRitualFundingLobbyRoute } from '../features/rituals/create/routeHelpers'
import { buildFundingLobbyModel, fundingLobbyCta, shortRosterAddress } from '../features/rituals/create/roster'
import { validateRitualDraft } from '../features/rituals/create/draftForm'
import { useRitualClient } from '../features/rituals/client/useRitualClient'

type Props = NativeStackScreenProps<RootStackParamList, 'RitualFundingLobby'>
export function RitualFundingLobbyScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const styles = makeStyles(useTheme())
  const client = useRitualClient()
  const parsed = useMemo(() => parseRitualFundingLobbyRoute(route.params), [route.params])
  if (!parsed.ok) return <InvalidLobby message={parsed.error} onHome={() => navigation.navigate('RitualsHome')} styles={styles} />
  const draft = validateRitualDraft(parsed.value)
  if (!draft.ok) return <InvalidLobby message="This ritual draft is invalid." onHome={() => navigation.navigate('RitualsHome')} styles={styles} />
  const review = buildReviewViewModel(parsed.value)
  if (!review) return <InvalidLobby message="This ritual preview is invalid." onHome={() => navigation.navigate('RitualsHome')} styles={styles} />
  const model = buildFundingLobbyModel({ members: parsed.value.members, memberTotalStake: review.perMemberTotal.replace(' TEST', ''), activationFee: review.activationFee.replace(' TEST', ''), feePayerMode: draft.value.feePayerMode })
  const cta = fundingLobbyCta(client.status)
  return <ScrollView contentContainerStyle={styles.content}>
    <Text variant="headlineMedium" accessibilityRole="header">Funding lobby</Text>
    <Text style={styles.muted}>Everyone reviews the same terms before any onchain funding.</Text>
    <Card style={styles.card} accessibilityLabel="Funding progress"><Card.Content><Text variant="titleLarge">{model.progress}</Text><Text style={styles.locked}>{model.activation}</Text></Card.Content></Card>
    <Card style={styles.card} accessibilityLabel="Member funding roster"><Card.Content>{model.rows.map((row) => <View key={row.index} style={styles.row}><View style={styles.identity}><Text variant="labelLarge">{row.role}</Text><Text style={styles.address}>{shortRosterAddress(row.address)}</Text></View><Text style={styles.status}>{row.funding}</Text></View>)}</Card.Content></Card>
    <Card style={styles.card} accessibilityLabel="Funding terms"><Card.Content><Text variant="titleMedium">Terms</Text><Text style={styles.term}>{model.stake}</Text><Text style={styles.term}>{model.fee}</Text><Text style={styles.muted}>These terms are fixed for this preview. No funds or ritual are locked in this preview.</Text></Card.Content></Card>
    <Button mode="contained" disabled accessibilityLabel={cta}>{cta}</Button>
    <Text style={styles.muted}>The invite link becomes available only after onchain creation. There is no share or copy action for this local preview.</Text>
    <Button mode="outlined" onPress={() => navigation.goBack()}>Edit member wallets</Button><Button onPress={() => navigation.navigate('RitualsHome')}>Home</Button>
  </ScrollView>
}
function InvalidLobby({ message, onHome, styles }: { message: string; onHome: () => void; styles: ReturnType<typeof makeStyles> }) { return <ScrollView contentContainerStyle={styles.content}><Card style={styles.notice} accessibilityLabel="Invalid funding lobby"><Card.Content><Text variant="headlineSmall">This funding lobby link is invalid</Text><Text>{message} Nothing was saved and no transaction was submitted.</Text></Card.Content></Card><Button mode="contained" onPress={onHome}>Home</Button></ScrollView> }
const makeStyles = (theme: MD3Theme) => StyleSheet.create({ content: { padding: 20, gap: 14 }, card: { borderRadius: 18 }, notice: { borderRadius: 18 }, muted: { color: theme.colors.onSurfaceVariant, lineHeight: 20 }, locked: { color: theme.colors.error, marginTop: 8, fontWeight: '700' }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 10, flexWrap: 'wrap' }, identity: { minWidth: 0, flexShrink: 1 }, address: { fontWeight: '700', marginTop: 3 }, status: { color: theme.colors.onSurfaceVariant }, term: { fontWeight: '700', marginTop: 10 } })
