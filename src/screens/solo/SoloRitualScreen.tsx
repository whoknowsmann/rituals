import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AppState, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native'
import { Keypair, PublicKey } from '@solana/web3.js'
import * as Clipboard from 'expo-clipboard'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../navigators/AppNavigator'
import { useAuthorization } from '../../utils/useAuthorization'
import { useDevnetMismatchAlert } from '../../features/rituals/useDevnetMismatchAlert'
import { useReminders } from '../../features/rituals/reminders/useReminders'
import { useReminderSettings } from '../../features/rituals/reminders/useReminderSettings'
import { reminderInputFromBundle } from '../../features/rituals/reminders/restore'
import { reminders } from '../../features/rituals/reminders/runtime'
import { useConnection } from '../../utils/ConnectionProvider'
import { useChainTime } from '../../features/rituals/useChainTime'
import { useRitualClient } from '../../features/rituals/client/useRitualClient'
import { asyncStoragePendingActionStore } from '../../features/rituals/recovery/pendingAction'
import { buildRitualActionDeps } from '../../features/rituals/buildRitualActionDeps'
import { useRitualAction } from '../../features/rituals/useRitualAction'
import { withWalletHandoff } from '../../features/rituals/walletHandoff'
import { forgetRitual, listKnownRituals, type KnownRitual } from '../../features/rituals/authoritativeRituals'
import { ritualTintAmong } from '../../features/rituals/home/ritualColours'
import { notesOffered, readSoloNotes, saveWeekNote, type SoloNotes } from '../../features/rituals/solo/notes/soloNotes'
import { SCOPE } from '../../features/rituals/productScope'
import { keptSaying } from '../../features/rituals/solo/sayings'
import { loadOrCreateSettler } from '../../features/rituals/solo/settler/settlerKey'
import { createSettlerClient } from '../../features/rituals/solo/settler/settlerClient'
import { settlerCanPay } from '../../features/rituals/solo/settler/settlerBudget'
import { autoSettleWeek } from '../../features/rituals/solo/settler/autoSettle'
import { DEMO_CLOCK_WARNING, settlementVisibleEnough } from '../../features/rituals/solo/settler/settlementVisibility'
import { shortRosterAddress } from '../../features/rituals/create/roster'
import { witnessShareMessage } from '../../features/rituals/solo/create/witnessShare'
import { formatAtomic } from '../../features/rituals/displayFormat'
import { ActionButton, Confetti, ErrorLine, Footnote, HoldButton, haptic, Poster, PosterLine, Stamp, WeekStrip } from '../../components/crew'
import { color, fonts, radius, space, type, themedStyles, useColors } from '../../theme'
import { soloRitualModel, type SoloRitualModel } from '../../features/rituals/solo/lifecycle/soloRitualModel'
import { buildSoloSkipDeps } from '../../features/rituals/solo/lifecycle/soloActionDeps'
import { useSoloRitualBundle } from '../../features/rituals/solo/lifecycle/useSoloRitualBundle'
import { useSoloDestinationOwner } from '../../features/rituals/solo/lifecycle/useSoloDestinationOwner'
import { confirmedStampAdvanced, confirmedStampNotYetRead, soloActionLanded, type SoloActionTarget } from '../../features/rituals/solo/lifecycle/actionReadback'
import { keptWeekOnScreen, missedWeekOnScreen, nextUpLine, punchCardCells, showDemoSpeedNotice, stampHoldState, titleWeekIndex } from './weekHero'

type Props = { route: { params: { ritualId: string } } }

