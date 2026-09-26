import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Share, StyleSheet, Text as RNText, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { ActivityIndicator, Button, Card, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import type { RitualRead } from '../data/rituals/ritualsRpc'
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
import { DEMO_CADENCE, describeCadence, firstEventStart } from '../domain/rituals/schedule'
import { rememberRitual } from '../features/rituals/authoritativeRituals'
import { RITUALS_DEVNET_STAKE_MINT } from '../data/rituals/programIds'
import { ActionButton, Footnote, MemberTile, Poster, PosterLine, Section, haptic } from '../components/crew'
import { color, memberColor, radius, space, type } from '../theme'

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
    const firstEventAt = firstEventStart({ cadence, referenceSeconds: Math.floor(Date.now() / 1000), memberCount: members.length })

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
  const [confirmedRitual, setConfirmedRitual] = useState<RitualRead | null>(null)
  useEffect(() => {
    if (!confirmedRitualAddress || client.status !== 'ready') { setConfirmedRitual(null); return }
    let active = true
    const refresh = () => { void client.client.readRitual(new PublicKey(confirmedRitualAddress)).then((value) => { if (active) setConfirmedRitual(value) }).catch(() => undefined) }
    refresh()
    const interval = setInterval(refresh, 3000)
    return () => { active = false; clearInterval(interval) }
  }, [confirmedRitualAddress, client])
  useEffect(() => {
    if (!confirmedRitualAddress || !parsed.ok) return
    void rememberRitual({ address: confirmedRitualAddress, title: parsed.value.title, requirement: parsed.value.requirement })
  }, [confirmedRitualAddress, parsed])
  const activateFallbackVisible = Boolean(confirmedRitual && confirmedRitual.account.status === 'Funding' && confirmedRitual.account.fundedMemberCount === confirmedRitual.account.members.length && confirmedRitual.account.fundedMembersBitmap === (1 << confirmedRitual.account.members.length) - 1)


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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Poster tint={memberColor(0)} kicker={confirmed ? 'Waiting for your crew' : 'Ready to start'} title={parsed.value.title}>
        <PosterLine label="Each person puts in" value={model.stake.replace(' per member', '')} />
        <PosterLine label="Schedule" value={describeCadence(cadence).split(' · ')[0]} />
      </Poster>

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

      <View accessibilityLabel="Member funding roster">
        <Section title="Your crew" aside={model.progress} />
        <View style={styles.crew} accessibilityLabel="Funding progress">
          {model.rows.map((row) => (
            <Pressable
              key={row.index}
              onPress={() => { haptic.light(); void Clipboard.setStringAsync(row.address) }}
              accessibilityRole="button"
              accessibilityLabel={`${row.name}, ${row.funding}. Tap to copy wallet address`}
              style={({ pressed }) => [styles.person, pressed && styles.pressed]}
            >
              <MemberTile index={row.index} label={row.name} />
              <View style={styles.identity}>
                <RNText style={styles.name}>{row.name}</RNText>
                <RNText style={styles.address}>{shortRosterAddress(row.address)}</RNText>
              </View>
              <RNText style={styles.status}>{confirmed && row.index === 0 ? 'In' : row.funding}</RNText>
            </Pressable>
          ))}
        </View>
        <RNText style={styles.note}>{model.activation}</RNText>
      </View>

      <View accessibilityLabel="Funding terms">
        <Section title="The deal" />
        <View style={styles.terms}>
          <TermRow label="Your stake" value={model.stake.replace(' per member', '')} />
          <TermRow label="Activation fee" value={model.fee.split(' · ')[1] ?? model.fee} hint={model.fee.split(' · ')[0]} />
          <TermRow label="Schedule" value={describeCadence(cadence)} last />
        </View>
      </View>

      <View style={[styles.status_, create.copy.tone === 'warning' && styles.statusWarn]} accessibilityLabel="Create status">
        <View style={styles.statusHeader}>
          {create.isBusy && <ActivityIndicator size="small" color={color.fg} accessibilityLabel="Working" />}
          <RNText style={styles.statusTitle}>{create.copy.title}</RNText>
        </View>
        <RNText style={create.copy.tone === 'warning' ? styles.warning : styles.muted} accessibilityLiveRegion="polite">
          {create.copy.body}
        </RNText>
        {confirmed && create.state.status === 'confirmed' && (
          <RNText style={styles.signature} selectable>
            {shortRosterAddress(create.state.ritualAddress)}
          </RNText>
        )}
      </View>

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
            {activateFallbackVisible && <Button mode="outlined" onPress={() => { if (confirmedRitualAddress) navigation.navigate('RitualAction', { ritualId: confirmedRitualAddress, phase: 'activate' }) }}>Activate when everyone is funded</Button>}
          </Card.Content>
        </Card>
      )}

      {blockedReason && !confirmed && (
        <Text style={styles.muted} accessibilityLiveRegion="polite">{blockedReason}</Text>
      )}

      {!confirmed && (
        <ActionButton
          label={create.isBusy ? 'Working…' : 'Create ritual'}
          onPress={create.start}
          disabled={!ready || !create.canSubmit || create.isBusy}
          loading={create.isBusy}
          accessibilityLabel="Create ritual onchain"
        />
      )}

      {create.state.status === 'error' && create.canSubmit && (
        <ActionButton label="Try again" tone="quiet" onPress={create.reset} accessibilityLabel="Try again" />
      )}

      {confirmed && (
        <ActionButton label="Done" tone="dark" onPress={() => navigation.navigate('RitualsHome')} />
      )}

      {!confirmed && <Button mode="text" textColor={color.muted} onPress={() => navigation.goBack()}>Edit member wallets</Button>}

      <Footnote>Devnet · TEST tokens have no real value</Footnote>
    </ScrollView>
  )
}

