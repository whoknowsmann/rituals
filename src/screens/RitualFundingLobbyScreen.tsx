import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { ScrollView, Share, StyleSheet, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { ActivityIndicator, Button, Card, Divider, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { buildReviewViewModel } from '../features/rituals/create/reviewViewModel'
import { draftFieldsOf, parseRitualFundingLobbyRoute } from '../features/rituals/create/routeHelpers'
import { buildFundingLobbyModel, shortRosterAddress } from '../features/rituals/create/roster'
import { validateRitualDraft } from '../features/rituals/create/draftForm'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { useAuthorization } from '../utils/useAuthorization'
import { useConnection } from '../utils/ConnectionProvider'
import { usePendingRitualRecovery } from '../features/rituals/recovery/usePendingRitualRecovery'
import { asyncStoragePendingActionStore } from '../features/rituals/recovery/pendingAction'
import { useCreateRitual } from '../features/rituals/create/useCreateRitual'
import { buildCreateRitualDeps } from '../features/rituals/create/buildCreateDeps'
import { DEMO_CADENCE, describeCadence, nextWeekdayOccurrence } from '../domain/rituals/schedule'
import { rememberRitual } from '../features/rituals/authoritativeRituals'
import { RITUALS_DEVNET_STAKE_MINT } from '../data/rituals/programIds'

type Props = NativeStackScreenProps<RootStackParamList, 'RitualFundingLobby'>

export function RitualFundingLobbyScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const styles = makeStyles(useTheme())
  const client = useRitualClient()
  const { connection } = useConnection()
  const recovery = usePendingRitualRecovery(client, connection, asyncStoragePendingActionStore)
  const { selectedAccount } = useAuthorization()
  const accountRef = useRef(selectedAccount)
  accountRef.current = selectedAccount
  const parsed = useMemo(() => parseRitualFundingLobbyRoute(route.params), [route.params])

  // P0 demo uses the accelerated devnet cadence so a full lifecycle is
  // observable in one sitting. Always disclosed in the UI below.
  const cadence = DEMO_CADENCE

  const makeDeps = useCallback(() => {
    if (!parsed.ok) throw new Error('invalid ritual draft')
    const draft = validateRitualDraft(draftFieldsOf(parsed.value))
    if (!draft.ok) throw new Error('invalid ritual draft')
    if (client.status !== 'ready') throw new Error('client not ready')
    if (!selectedAccount) throw new Error('wallet not connected')

    const members = parsed.value.members.map((address) => new PublicKey(address))
    const firstEventAt = nextWeekdayOccurrence(Math.floor(Date.now() / 1000), new Date().getUTCDay())

    return buildCreateRitualDeps({
      client: client.client,
      creator: selectedAccount.publicKey,
      creatorTokenAccount: getAssociatedTokenAddressSync(RITUALS_DEVNET_STAKE_MINT, selectedAccount.publicKey),
      members,
      draft: draft.value,
      cadence,
      firstEventAt,
      pendingActionStore: asyncStoragePendingActionStore,
      authorizedActor: () => accountRef.current?.publicKey ?? null,
      getBlockHeight: () => connection.getBlockHeight('confirmed'),
    })
  }, [parsed, client, selectedAccount, cadence, connection])

  const create = useCreateRitual(makeDeps)

  const confirmed = create.state.status === 'confirmed'
  const invite = confirmed ? create.state.result.invite : undefined
  const confirmedRitualAddress = confirmed ? create.state.ritualAddress : null
  useEffect(() => {
    if (!confirmedRitualAddress || !parsed.ok) return
    void rememberRitual({ address: confirmedRitualAddress, title: parsed.value.title, requirement: parsed.value.requirement })
  }, [confirmedRitualAddress, parsed])

  if (!parsed.ok) return <InvalidLobby message={parsed.error} onHome={() => navigation.navigate('RitualsHome')} styles={styles} />
  const draft = validateRitualDraft(draftFieldsOf(parsed.value))
  if (!draft.ok) return <InvalidLobby message="This ritual draft is invalid." onHome={() => navigation.navigate('RitualsHome')} styles={styles} />
  const review = buildReviewViewModel(draftFieldsOf(parsed.value))
  if (!review) return <InvalidLobby message="This ritual preview is invalid." onHome={() => navigation.navigate('RitualsHome')} styles={styles} />

  const model = buildFundingLobbyModel({
    members: parsed.value.members,
    memberTotalStake: review.perMemberTotal.replace(' TEST', ''),
    activationFee: review.activationFee.replace(' TEST', ''),
    feePayerMode: draft.value.feePayerMode,
  })

  const walletConnected = Boolean(selectedAccount)
  const ready = client.status === 'ready' && walletConnected
  const blockedReason = client.status !== 'ready'
    ? (client.status === 'not-deployed' ? 'No authorized deployment is configured.' : client.reason)
    : !walletConnected ? 'Connect your wallet to create this ritual.' : null

  const copyInvite = useCallback(() => { if (invite) void Clipboard.setStringAsync(invite) }, [invite])
  const shareInvite = useCallback(() => { if (invite) void Share.share({ message: invite }) }, [invite])

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text variant="headlineMedium" accessibilityRole="header">Funding lobby</Text>
      <Text style={styles.muted}>Everyone reviews the same terms before any onchain funding.</Text>

      {recovery && (
        <Card style={styles.card} accessibilityLabel="Transaction recovery">
          <Card.Content>
            <Text variant="titleMedium">{recovery.title}</Text>
            <Text style={recovery.resolution.status === 'failed' || recovery.resolution.status === 'expired' ? styles.warning : styles.muted} accessibilityLiveRegion="polite">
              {recovery.body}
            </Text>
          </Card.Content>
        </Card>
      )}

      <Card style={styles.card} accessibilityLabel="Funding progress">
        <Card.Content>
          <Text variant="titleLarge">{model.progress}</Text>
          <Text style={styles.locked}>{model.activation}</Text>
        </Card.Content>
      </Card>

      <Card style={styles.card} accessibilityLabel="Member funding roster">
        <Card.Content>
          {model.rows.map((row) => (
            <View key={row.index} style={styles.row}>
              <View style={styles.identity}>
                <Text variant="labelLarge">{row.role}</Text>
                <Text style={styles.address}>{shortRosterAddress(row.address)}</Text>
              </View>
              <Text style={styles.status}>{row.funding}</Text>
            </View>
          ))}
        </Card.Content>
      </Card>

      <Card style={styles.card} accessibilityLabel="Funding terms">
        <Card.Content>
          <Text variant="titleMedium">Terms</Text>
          <Text style={styles.term}>{model.stake}</Text>
          <Text style={styles.term}>{model.fee}</Text>
          <Divider style={styles.divider} />
          <Text variant="labelLarge">Schedule</Text>
          <Text style={styles.muted}>{describeCadence(cadence)}</Text>
        </Card.Content>
      </Card>

      <Card style={styles.card} accessibilityLabel="Create status">
        <Card.Content>
          <View style={styles.statusHeader}>
            {create.isBusy && <ActivityIndicator size="small" accessibilityLabel="Working" />}
            <Text variant="titleMedium">{create.copy.title}</Text>
          </View>
          <Text style={create.copy.tone === 'warning' ? styles.warning : styles.muted} accessibilityLiveRegion="polite">
            {create.copy.body}
          </Text>
          {confirmed && create.state.status === 'confirmed' && (
            <Text style={styles.signature} selectable>
              {shortRosterAddress(create.state.ritualAddress)}
            </Text>
          )}
        </Card.Content>
      </Card>

      {invite && (
        <Card style={styles.card} accessibilityLabel="Ritual invite">
          <Card.Content>
            <Text variant="titleMedium">Invite your crew</Text>
            <Text style={styles.muted}>This invite is bound to the confirmed ritual rules. Members should verify the terms before funding.</Text>
            <Text selectable numberOfLines={3} style={styles.invite}>{invite}</Text>
            <View style={styles.buttonRow}>
              <Button mode="outlined" onPress={copyInvite} accessibilityLabel="Copy ritual invite">Copy invite</Button>
              <Button mode="contained-tonal" onPress={shareInvite} accessibilityLabel="Share ritual invite">Share invite</Button>
            </View>
            <Button mode="text" onPress={() => navigation.navigate('JoinRitual', { invite })}>Preview join terms</Button>
            <Button mode="outlined" onPress={() => { if (confirmedRitualAddress) navigation.navigate('RitualAction', { ritualId: confirmedRitualAddress, phase: 'activate' }) }}>Activate when everyone is funded</Button>
          </Card.Content>
        </Card>
      )}

      {blockedReason && !confirmed && (
        <Text style={styles.muted} accessibilityLiveRegion="polite">{blockedReason}</Text>
      )}

      {!confirmed && (
        <Button
          mode="contained"
          onPress={create.start}
          disabled={!ready || !create.canSubmit || create.isBusy}
          loading={create.isBusy}
          accessibilityLabel="Create ritual onchain"
        >
          {create.isBusy ? 'Working…' : 'Create ritual'}
        </Button>
      )}

      {create.state.status === 'error' && create.canSubmit && (
        <Button mode="outlined" onPress={create.reset} accessibilityLabel="Try again">Try again</Button>
      )}

      {confirmed && (
        <Button mode="contained" onPress={() => navigation.navigate('RitualsHome')}>Done</Button>
      )}

      <Text style={styles.muted}>
        Devnet · TEST tokens have no real value. The invite link becomes available only after onchain creation.
      </Text>

      {!confirmed && <Button mode="outlined" onPress={() => navigation.goBack()}>Edit member wallets</Button>}
    </ScrollView>
  )
}

