import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text as RNText, View } from 'react-native'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { useNavigation } from '@react-navigation/native'
import { PublicKey } from '@solana/web3.js'
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { useAuthorization } from '../utils/useAuthorization'
import { useConnection } from '../utils/ConnectionProvider'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { asyncStoragePendingActionStore } from '../features/rituals/recovery/pendingAction'
import { buildRitualActionDeps } from '../features/rituals/buildRitualActionDeps'
import { canBundleFundAndActivate } from '../features/rituals/fundActivationSelection'
import { useRitualAction } from '../features/rituals/useRitualAction'
import type { RitualRead } from '../data/rituals/ritualsRpc'
import { walletHandoffNote, withWalletHandoff } from '../features/rituals/walletHandoff'
import { ConnectWalletCard } from '../components/wallet/ConnectWalletCard'
import { fundingPeople } from '../features/rituals/crewView'
import { formatAtomic } from '../features/rituals/authoritativeRituals'
import { ActionButton, ErrorLine, Footnote, PeopleList, Section } from '../components/crew'
import { color, radius, space, type } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'RitualAction'>
// Button labels. Deliberately different from the headings so on-device automation (tapt) can't hit the title instead of the button.
const labels: Record<Props['route']['params']['phase'], string> = { fund: 'Approve my stake', activate: 'Start ritual', 'initialize-event': 'Open week', claim: 'Claim completion', approve: 'Confirm showed up', question: 'Question this claim', finalize: 'Settle week' }

export function RitualActionScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>(); const client = useRitualClient(); const { selectedAccount, walletPackage } = useAuthorization(); const { connection } = useConnection()
  const [read, setRead] = useState<RitualRead | null>(null); const [chainNow, setChainNow] = useState<number | null>(null); const [readError, setReadError] = useState<string | null>(null); const [reload, setReload] = useState(0); const mounted = useRef(true); const accountRef = useRef(selectedAccount); accountRef.current = selectedAccount
  const ritualAddress = useMemo(() => { try { return new PublicKey(route.params.ritualId) } catch { return null } }, [route.params.ritualId]); const kind = route.params.phase
  useEffect(() => () => { mounted.current = false }, [])
  useEffect(() => {
    if (client.status !== 'ready' || !ritualAddress) { setReadError(client.status === 'ready' ? 'invalid address' : client.reason); return }
    setReadError(null); setChainNow(null)
    void (async () => {
      try {
        const value = await client.client.readRitual(ritualAddress)
        let timestamp: number | null = null
        if (kind === 'fund') {
          const slot = await connection.getSlot('confirmed')
          timestamp = await connection.getBlockTime(slot)
        }
        if (!mounted.current) return
        setRead(value)
        setChainNow(timestamp)
      } catch {
        if (mounted.current) setReadError('read failed')
      }
    })()
  }, [client, ritualAddress, reload, kind, connection])
  const makeDeps = useCallback(() => {
    if (client.status !== 'ready' || !selectedAccount || !read || !ritualAddress) throw new Error('Ritual or wallet is not ready')
    const eventIndex = route.params.eventIndex ?? read.account.currentEventIndex
    const claimant = route.params.claimant ? new PublicKey(route.params.claimant) : selectedAccount.publicKey
    const memberSource = kind === 'fund' ? getAssociatedTokenAddressSync(read.account.stakeMint, selectedAccount.publicKey) : undefined
    const destinationTokenAccounts = kind === 'finalize' ? read.account.members.map((member) => getAssociatedTokenAddressSync(read.account.stakeMint, member)) : undefined
    return buildRitualActionDeps({ client: client.client, ritualAddress, actor: selectedAccount.publicKey, kind, memberSource, eventIndex, claimant, destinationTokenAccounts, pendingActionStore: asyncStoragePendingActionStore, authorizedActor: () => accountRef.current?.publicKey ?? null, getBlockHeight: () => connection.getBlockHeight('confirmed'), getUnixTimestamp: async () => { const slot = await connection.getSlot('confirmed'); const timestamp = await connection.getBlockTime(slot); if (timestamp === null) throw new Error('chain clock is unavailable'); return timestamp }, getTokenAccountAmount: async (address) => BigInt((await connection.getTokenAccountBalance(address, 'confirmed')).value.amount) })
  }, [client, selectedAccount, read, ritualAddress, route.params, kind, connection])
  const action = useRitualAction(makeDeps)
  const actionCopy = withWalletHandoff(action.copy, action.state.status, walletPackage)
  const lastMemberWillStart = kind === 'fund' && Boolean(read && selectedAccount && chainNow !== null && canBundleFundAndActivate(read.account, selectedAccount.publicKey, chainNow))
  const label = lastMemberWillStart ? 'Fund & start ritual' : labels[kind]
  const heading = lastMemberWillStart ? "You're the last one in" : headings[kind]
  const ready = client.status === 'ready' && Boolean(selectedAccount) && Boolean(read)
  const done = action.state.status === 'confirmed'
  const people = read ? fundingPeople(read.account, selectedAccount?.publicKey ?? null) : []
  const body = lastMemberWillStart ? 'Putting in your stake also starts the ritual. One approval.' : bodies[kind]
  const showPeople = kind === 'fund' || kind === 'activate'
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <RNText style={s.title} accessibilityRole="header">{heading}</RNText>
      <RNText style={s.muted}>{body}</RNText>
      <ConnectWalletCard reason="You approve this in your wallet. Nothing is sent until you do." />
      {showPeople && read && (
        <>
          <Section title="Your crew" aside={`${read.account.fundedMemberCount} of ${read.account.members.length} in`} />
          <PeopleList people={people} />
          {kind === 'fund' && <RNText style={s.note}>Your stake: {formatAtomic(read.account.memberTotalStake, read.account.stakeDecimals)}</RNText>}
        </>
      )}
      {!read && !readError && <RNText style={s.muted}>Opening this ritual…</RNText>}
      {readError && <><ErrorLine>We couldn't load this ritual. Check your connection and try again.</ErrorLine><ActionButton tone="quiet" label="Try again" onPress={() => setReload((value) => value + 1)} /></>}
      {action.state.status !== 'idle' && (
        <View style={[s.statusCard, actionCopy.tone === 'warning' && s.statusWarn]}>
          <RNText style={s.statusTitle}>{actionCopy.title}</RNText>
          <RNText style={s.muted} accessibilityLiveRegion="polite">{done ? doneCopy[kind] : actionCopy.body}</RNText>
        </View>
      )}
      {action.state.status === 'error' && action.state.retryable && <ActionButton tone="quiet" label="Try again" onPress={action.reset} />}
      {!done && action.state.status === 'idle' && ready && <RNText style={s.note}>{walletHandoffNote(walletPackage)}</RNText>}
      {!done && <ActionButton label={action.isBusy ? 'Working…' : label} onPress={action.start} disabled={!ready || !action.canSubmit || action.isBusy} loading={action.isBusy} accessibilityLabel={label} />}
      {done && <ActionButton tone="dark" label="Done" onPress={() => navigation.navigate('RitualsHome')} />}
      <Footnote>Devnet · tSKR is a test token with no real value</Footnote>
    </ScrollView>
  )
}