export function SoloRitualScreen({ route }: Props) { const s = useS(); const color = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const focused = useIsFocused()
  const [appState, setAppState] = useState(AppState.currentState)
  useEffect(() => {
    const listener = AppState.addEventListener('change', setAppState)
    return () => listener.remove()
  }, [])
  const client = useRitualClient()
  const { connection } = useConnection()
  const { selectedAccount, walletPackage } = useAuthorization()
  const chainNow = useChainTime(connection, focused)
  const state = useSoloRitualBundle(client, route.params.ritualId)
  const reminderSettings = useReminderSettings()
  const accountRef = useRef(selectedAccount); accountRef.current = selectedAccount
  const [reload, setReload] = useState(0)
  const ritualAddress = useMemo(() => { try { return new PublicKey(route.params.ritualId) } catch { return null } }, [route.params.ritualId])
  const [soloNotes, setSoloNotes] = useState<SoloNotes | null>(null)
  const [noteInput, setNoteInput] = useState('')
  const removalOpen = useRef(false)
  const removalSaving = useRef(false)
  const [removalError, setRemovalError] = useState<string | null>(null)
  const [ritualTitle, setRitualTitle] = useState<string | null>(null)
  const [ritualNote, setRitualNote] = useState<string | null>(null)
  const [knownRituals, setKnownRituals] = useState<readonly KnownRitual[]>([])
  const noteInputRef = useRef(noteInput)
  noteInputRef.current = noteInput
  // No record (e.g. a create whose readback was slow) still offers the note.
  const notesOfferedRef = useRef(true)
  notesOfferedRef.current = notesOffered(soloNotes)
  const claimEventIndex = useRef<number | null>(null)
  // The last week this screen saw stamped on chain: its stamp stays the hero until the next week opens.
  const seenStamped = useRef<{ ritualId: string; week: number } | null>(null)
  const actionTargets = useRef<{ claim: SoloActionTarget | null; skip: SoloActionTarget | null; settle: SoloActionTarget | null }>({ claim: null, skip: null, settle: null })

  useFocusEffect(useCallback(() => {
    let active = true
    void readSoloNotes(route.params.ritualId).then((notes) => { if (active) setSoloNotes(notes) })
    void listKnownRituals().then((rituals) => {
      if (!active) return
      setKnownRituals(rituals)
      const known = rituals.find((item) => item.address === route.params.ritualId)
      setRitualTitle(known?.title ?? null)
      // The user's own description, if they wrote one (create step 1).
      setRitualNote(known?.requirement && known.requirement !== 'Do it, then check in before the week closes.' ? known.requirement : null)
    })
    return () => { active = false }
  }, [reload, route.params.ritualId]))
  // Resume re-reads a wallet result or a settlement completed while away.
  const retryRef = useRef(state.retry); retryRef.current = state.retry
  useEffect(() => { if (focused && appState === 'active') retryRef.current() }, [focused, appState])
  const read = state.status === 'ready' ? state.bundle : null
  const destinationOwner = useSoloDestinationOwner(route.params.ritualId, read?.ritual.account.forfeitDestination, read?.ritual.account.stakeMint)
  const model: SoloRitualModel | null = state.status === 'ready' && state.bundle && chainNow !== null
    ? soloRitualModel(state.bundle, chainNow, state.bundle.ritual.account.creator, destinationOwner) : null
  const { afterStamp: cancelWeekReminders } = useReminders({ ritualAddress: route.params.ritualId,
    eventIndex: read?.ritual.account.currentEventIndex, stamped: Boolean(model?.showedUp),
    schedule: read?.ritual.account.schedule, nowSeconds: chainNow ?? undefined,
    completed: read?.ritual.account.status === 'Completed' || read?.ritual.account.status === 'Ended',
    skippedEventIndex: read?.ritual.account.skipDeclared ? read.ritual.account.skipEventIndex : undefined })
  const makeSharedDeps = useCallback((kind: 'claim' | 'finalize' | 'initialize-event') => {
    if (client.status !== 'ready' || !selectedAccount || !ritualAddress || !read || !model) throw new Error('Ritual or wallet is not ready')
    actionTargets.current[kind === 'claim' ? 'claim' : 'settle'] = { kind, eventIndex: model.eventIndex, actor: selectedAccount.publicKey, ritualAddress: ritualAddress.toBase58() }
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
    actionTargets.current.skip = { kind: 'skip', eventIndex: model.eventIndex, actor: selectedAccount.publicKey, ritualAddress: ritualAddress.toBase58() }
    return buildSoloSkipDeps({ client: client.client, ritualAddress, actor: selectedAccount.publicKey, eventIndex: model.eventIndex, pendingActionStore: asyncStoragePendingActionStore, getBlockHeight: () => connection.getBlockHeight('confirmed'), authorizedActor: () => accountRef.current?.publicKey ?? null })
  }, [client, connection, model, ritualAddress, selectedAccount])
  const claim = useRitualAction(() => makeSharedDeps('claim'))
  const startClaim = useCallback(() => {
    claimEventIndex.current = model?.eventIndex ?? null
    claim.start()
  }, [claim.start, model?.eventIndex])
  const skip = useRitualAction(makeSkipDeps)
  // A week nobody checked in to has no event account yet; the first tap opens it
  // (one approval), the screen re-reads, and the next tap settles it.
  const settle = useRitualAction(() => makeSharedDeps(model?.needsEventInit ? 'initialize-event' : 'finalize'))
  // A generic cancellation is not evidence of a network mismatch.
  const failed = [claim, skip, settle].find((item) => item.state.status === 'error' && item.state.category === 'network-mismatch')?.state
  useDevnetMismatchAlert(failed ? 'error' : 'idle', failed && failed.status === 'error' ? failed.category : null, walletPackage)
  // One "already handled" digest per action. A single shared ref let a stale
  // confirmed stamp re-run after Settle and save an empty note over the real
  // one (phone run 2026-10-02).
  const handled = useRef<{ claim: string | null; skip: string | null; settle: string | null }>({ claim: null, skip: null, settle: null })
  useEffect(() => {
    if (claim.state.status === 'confirmed' && handled.current.claim !== claim.state.result.messageDigest) {
      handled.current.claim = claim.state.result.messageDigest
      const eventIndex = claimEventIndex.current
      if (eventIndex !== null && ritualAddress) void cancelWeekReminders(ritualAddress.toBase58(), eventIndex)
      const refresh = () => { setNoteInput(''); state.retry(); setReload((value) => value + 1) }
      if (eventIndex !== null && notesOfferedRef.current && ritualAddress && noteInputRef.current.trim().length > 0) {
        void saveWeekNote(ritualAddress.toBase58(), eventIndex, noteInputRef.current).catch(() => undefined).then(refresh)
      } else {
        refresh()
      }
    }
    if (skip.state.status === 'confirmed' && handled.current.skip !== skip.state.result.messageDigest) {
      handled.current.skip = skip.state.result.messageDigest
      const target = actionTargets.current.skip
      if (target) void cancelWeekReminders(target.ritualAddress, target.eventIndex)
      state.retry(); setReload((value) => value + 1)
    }
    if (settle.state.status === 'confirmed' && handled.current.settle !== settle.state.result.messageDigest) {
      handled.current.settle = settle.state.result.messageDigest
      state.retry(); setReload((value) => value + 1)
      // Opening a missed week is step one of two; clear it so the same button can settle.
      settle.reset()
    }
  }, [claim.state, ritualAddress, settle.state, skip.state, cancelWeekReminders])

  // Check both arrival orders: readback may precede the late wallet error.
  useEffect(() => {
    for (const [name, action] of [['claim', claim], ['skip', skip], ['settle', settle]] as const) {
      if (action.state.status === 'error' && !action.state.retryable && soloActionLanded(read, actionTargets.current[name])) action.observeReadback(route.params.ritualId)
    }
  }, [read, claim.state, skip.state, settle.state, route.params.ritualId])
  const unknownAction = [claim, skip, settle].some((action) => action.state.status === 'error' && !action.state.retryable)
  useEffect(() => {
    if (confirmedStampAdvanced(claim.state, actionTargets.current.claim, read)) claim.reset()
  }, [read, claim.state, claim.reset])
  useEffect(() => {
    if (!unknownAction) return
    state.retry()
    let remaining = 3
    const timer = setInterval(() => { state.retry(); if (--remaining === 0) clearInterval(timer) }, 3000)
    return () => clearInterval(timer)
  }, [unknownAction])
  const stampNotRead = confirmedStampNotYetRead(claim.state, actionTargets.current.claim, model)
  useEffect(() => {
    if (!stampNotRead) return
    const timer = setInterval(() => retryRef.current(), 2000)
    return () => clearInterval(timer)
  }, [stampNotRead])

  // The app's own settle key closes finished weeks: no wallet prompt. It is
  // pre-paid inside the create approval; without funds the manual button stays.
  const [settler, setSettler] = useState<Keypair | null>(null)
  const [settlerBalance, setSettlerBalance] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    void loadOrCreateSettler().then(async (key) => {
      if (!active) return
      setSettler(key)
      const balance = await connection.getBalance(key.publicKey, 'confirmed')
      if (active) setSettlerBalance(balance)
    }).catch(() => { if (active) setSettlerBalance(null) })
    return () => { active = false }
  }, [connection, reload])
  const maySettle = useRef<() => boolean>(() => false)
  maySettle.current = () => Boolean(model && settlementVisibleEnough(model, navigation.isFocused(), AppState.currentState))
  const settlerClient = useMemo(() => (settler ? createSettlerClient(connection, settler, () => maySettle.current()) : null), [connection, settler])
  const [autoSettling, setAutoSettling] = useState(false)
  const [autoRun, setAutoRun] = useState(0)
  const autoFailures = useRef(0)
  useEffect(() => { autoFailures.current = 0 }, [model?.eventIndex])
  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; maySettle.current = () => false } }, [])
  const canAutoSettle = Boolean(model && model.state === 'resolving/settle' && settlementVisibleEnough(model, focused, appState) && settler && settlerClient && read && ritualAddress && settlerBalance !== null && settlerCanPay(settlerBalance, model.needsEventInit) && autoFailures.current < 3)
  useEffect(() => {
    if (!canAutoSettle || autoSettling || !model || !settler || !settlerClient || !read || !ritualAddress) return
    setAutoSettling(true)
    const destinations = read.ritual.account.members.map((member) => getAssociatedTokenAddressSync(read.ritual.account.stakeMint, member))
    void autoSettleWeek({ client: settlerClient, ritualAddress, settler: settler.publicKey, eventIndex: model.eventIndex, needsEventInit: model.needsEventInit, destinationTokenAccounts: destinations, getBlockHeight: () => connection.getBlockHeight('confirmed'), mayContinue: () => maySettle.current() })
      .then((result) => result.ok, () => false)
      .then((ok) => {
        if (!mountedRef.current) return
        if (!ok && maySettle.current()) autoFailures.current += 1
        setAutoSettling(false)
        state.retry(); setReload((value) => value + 1)
        // Up to three tries (e.g. the chain clock is a second behind), then the manual button.
        if (!ok) setTimeout(() => { if (mountedRef.current) setAutoRun((value) => value + 1) }, 3000)
      })
  }, [canAutoSettle, model?.eventIndex, model?.needsEventInit, autoRun])
  const settlingByItself = autoSettling || canAutoSettle
  const showedUpBefore = useRef(false)
  // Celebrate only a stamp made on this screen and confirmed on chain, never
  // on merely opening a week that was already stamped.
  const [celebrate, setCelebrate] = useState(0)
  useEffect(() => {
    if (!model) return // the week clock re-syncing after a pause is not a new stamp
    if (model?.showedUp && !showedUpBefore.current) {
      haptic.success()
      if (claimEventIndex.current !== null && claimEventIndex.current === model.eventIndex) setCelebrate((value) => value + 1)
    }
    showedUpBefore.current = Boolean(model?.showedUp)
  }, [model?.showedUp])

  if (state.status === 'loading') return <Centered>Reading your ritual…</Centered>
  if (state.status === 'ready' && chainNow === null) return <Centered>Checking the week clock… Check your connection if this takes a while.</Centered>
  if (state.status === 'error' || !state.bundle || !model || chainNow === null) return <ErrorState message={state.message ?? 'This ritual could not be read.'} retry={state.retry} onHome={() => navigation.navigate('RitualsHome')} />
  const readyBundle = state.bundle
  const stampPending = claim.isBusy || stampNotRead
  const action = stampPending ? claim : model.state === 'resolving/settle' ? settle : model.canSkip ? skip : claim
  // A stamp in flight is about the person, not the transaction (Jack, 2026-10-06).
  const stamping = action === claim && (stampNotRead || action.state.status === 'submitted' || action.state.status === 'confirming')
  const actionCopy = stamping ? Object.freeze({ title: 'Stamping…', body: '', tone: 'progress' as const }) : withWalletHandoff(action.copy, action.state.status, walletPackage)
  const actionError = action.state.status === 'error' ? action.copy.body : null
  const readyForWallet = Boolean(selectedAccount && readyBundle.ritual.account.members.some((member) => member.equals(selectedAccount.publicKey)))
  const tint = ritualTintAmong(route.params.ritualId, knownRituals)
  // Only a finished ritual, or one another wallet made, can leave this phone's list; an active ritual of yours stays visible.
  const ended = model.state === 'ended'
  const removable = model.state === 'completed' || ended || Boolean(selectedAccount && !readyBundle.ritual.account.creator.equals(selectedAccount.publicKey))
  const removeFromPhone = () => {
    if (removalOpen.current || removalSaving.current) return
    removalOpen.current = true
    const release = () => { removalOpen.current = false }
    Alert.alert('Remove from this phone?', 'The ritual stays on chain. This only takes it off your list.', [
      { text: 'Cancel', style: 'cancel', onPress: release },
      { text: 'Remove', style: 'destructive', onPress: () => {
        if (removalSaving.current) return
        removalSaving.current = true
        void forgetRitual(route.params.ritualId)
          .then(() => navigation.reset({ index: 0, routes: [{ name: 'RitualsHome' }] }))
          .catch(() => setRemovalError('Could not remove it from this phone. Try again.'))
          .finally(() => { removalSaving.current = false; release() })
      } },
    ], { cancelable: true, onDismiss: release })
  }
  const holdState = stampHoldState(model, stampPending)
  const holdVisible = holdState !== 'hidden'
  const holdWaiting = holdState === 'waiting'
  // After a stamp: the stamp stays the hero, its cell reads ✓ at once, and one line says what happens next and when.
  if (model.showedUp) seenStamped.current = { ritualId: route.params.ritualId, week: model.eventIndex }
  const keptWeek = keptWeekOnScreen(model, seenStamped.current?.ritualId === route.params.ritualId ? seenStamped.current.week : null)
  const nextLine = holdWaiting ? null : nextUpLine(model, readyBundle.ritual.account.schedule, chainNow, keptWeek, settlingByItself, stampPending)
  const weekNote = soloNotes?.notes[String(keptWeek ?? model.eventIndex)] ?? null
  const witness = readyBundle.ritual.account.witness
  const canShareWitness = SCOPE.witness && Boolean(witness && selectedAccount && readyBundle.ritual.account.creator.equals(selectedAccount.publicKey))
  const shareAddress = ritualAddress?.toBase58() ?? route.params.ritualId
  const amountLabel = formatAtomic(model.amount, readyBundle.ritual.account.stakeDecimals)
  const ritualRemindersOn = Boolean(reminderSettings.preferences?.masterEnabled && reminderSettings.preferences.rituals[route.params.ritualId]?.enabled)
  const toggleRitualReminders = () => { void reminderSettings.update(async () => {
    if (chainNow === null) return false
    const input = reminderInputFromBundle({ address: route.params.ritualId, title: ritualTitle ?? 'Your ritual', requirement: '' }, readyBundle, chainNow)
    return input ? reminders.setRitualEnabled({ ...input, enabled: !ritualRemindersOn }) : false
  }) }

  return (
    <View style={s.root}>
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      {/* The poster is the hero; the line above it is the week, nothing else. */}
      <Text style={s.title} accessibilityRole="header">{model.state === 'funding' ? 'Solo ritual' : model.state === 'completed' ? 'Finished' : ended ? 'Ended' : `Week ${titleWeekIndex(model, keptWeek, readyBundle.ritual.account.skipDeclared ? readyBundle.ritual.account.skipEventIndex : null) + 1}`}</Text>
      <Poster tint={tint} kicker="YOUR RITUAL" title={ritualTitle ?? 'Your ritual'}>
        {ritualNote ? <Text style={s.posterNote}>{ritualNote}</Text> : null}
        <WeekStrip cells={punchCardCells(model.weekCells, model.showedUp, keptWeek)} tint={tint} onClosedWeekPress={(eventIndex) => navigation.navigate('SoloReceipt', { ritualId: route.params.ritualId, eventIndex })} />
        <PosterLine label="Stake per week" value={amountLabel} />
      </Poster>
      {showDemoSpeedNotice(model, stampPending) && <Text style={s.muted}>{model.demoSpeedNotice} Unstamped weeks are missed.</Text>}
      {!readyForWallet && !ended && <Text style={s.muted}>Connect the wallet that created this ritual to stamp it.</Text>}
      {canShareWitness && witness && (
        <View style={s.witnessCard}>
          <Text style={s.cardTitle}>Your witness</Text>
          <Text style={s.muted}>{shortRosterAddress(witness.toBase58())}</Text>
          <ActionButton label="Send to your witness" onPress={() => { void Share.share({ message: witnessShareMessage(ritualTitle ?? 'your ritual', shareAddress) }) }} accessibilityLabel="Send this ritual to your witness" />
          <ActionButton tone="quiet" label="Copy address" onPress={() => { void Clipboard.setStringAsync(shareAddress) }} accessibilityLabel="Copy ritual address" />
        </View>
      )}
      {renderState(model, witness, action, actionCopy, weekNote, stampPending, celebrate > 0 && model.showedUp, keptSaying(route.params.ritualId, keptWeek ?? model.eventIndex), amountLabel, keptWeek)}
      {nextLine && <Text style={s.muted}>{nextLine}</Text>}
      {model.lastClosedOutcome === 'missed' && model.state !== 'missed' && keptWeek === null && !ended && <View style={s.paper} accessibilityLiveRegion="polite"><Stamp kind="missed" note="That's a week, not a verdict." animate={false} /><Text style={s.muted}>{amountLabel} went to {model.destinationLabel}.</Text></View>}
      {actionError && (action.copy.tone === 'neutral' ? <Text style={s.muted} accessibilityLiveRegion="polite">{actionError}</Text> : <ErrorLine>{actionError}</ErrorLine>)}
      {action.state.status === 'error' && action.canSubmit && <ActionButton tone="quiet" label="Try again" onPress={action.reset} />}
      {holdVisible && notesOfferedRef.current && <TextInput value={noteInput} onChangeText={setNoteInput} placeholder="A line about this week (optional)" placeholderTextColor={color.faint} maxLength={280} style={s.weekNoteInput} accessibilityLabel="Optional note about this week" />}
      {holdVisible && <View style={s.holdArea}><Text style={s.muted}>{holdWaiting ? `Week ${model.eventIndex + 1} opens ${model.nextOpensLabel}` : model.stampTimeLeftLabel}</Text><HoldButton onComplete={startClaim} disabled={holdWaiting || !readyForWallet || claim.isBusy || !claim.canSubmit} label="HOLD TO STAMP" doneLabel="DONE" accessibilityLabel="Hold to stamp" size={200} /></View>}
      {model.state === 'resolving/settle' && !settlingByItself && <ActionButton tone="quiet" label={settle.isBusy ? 'Working…' : model.needsEventInit ? 'Close this week' : 'Settle this week'} onPress={settle.start} disabled={!readyForWallet || settle.isBusy || !settle.canSubmit} loading={settle.isBusy} />}
      {model.canSkip && <ActionButton tone="link" label={skip.isBusy ? 'Working…' : `Skip week ${model.eventIndex + 1}`} onPress={skip.start} disabled={!readyForWallet || skip.isBusy || !skip.canSubmit} loading={skip.isBusy} />}
      {model.lastClosedEventIndex !== null && <ActionButton tone="link" label={`See week ${model.lastClosedEventIndex + 1} receipt`} onPress={() => navigation.navigate('SoloReceipt', { ritualId: route.params.ritualId, eventIndex: model.lastClosedEventIndex! })} />}

      {readyBundle.ritual.account.status === 'Active' && model.state !== 'completed' && <ActionButton tone="link" label={`Reminders: ${ritualRemindersOn ? 'on' : 'off'}`} onPress={toggleRitualReminders} disabled={!reminderSettings.preferences?.masterEnabled || reminderSettings.busy || claim.isBusy || skip.isBusy || settle.isBusy} />}
      {reminderSettings.error && <Text style={s.muted} accessibilityLiveRegion="polite">{reminderSettings.error}</Text>}
      {removable && <ActionButton tone="link" label="Remove from this phone" onPress={removeFromPhone} />}
      {removalError && <ErrorLine>{removalError}</ErrorLine>}

      <Footnote>Devnet · tSKR is a test token with no real value</Footnote>
    </ScrollView>
    <Confetti fire={celebrate} originY={300} />
    </View>
  )
}