function InvalidLobby({ message, onHome, styles }: { message: string; onHome: () => void; styles: ReturnType<typeof makeStyles> }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={styles.notice} accessibilityLabel="Invalid funding lobby">
        <Card.Content>
          <Text variant="headlineSmall">This funding lobby link is invalid</Text>
          <Text>{message} Nothing was saved and no transaction was submitted.</Text>
        </Card.Content>
      </Card>
      <Button mode="contained" onPress={onHome}>Home</Button>
    </ScrollView>
  )
}

const makeStyles = (theme: MD3Theme) => StyleSheet.create({
  content: { padding: 20, gap: 14 },
  card: { borderRadius: 18 },
  notice: { borderRadius: 18 },
  muted: { color: theme.colors.onSurfaceVariant, lineHeight: 20 },
  warning: { color: theme.colors.error, lineHeight: 20, fontWeight: '600' },
  locked: { color: theme.colors.error, marginTop: 8, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 10, flexWrap: 'wrap' },
  identity: { minWidth: 0, flexShrink: 1 },
  address: { fontWeight: '700', marginTop: 3 },
  status: { color: theme.colors.onSurfaceVariant },
  term: { fontWeight: '700', marginTop: 10 },
  divider: { marginVertical: 12 },
  statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  signature: { marginTop: 10, fontWeight: '700' },
  invite: { marginTop: 10, fontSize: 12, lineHeight: 18 },
  buttonRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 10 },
})