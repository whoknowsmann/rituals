import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { useNavigation, useRoute } from '@react-navigation/native'
import { PublicKey } from '@solana/web3.js'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../navigators/AppNavigator'
import { useAuthorization } from '../../utils/useAuthorization'
import { useConnection } from '../../utils/ConnectionProvider'
import { useRitualClient } from '../../features/rituals/client/useRitualClient'
import { asyncStoragePendingActionStore } from '../../features/rituals/recovery/pendingAction'
import { buildRitualActionDeps } from '../../features/rituals/buildRitualActionDeps'
import { useRitualAction } from '../../features/rituals/useRitualAction'
import { walletHandoffNote, withWalletHandoff } from '../../features/rituals/walletHandoff'
import { formatAtomic } from '../../features/rituals/displayFormat'
import { ActionButton, ErrorLine, Footnote, HoldButton, haptic, Poster, PosterLine, Stamp, WeekStrip } from '../../components/crew'
import { color, memberColor, radius, space, type } from '../../theme'
import { soloRitualModel, type SoloRitualModel } from '../../features/rituals/solo/lifecycle/soloRitualModel'
import { buildSoloSkipDeps } from '../../features/rituals/solo/lifecycle/soloActionDeps'
import { useSoloRitualBundle } from '../../features/rituals/solo/lifecycle/useSoloRitualBundle'

type Props = { route: { params: { ritualId: string } } }

