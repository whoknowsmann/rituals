import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { Button, Card, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import { PublicKey } from '@solana/web3.js'
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { useAuthorization } from '../utils/useAuthorization'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { asyncStoragePendingActionStore } from '../features/rituals/recovery/pendingAction'
import { buildRitualActionDeps } from '../features/rituals/buildRitualActionDeps'
import { useRitualAction } from '../features/rituals/useRitualAction'
import type { RitualRead } from '../data/rituals/ritualsRpc'

type Props = NativeStackScreenProps<RootStackParamList, 'RitualAction'>

export function RitualActionScreen({ route }: Props) {
  const styles = makeStyles(useTheme())
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const client = useRitualClient()
  const { selectedAccount } = useAuthorization()
  const [read, setRead] = useState<RitualRead | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const mounted = useRef(true)
  const ritualAddress = useMemo(() => { try { return new PublicKey(route.params.ritualId) } catch { return null } }, [route.params.ritualId])
  const kind = route.params.phase

  useEffect(() => () => { mounted.current = false }, [])
  useEffect(() => {
    if (client.status !== 'ready' || !ritualAddress) return
    void client.client.readRitual(ritualAddress).then((value) => { if (mounted.current) setRead(value) }).catch(() => { if (mounted.current) setReadError('The ritual could not be read from devnet.') })
  }, [client, ritualAddress])

  const makeDeps = useCallback(() => {
    if (client.status !== 'ready' || !selectedAccount || !read) throw new Error('Ritual or wallet is not ready')
    return buildRitualActionDeps({
      client: client.client,
      ritualAddress: read.address,
      actor: selectedAccount.publicKey,
      kind,
      memberSource: kind === 'fund' ? getAssociatedTokenAddressSync(read.account.stakeMint, selectedAccount.publicKey) : undefined,
      pendingActionStore: asyncStoragePendingActionStore,
    })
  }, [client, selectedAccount, read, kind])
  const action = useRitualAction(makeDeps)
  const progress = read ? `${read.account.fundedMemberCount}/${read.account.members.length} members funded` : 'Reading funding progress…'
  const ready = client.status === 'ready' && Boolean(selectedAccount) && Boolean(read)
  const done = action.state.status === 'confirmed'

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text variant="headlineMedium" accessibilityRole="header">{kind === 'fund' ? 'Fund your stake' : 'Activate ritual'}</Text>
      <Text style={styles.muted}>Read the current Ritual account before every action. Stake, show up, get it back, friends confirm.</Text>
      <Card style={styles.card} accessibilityLabel="On-chain funding progress">
        <Card.Content>
          <Text variant="titleLarge">Funding progress</Text>
          <Text style={styles.progress}>{progress}</Text>
          {read?.account.members.map((member, index) => <View key={member.toBase58()} style={styles.row}><Text>Member {index + 1} · {member.toBase58().slice(0, 5)}…</Text><Text>{(read.account.fundedMembersBitmap & (1 << index)) !== 0 ? 'Funded' : 'Waiting'}</Text></View>)}
          {readError && <Text style={styles.error} accessibilityLiveRegion="polite">{readError}</Text>}
        </Card.Content>
      </Card>
      <Card style={styles.card} accessibilityLabel="Ritual action status">
        <Card.Content>
          <Text variant="titleMedium">{action.copy.title}</Text>
          <Text style={action.copy.tone === 'warning' ? styles.error : styles.muted} accessibilityLiveRegion="polite">{action.copy.body}</Text>
          {action.state.status === 'error' && action.state.retryable && <Button mode="outlined" onPress={action.reset}>Try again</Button>}
          {done && <Text style={styles.success}>Authoritative readback complete.</Text>}
        </Card.Content>
      </Card>
      {!done && <Button mode="contained" onPress={action.start} disabled={!ready || !action.canSubmit || action.isBusy} loading={action.isBusy} accessibilityLabel={kind === 'fund' ? 'Fund stake' : 'Activate ritual'}>{action.isBusy ? 'Working…' : kind === 'fund' ? 'Fund stake' : 'Activate ritual'}</Button>}
      {done && <Button mode="contained" onPress={() => navigation.navigate('RitualsHome')}>Done</Button>}
      <Text style={styles.disclosure}>DEVNET · TEST TOKENS HAVE NO REAL VALUE</Text>
    </ScrollView>
  )
}

const makeStyles = (theme: MD3Theme) => StyleSheet.create({
  content: { padding: 20, gap: 14 }, card: { borderRadius: 18 }, muted: { color: theme.colors.onSurfaceVariant, lineHeight: 20, marginTop: 8 }, progress: { fontSize: 24, fontWeight: '800', marginVertical: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, gap: 10 }, error: { color: theme.colors.error, lineHeight: 20, marginTop: 8 }, success: { color: theme.colors.primary, fontWeight: '700', marginTop: 10 }, disclosure: { color: theme.colors.onSurfaceVariant, fontSize: 11, textAlign: 'center' },
})