function renderState(model: SoloRitualModel, witness: PublicKey | null, action: ReturnType<typeof useRitualAction>, actionCopy: ReturnType<typeof withWalletHandoff>, weekNote: string | null, stampPending: boolean, freshStamp: boolean, keptLine: string, amountLabel: string, keptWeek: number | null) { const s = useS();
  // Handoff progress must also show before an event exists and while skipping.
  if (action.isBusy || stampPending) return <View style={s.card}><Text style={s.cardTitle}>{actionCopy.title}</Text>{actionCopy.body ? <Text style={s.muted}>{actionCopy.body}</Text> : null}</View>
  if (model.state === 'funding') return <View style={s.card}><Text style={s.cardTitle}>Waiting for funding</Text><Text style={s.muted}>This solo ritual is not active yet.</Text></View>
  // The stamp stays the hero from the moment it lands until the next week takes over (Jack, 2026-10-07).
  if (keptWeek !== null) return <View style={s.paper}><Stamp kind="showed-up" note={keptLine} animate={freshStamp} />{weekNote ? <Text style={s.weekNote}>{weekNote}</Text> : null}</View>
  if (model.state === 'waiting') return null
  // An open week with no event account yet needs no card either: the HOLD opens it.
  if (model.state === 'open-not-initialized') return null
  if (model.state === 'awaiting-witness') return <View style={s.card}><Text style={s.cardTitle}>Waiting for {witness ? 'your witness' : 'a witness'}</Text><Text style={s.muted}>They decide whether you showed up.</Text></View>
  if (model.weekSkipped || model.state === 'skipped') return <View style={s.paper}><Stamp kind="skipped" note="Your stake comes back." animate={false} /></View>
  if (missedWeekOnScreen(model, stampPending) !== null) return <View style={s.paper}><Stamp kind="missed" note="That's a week, not a verdict." animate={false} /></View>
  if (model.state === 'missed') return <View style={s.paper}><Stamp kind="missed" note="That's a week, not a verdict." animate={false} /><Text style={s.muted}>{amountLabel} went to {model.destinationLabel}.</Text></View>
  if (model.state === 'completed' || model.state === 'ended') return null
  if (action.state.status === 'confirmed') return <View style={s.card}><Text style={s.cardTitle}>Reading your stamp…</Text></View>
  // An open week needs no card: the big HOLD button says it all.
  return null
}