export function SoloRitualScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const client = useRitualClient()
  const { connection } = useConnection()
  const { selectedAccount, walletPackage } = useAuthorization()
  const [chainNow, setChainNow] = useState<number>(Math.floor(Date.now() / 1000))
  const state = useSoloRitualBundle(client, route.params.ritualId)
  const accountRef = useRef(selectedAccount); accountRef.current = selectedAccount
  const [reload, setReload] = useState(0)
  const ritualAddress = useMemo(() => { try { return new PublicKey(route.params.ritualId) } catch { return null } }, [route.params.ritualId])

  // Chain time is synced on load, then ticks locally so the week opens and
  // closes on screen without the user leaving and coming back.
  const chainOffset = useRef(0)
  useEffect(() => {
    let mounted = true
    void connection.getSlot('confirmed').then((slot) => connection.getBlockTime(slot)).then((timestamp) => {
      if (mounted && timestamp !== null) { chainOffset.current = timestamp - Math.floor(Date.now() / 1000); setChainNow(timestamp) }
    }).catch(() => {})
    const tick = setInterval(() => { if (mounted) setChainNow(Math.floor(Date.now() / 1000) + chainOffset.current) }, 1000)
    return () => { mounted = false; clearInterval(tick) }
  }, [connection, reload])

  const model: SoloRitualModel | null = state.status === 'ready' && state.bundle && selectedAccount
    ? soloRitualModel(state.bundle, chainNow, selectedAccount.publicKey)
    : state.status === 'ready' && state.bundle ? soloRitualModel(state.bundle, chainNow, null) : null
  const read = state.status === 'ready' ? state.bundle : null
  const makeSharedDeps = useCallback((kind: 'claim' | 'finalize' | 'initialize-event') => {
    if (client.status !== 'ready' || !selectedAccount || !ritualAddress || !read || !model) throw new Error('Ritual or wallet is not ready')
    const destinationTokenAccounts = kind === 'finalize'
      // The finalize builder appends the locked solo forfeit destination itself.
      ? read.ritual.account.members.map((member) => getAssociatedTokenAddressSync(read.ritual.account.stakeMint, member))
      : undefined
    return buildRitualActionDeps({
      client: client.client,
      ritualAddress,
      actor: selectedAccount.publicKey,
      kind,
      eventIndex: model.eventIndex,
      claimant: selectedAccount.publicKey,
      destinationTokenAccounts,
      pendingActionStore: asyncStoragePendingActionStore,
      authorizedActor: () => accountRef.current?.publicKey ?? null,
      getBlockHeight: () => connection.getBlockHeight('confirmed'),
    })
  }, [client, connection, model, read, ritualAddress, selectedAccount])
  const makeSkipDeps = useCallback(() => {
    if (client.status !== 'ready' || !selectedAccount || !ritualAddress || !model) throw new Error('Ritual or wallet is not ready')
    return buildSoloSkipDeps({ client: client.client, ritualAddress, actor: selectedAccount.publicKey, eventIndex: model.eventIndex, pendingActionStore: asyncStoragePendingActionStore, getBlockHeight: () => connection.getBlockHeight('confirmed'), authorizedActor: () => accountRef.current?.publicKey ?? null })
  }, [client, connection, model, ritualAddress, selectedAccount])
  const claim = useRitualAction(() => makeSharedDeps('claim'))
  const skip = useRitualAction(makeSkipDeps)
  // A week nobody checked in to has no event account yet; the first tap opens it
  // (one approval), the screen re-reads, and the next tap settles it.
  const settle = useRitualAction(() => makeSharedDeps(model?.needsEventInit ? 'initialize-event' : 'finalize'))
  const confirmedAction = useRef<string | null>(null)
  useEffect(() => {
    if (claim.state.status === 'confirmed' && confirmedAction.current !== claim.state.result.messageDigest) { confirmedAction.current = claim.state.result.messageDigest; state.retry(); setReload((value) => value + 1) }
    if (skip.state.status === 'confirmed' && confirmedAction.current !== skip.state.result.messageDigest) { confirmedAction.current = skip.state.result.messageDigest; state.retry(); setReload((value) => value + 1) }
    if (settle.state.status === 'confirmed' && confirmedAction.current !== settle.state.result.messageDigest) {
      confirmedAction.current = settle.state.result.messageDigest
      state.retry(); setReload((value) => value + 1)
      // Opening a missed week is step one of two; clear it so the same button can settle.
      settle.reset()
    }
  }, [claim.state, settle.state, skip.state])
  const showedUpBefore = useRef(false)
  useEffect(() => {
    if (model?.showedUp && !showedUpBefore.current) haptic.success()
    showedUpBefore.current = Boolean(model?.showedUp)
  }, [model?.showedUp])

  if (state.status === 'loading') return <Centered>Reading your ritual…</Centered>
  if (state.status === 'error' || !state.bundle || !model) return <ErrorState message={state.message ?? 'This ritual could not be read.'} retry={state.retry} onHome={() => navigation.navigate('RitualsHome')} />
  const readyBundle = state.bundle
  const action = model.state === 'resolving/settle' ? settle : model.canSkip ? skip : claim
  const actionCopy = withWalletHandoff(action.copy, action.state.status, walletPackage)
  const actionError = action.state.status === 'error' ? action.copy.body : null
  const readyForWallet = Boolean(selectedAccount && readyBundle.ritual.account.members.some((member) => member.equals(selectedAccount.publicKey)))
  const tint = memberColor(0)

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.back} onPress={() => navigation.goBack()}>‹</Text>
      <Text style={s.kicker}>{model.state === 'funding' ? 'SOLO RITUAL' : `WEEK ${model.eventIndex + 1}`}</Text>
      <Text style={s.title} accessibilityRole="header">{model.state === 'missed' ? 'That week is closed.' : 'Show up for yourself.'}</Text>
      <Poster tint={tint} kicker="YOUR PROMISE" title="Keep the promise">
        <WeekStrip cells={model.weekCells} tint={tint} />
        <PosterLine label="Your stake" value={formatAtomic(model.amount, readyBundle.ritual.account.stakeDecimals)} />
      </Poster>
      {renderState(model, readyBundle.ritual.account.witness, action, actionCopy, readyForWallet, walletPackage)}
      {actionError && <ErrorLine>{actionError}</ErrorLine>}
      {action.state.status === 'error' && action.canSubmit && <ActionButton tone="quiet" label="Try again" onPress={action.reset} />}
      {(model.state === 'claimable' || model.state === 'open-not-initialized') && !model.showedUp && <HoldButton onComplete={claim.start} disabled={!readyForWallet || claim.isBusy || !claim.canSubmit} label="HOLD" doneLabel="DONE" accessibilityLabel="Hold to stamp" />}
      {model.state === 'resolving/settle' && <ActionButton tone="quiet" label={settle.isBusy ? 'Working…' : model.needsEventInit ? 'Close this week' : 'Settle this week'} onPress={settle.start} disabled={!readyForWallet || settle.isBusy || !settle.canSubmit} loading={settle.isBusy} />}
      {model.canSkip && <ActionButton tone="quiet" label={skip.isBusy ? 'Working…' : 'Skip next week'} onPress={skip.start} disabled={!readyForWallet || skip.isBusy || !skip.canSubmit} loading={skip.isBusy} />}
      {model.lastClosedEventIndex !== null && <ActionButton tone="quiet" label={`See week ${model.lastClosedEventIndex + 1} receipt`} onPress={() => navigation.navigate('SoloReceipt', { ritualId: route.params.ritualId, eventIndex: model.lastClosedEventIndex! })} />}
      {(model.state === 'missed' || model.state === 'skipped') && <ActionButton tone="dark" label="Back to my rituals" onPress={() => navigation.navigate('RitualsHome')} />}
      {readyForWallet && action.state.status === 'idle' && model.state !== 'claimable' && <Text style={s.note}>{walletHandoffNote(walletPackage)}</Text>}
      <Footnote>Devnet · TEST tokens have no real value</Footnote>
    </ScrollView>
  )
}

