import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { Button, Card, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import { PublicKey } from '@solana/web3.js'
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { useAuthorization } from '../utils/useAuthorization'
import { useConnection } from '../utils/ConnectionProvider'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { asyncStoragePendingActionStore } from '../features/rituals/recovery/pendingAction'
import { buildRitualActionDeps } from '../features/rituals/buildRitualActionDeps'
import { useRitualAction } from '../features/rituals/useRitualAction'
import type { RitualRead } from '../data/rituals/ritualsRpc'

type Props = NativeStackScreenProps<RootStackParamList, 'RitualAction'>
const labels: Record<Props['route']['params']['phase'], string> = { fund: 'Fund your stake', activate: 'Activate ritual', 'initialize-event': 'Open current event', claim: 'Claim completion', approve: 'Confirm showed up', question: 'Question this claim', finalize: 'Settle event' }

export function RitualActionScreen({ route }: Props) {
  const styles = makeStyles(useTheme()); const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>(); const client = useRitualClient(); const { selectedAccount } = useAuthorization(); const { connection } = useConnection()
  const [read, setRead] = useState<RitualRead | null>(null); const [readError, setReadError] = useState<string | null>(null); const [reload, setReload] = useState(0); const mounted = useRef(true); const accountRef = useRef(selectedAccount); accountRef.current = selectedAccount
  const ritualAddress = useMemo(() => { try { return new PublicKey(route.params.ritualId) } catch { return null } }, [route.params.ritualId]); const kind = route.params.phase
  useEffect(() => () => { mounted.current = false }, [])
  useEffect(() => { if (client.status !== 'ready' || !ritualAddress) { setReadError(client.status === 'ready' ? 'This Ritual address is invalid.' : client.reason); return } setReadError(null); void client.client.readRitual(ritualAddress).then((value) => { if (mounted.current) setRead(value) }).catch(() => { if (mounted.current) setReadError('The Ritual could not be read from devnet. Check your connection and try again.') }) }, [client, ritualAddress, reload])
  const makeDeps = useCallback(() => {
    if (client.status !== 'ready' || !selectedAccount || !read || !ritualAddress) throw new Error('Ritual or wallet is not ready')
    const eventIndex = route.params.eventIndex ?? read.account.currentEventIndex
    const claimant = route.params.claimant ? new PublicKey(route.params.claimant) : selectedAccount.publicKey
    const memberSource = kind === 'fund' ? getAssociatedTokenAddressSync(read.account.stakeMint, selectedAccount.publicKey) : undefined
    const destinationTokenAccounts = kind === 'finalize' ? read.account.members.map((member) => getAssociatedTokenAddressSync(read.account.stakeMint, member)) : undefined
    return buildRitualActionDeps({ client: client.client, ritualAddress, actor: selectedAccount.publicKey, kind, memberSource, eventIndex, claimant, destinationTokenAccounts, pendingActionStore: asyncStoragePendingActionStore, authorizedActor: () => accountRef.current?.publicKey ?? null, getBlockHeight: () => connection.getBlockHeight('confirmed') })
  }, [client, selectedAccount, read, ritualAddress, route.params, kind, connection])
  const action = useRitualAction(makeDeps); const progress = read ? `${read.account.fundedMemberCount}/${read.account.members.length} members funded` : 'Reading current Ritual state…'; const ready = client.status === 'ready' && Boolean(selectedAccount) && Boolean(read); const done = action.state.status === 'confirmed'
  return <ScrollView contentContainerStyle={styles.content}><Text variant="headlineMedium" accessibilityRole="header">{labels[kind]}</Text><Text style={styles.muted}>Read the current Ritual before every action. Stake, show up, get it back, friends confirm.</Text><Card style={styles.card} accessibilityLabel="Authoritative Ritual state"><Card.Content><Text variant="titleLarge">{progress}</Text><Text>{read ? `Status · ${read.account.status}` : 'No authoritative read yet.'}</Text>{read?.account.members.map((member, index) => <View key={member.toBase58()} style={styles.row}><Text>Member {index + 1} · {member.toBase58().slice(0, 5)}…</Text><Text>{(read.account.fundedMembersBitmap & (1 << index)) !== 0 ? 'Funded' : 'Waiting'}</Text></View>)}{readError && <><Text style={styles.error} accessibilityLiveRegion="polite">{readError}</Text><Button mode="outlined" onPress={() => setReload((value) => value + 1)}>Try again</Button></>}</Card.Content></Card><Card style={styles.card}><Card.Content><Text variant="titleMedium">{action.copy.title}</Text><Text style={action.copy.tone === 'warning' ? styles.error : styles.muted} accessibilityLiveRegion="polite">{action.copy.body}</Text>{action.state.status === 'error' && action.state.retryable && <Button mode="outlined" onPress={action.reset}>Try again</Button>}{done && <Text style={styles.success}>Authoritative readback complete.</Text>}</Card.Content></Card>{!done && <Button mode="contained" onPress={action.start} disabled={!ready || !action.canSubmit || action.isBusy} loading={action.isBusy}>{action.isBusy ? 'Working…' : labels[kind]}</Button>}{done && <Button mode="contained" onPress={() => navigation.navigate('RitualsHome')}>Done</Button>}<Text style={styles.disclosure}>DEVNET · TEST TOKENS HAVE NO REAL VALUE</Text></ScrollView>
}
const makeStyles = (theme: MD3Theme) => StyleSheet.create({ content: { padding: 20, gap: 14 }, card: { borderRadius: 18 }, muted: { color: theme.colors.onSurfaceVariant, lineHeight: 20, marginTop: 8 }, progress: { fontSize: 24, fontWeight: '800', marginVertical: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, gap: 10 }, error: { color: theme.colors.error, lineHeight: 20, marginTop: 8 }, success: { color: theme.colors.primary, fontWeight: '700', marginTop: 10 }, disclosure: { color: theme.colors.onSurfaceVariant, fontSize: 11, textAlign: 'center' } })