function Centered({ children }: { children: React.ReactNode }) { const s = useS(); return <View style={s.center}><Text style={s.muted}>{children}</Text></View> }
function ErrorState({ message, retry, onHome }: { message: string; retry: () => void; onHome: () => void }) { const s = useS(); return <View style={s.center}><Text style={s.title}>Ritual unavailable</Text><Text style={s.muted}>{message}</Text><ActionButton tone="quiet" label="Try again" onPress={retry} /><ActionButton tone="dark" label="Back to rituals" onPress={onHome} /></View> }

const useS = themedStyles((color) => StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg }, posterNote: { ...type.body, color: color.white, opacity: 0.9, marginBottom: space.sm }, holdArea: { alignItems: 'center', paddingVertical: space.lg, gap: space.md }, screen: { backgroundColor: color.bg }, content: { padding: space.screen, paddingBottom: 48, gap: space.md }, back: { ...type.heading, color: color.muted }, kicker: { ...type.label, color: color.muted }, title: { ...type.display, color: color.fg }, card: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.xs }, paper: { backgroundColor: color.paperMuted, borderRadius: radius.lg, padding: space.lg, gap: space.md }, holdCard: { backgroundColor: color.fg, borderRadius: radius.poster, padding: space.xl, alignItems: 'center', gap: space.sm }, witnessCard: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.sm }, cardTitle: { ...type.heading, color: color.fg }, holdCardTitle: { ...type.heading, color: color.onDark }, muted: { ...type.body, color: color.muted }, note: { ...type.caption, color: color.faint, textAlign: 'center' }, weekNote: { ...type.body, fontFamily: fonts.hand, color: color.fg }, weekNoteInput: { ...type.body, color: color.fg, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md }, center: { flex: 1, padding: space.screen, justifyContent: 'center', gap: space.md, backgroundColor: color.bg },
}))