function renderState(model: SoloRitualModel, witness: PublicKey | null, action: ReturnType<typeof useRitualAction>, actionCopy: ReturnType<typeof withWalletHandoff>, ready: boolean, walletPackage: string | null | undefined) {
  if (model.state === 'funding') return <View style={s.card}><Text style={s.cardTitle}>Waiting for funding</Text><Text style={s.muted}>This solo ritual is not active yet.</Text></View>
  if (model.state === 'waiting') return <View style={s.card}><Text style={s.cardTitle}>Next week opens {model.nextOpensLabel}</Text><Text style={s.muted}>Your promise is still here.</Text></View>
  if (model.state === 'open-not-initialized') return <View style={s.card}><Text style={s.cardTitle}>This week is open</Text><Text style={s.muted}>Your first check-in will open the week.</Text></View>
  if (model.state === 'awaiting-witness') return <View style={s.card}><Text style={s.cardTitle}>Waiting for {witness ? 'your witness' : 'a witness'}</Text><Text style={s.muted}>They decide whether you showed up.</Text></View>
  if (model.state === 'closing') return <View style={s.card}><Text style={s.cardTitle}>This week is closing</Text><Text style={s.muted}>{model.showedUp ? 'You showed up. You can settle it in a moment.' : 'The check-in window has closed. You can settle it in a moment.'}</Text></View>
  if (model.state === 'resolving/settle') return <View style={s.card}><Text style={s.cardTitle}>This week is ready to settle</Text><Text style={s.muted}>{model.showedUp ? 'Your stake comes back to you.' : 'The locked destination will receive the missed stake.'}</Text></View>
  if (model.state === 'skipped') return <View style={s.paper}><Stamp kind="skipped" note="Your stake comes back." animate={false} /></View>
  if (model.state === 'missed') return <View style={s.paper}><Stamp kind="missed" note="That's a week, not a verdict." animate={false} /><Text style={s.muted}>{model.destinationLabel} received that week's stake.</Text></View>
  if (model.showedUp) return <View style={s.paper}><Stamp kind="showed-up" note="You showed up." animate={action.state.status !== 'confirmed'} /></View>
  if (action.state.status === 'confirmed') return <View style={s.card}><Text style={s.cardTitle}>Checking this week</Text><Text style={s.muted}>Looking for the updated stamp.</Text></View>
  if (action.state.status !== 'idle') return <View style={s.card}><Text style={s.cardTitle}>{actionCopy.title}</Text><Text style={s.muted}>{action.state.status === 'awaiting-wallet' ? actionCopy.body : action.state.status === 'error' ? actionCopy.body : 'Getting this week ready…'}</Text></View>
  return <View style={s.holdCard}><Text style={s.cardTitle}>Make it official</Text><Text style={s.muted}>Hold to stamp this week.</Text>{ready ? <Text style={s.note}>{walletHandoffNote(walletPackage)}</Text> : null}</View>
}

function Centered({ children }: { children: React.ReactNode }) { return <View style={s.center}><Text style={s.muted}>{children}</Text></View> }
function ErrorState({ message, retry, onHome }: { message: string; retry: () => void; onHome: () => void }) { return <View style={s.center}><Text style={s.title}>Ritual unavailable</Text><Text style={s.muted}>{message}</Text><ActionButton tone="quiet" label="Try again" onPress={retry} /><ActionButton tone="dark" label="Back to my rituals" onPress={onHome} /></View> }

const s = StyleSheet.create({
  screen: { backgroundColor: color.bg }, content: { padding: space.screen, paddingBottom: 48, gap: space.md }, back: { ...type.heading, color: color.muted }, kicker: { ...type.label, color: color.muted }, title: { ...type.display, color: color.fg }, card: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.xs }, paper: { backgroundColor: color.paperMuted, borderRadius: radius.lg, padding: space.lg, gap: space.md }, holdCard: { backgroundColor: color.fg, borderRadius: radius.poster, padding: space.xl, alignItems: 'center', gap: space.sm }, cardTitle: { ...type.heading, color: color.fg }, holdCardTitle: { ...type.heading, color: color.onDark }, muted: { ...type.body, color: color.muted }, note: { ...type.caption, color: color.faint, textAlign: 'center' }, center: { flex: 1, padding: space.screen, justifyContent: 'center', gap: space.md, backgroundColor: color.bg },
})