const headings: Record<Props['route']['params']['phase'], string> = { fund: 'Put in your stake', activate: 'Start the ritual', 'initialize-event': 'Open this week', claim: 'Check in', approve: 'They made it', question: 'Not sure they made it', finalize: 'Settle this week' }
const bodies: Record<Props['route']['params']['phase'], string> = {
  fund: "Your stake is held by the ritual, not by Rituals. Show up and it comes back to you.",
  activate: 'Everyone is in. Starting locks the schedule.',
  'initialize-event': 'Opens this week so everyone can check in.',
  claim: 'Tell your crew you showed up.',
  approve: 'Confirm your friend showed up.',
  question: 'Say you are not sure. Your crew decides.',
  finalize: 'Closes this week and sends stakes where the rules say.',
}
const doneCopy: Record<Props['route']['params']['phase'], string> = {
  fund: "You're in.", activate: 'The ritual has started.', 'initialize-event': 'This week is open.', claim: 'Checked in.', approve: 'Confirmed.', question: 'Questioned.', finalize: 'This week is settled.',
}

const s = StyleSheet.create({
  screen: { backgroundColor: color.bg },
  content: { padding: space.screen, paddingBottom: 48, gap: space.md },
  title: { ...type.display, color: color.fg },
  muted: { ...type.body, color: color.muted },
  note: { ...type.caption, color: color.muted, paddingHorizontal: 2 },
  statusCard: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.xs },
  statusWarn: { borderColor: color.danger, backgroundColor: color.dangerSoft },
  statusTitle: { ...type.heading, color: color.fg },
})