function TermRow({ label, value, hint, last }: { label: string; value: string; hint?: string; last?: boolean }) {
  return (
    <View style={[termStyles.row, !last && termStyles.rule]}>
      <RNText style={termStyles.label}>{label}</RNText>
      <View style={termStyles.right}>
        <RNText style={termStyles.value}>{value}</RNText>
        {hint ? <RNText style={termStyles.hint}>{hint}</RNText> : null}
      </View>
    </View>
  )
}

const termStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg, paddingVertical: 14 },
  rule: { borderBottomWidth: 1, borderBottomColor: color.line },
  label: { ...type.body, color: color.muted },
  right: { flexShrink: 1, alignItems: 'flex-end' },
  value: { ...type.bodyStrong, color: color.fg, textAlign: 'right' },
  hint: { ...type.caption, color: color.muted, textAlign: 'right', marginTop: 2 },
})

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
  screen: { backgroundColor: color.bg },
  content: { padding: space.screen, paddingBottom: 48, gap: space.md },
  card: { borderRadius: 18 },
  notice: { borderRadius: 18 },
  muted: { ...type.body, color: color.muted },
  warning: { ...type.bodyStrong, color: theme.colors.error },
  crew: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, paddingHorizontal: space.lg },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  pressed: { opacity: 0.6 },
  identity: { minWidth: 0, flex: 1 },
  name: { ...type.heading, color: color.fg },
  address: { ...type.caption, color: color.faint, marginTop: 1 },
  status: { ...type.caption, fontFamily: type.bodyStrong.fontFamily, color: color.muted },
  note: { ...type.caption, color: color.muted, marginTop: space.sm, paddingHorizontal: 2 },
  terms: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, paddingHorizontal: space.lg },
  status_: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, marginTop: space.md, gap: space.xs },
  statusWarn: { borderColor: color.danger, backgroundColor: color.dangerSoft },
  statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusTitle: { ...type.heading, color: color.fg },
  signature: { ...type.caption, color: color.muted, marginTop: space.sm },
  invite: { marginTop: 10, fontSize: 12, lineHeight: 18 },
  buttonRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 10 },
})