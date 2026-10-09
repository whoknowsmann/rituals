import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { ActivityIndicator, Button, Icon, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { ActionButton, Footnote, Section, WeekStrip, weekSummary, type WeekCell } from '../components/crew'
import { useRitualClient, type RitualClientState } from '../features/rituals/client/useRitualClient'
import { useDevnetFaucet } from '../features/rituals/faucet/useDevnetFaucet'
import { faucetLine } from '../features/rituals/faucet/devnetFaucet'
import { readTestTokenBalance } from '../features/rituals/faucet/testTokenBalance'
import { homePrimaryAction } from '../features/rituals/home/homeFaucet'
import { listKnownRituals, loadKnownRitualBundles, type KnownRitual } from '../features/rituals/authoritativeRituals'
import { ritualTintAmong } from '../features/rituals/home/ritualColours'
import { homeCreateTarget } from '../features/rituals/create/routeHelpers'
import { homeRitualTarget } from '../features/rituals/home/homeViewModel'
import { useConnection } from '../utils/ConnectionProvider'
import { useAuthorization } from '../utils/useAuthorization'
import { useChainTime } from '../features/rituals/useChainTime'
import { usePendingRitualRecovery } from '../features/rituals/recovery/usePendingRitualRecovery'
import { applyWalletReminderPlan, walletReminderPlan } from '../features/rituals/reminders/restore'
import { DEMO_SEASON } from '../data/rituals/demoConfig'
import type { SeasonAccountView } from '../data/rituals/accounts'
import { readSeason } from '../features/rituals/solo/season/readSeason'
import { seasonStatusForError } from '../features/rituals/solo/season/seasonState'
import { seasonCountForNow, seasonParticipantLine } from '../features/rituals/solo/season/seasonViewModel'
import { SeasonCard } from '../features/rituals/solo/season/SeasonCard'
import { SCOPE } from '../features/rituals/productScope'
import { readSoloWeekOutcomes, soloHomeCells, type SoloWeekOutcome } from '../features/rituals/home/soloHistory'
import { tileMoneyLine } from '../features/rituals/home/tileMoney'
import { homeSections, homeTilePresentation, ritualsForWallet } from '../features/rituals/home/homeSections'
import { withReadRetry } from '../features/rituals/client/resilientRead'
import { useCatchup } from '../features/rituals/solo/settler/useCatchup'
import { PublicKey, type Connection } from '@solana/web3.js'
import { radius, space, type, useColors, type Palette } from '../theme'

type LoadedRitual = KnownRitual & { bundle: Awaited<ReturnType<typeof loadKnownRitualBundles>>[number]['bundle'] }
type HomeRitual = LoadedRitual & { id: string }
type WeekOutcomes = ReadonlyMap<string, ReadonlyMap<number, SoloWeekOutcome>>

type HomeState = Readonly<{
  status: 'loading' | 'ready' | 'error'
  rituals: readonly HomeRitual[]
  /** Every ritual this phone remembers, in order: the tile colour index. */
  known: readonly KnownRitual[]
  season: SeasonAccountView | null
  seasonStatus: 'no-address' | 'ready' | 'not-found' | 'error'
  message?: string
}>

const initialState: HomeState = { status: 'loading', rituals: [], known: [], season: null, seasonStatus: 'no-address' }

export function RitualsHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const theme = useTheme()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(theme, colors), [theme, colors])
  const client = useRitualClient()
  const { connection } = useConnection()
  const { selectedAccount, isLoading: walletLoading } = useAuthorization()
  const [homeState, setHomeState] = useState<HomeState>(initialState)
  const [finishedExpanded, setFinishedExpanded] = useState(false)
  // Kept / missed per closed week, read in one batch after the cards render.
  const [outcomes, setOutcomes] = useState<WeekOutcomes>(new Map())
  const mounted = useRef(false)
  const requestGeneration = useRef(0)

  const load = useCallback((quiet = false) => {
    // AUTHORITATIVE CHAIN READS keep ritual cards grounded in current account data.
    const generation = ++requestGeneration.current
    if (!quiet) { setHomeState(initialState); setOutcomes(new Map()) }
    if (client.status !== 'ready') {
      setHomeState({ ...initialState, status: 'error', message: safeErrorMessage(client.reason) })
      return
    }

    // Seasons are hidden by the solo-only scope: don't read one at all.
    const seasonPromise = !SCOPE.seasons || DEMO_SEASON.address === null
      ? Promise.resolve({ season: null, status: 'no-address' as const })
      : readSeason(connection, DEMO_SEASON.address, client.client.programId)
        .then((read) => ({ season: read.account, status: 'ready' as const }))
        .catch((error: unknown) => ({ season: null, status: seasonStatusForError(error) }))

    void Promise.all([loadKnownRitualBundles(client.client), seasonPromise, listKnownRituals()])
      .then(([rituals, season, known]) => {
        if (!mounted.current || generation !== requestGeneration.current) return
        setHomeState({
          status: 'ready',
          rituals: rituals.map((ritual) => ({ ...ritual, id: ritual.address })),
          known,
          season: season.season,
          seasonStatus: season.status,
        })
        const getMany = withReadRetry((keys: PublicKey[]) => connection.getMultipleAccountsInfo(keys, 'confirmed'))
        void readSoloWeekOutcomes(getMany, client.client.programId, rituals.map((ritual) => ({ address: new PublicKey(ritual.address), account: ritual.bundle.ritual.account })))
          .then((read) => { if (mounted.current && generation === requestGeneration.current) setOutcomes(read) })
          .catch(() => undefined) // cards keep the neutral "closed" mark
      })
      .catch((error: unknown) => {
        if (mounted.current && generation === requestGeneration.current) setHomeState({ ...initialState, status: 'error', message: safeErrorMessage(error) })
      })
  }, [client, connection])

  // Reload on every focus: returning from a new promise, a check-in or a
  // settle must show the fresh chain state, not the list from app launch.
  const focused = useIsFocused()
  const chainNow = useChainTime(connection, focused)
  useCatchup({ connection, rituals: homeState.rituals, now: chainNow, focused, scope: 'home',
    wallet: selectedAccount?.publicKey ?? null, onChanged: () => load(true) })
  const recovery = usePendingRitualRecovery(client, connection, undefined, focused)
  useEffect(() => {
    if (!focused) return
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') load() })
    return () => listener.remove()
  }, [focused, load])
  useEffect(() => { if (focused && recovery?.resolution.status === 'confirmed') load() }, [focused, recovery, load])
  useEffect(() => {
    mounted.current = true
    if (focused) load()
    return () => {
      mounted.current = false
      requestGeneration.current += 1
    }
  }, [focused, load])

  // Reminders act only for the connected wallet, from this screen's own read
  // (no extra RPC): another wallet's are silenced, this one's rescheduled.
  // Home is the stack root, so a switch made in Settings or create lands here too.
  const walletKey = selectedAccount?.publicKey.toBase58() ?? null
  const walletKeyRef = useRef(walletKey); walletKeyRef.current = walletKey
  const reminderPlanKey = useRef<string | null>(null)
  useEffect(() => {
    if (homeState.status !== 'ready' || walletLoading) return
    const plan = walletReminderPlan(homeState.rituals, walletKey ? new PublicKey(walletKey) : null, Math.floor(Date.now() / 1000))
    if (reminderPlanKey.current === plan.key) return
    reminderPlanKey.current = plan.key
    const retryLater = () => { if (reminderPlanKey.current === plan.key) reminderPlanKey.current = null }
    void applyWalletReminderPlan(plan, () => walletKeyRef.current === walletKey).then((done) => { if (!done) retryLater() }, retryLater)
  }, [homeState, walletKey, walletLoading])

  const disclosure = 'Devnet · tSKR is a test token with no real value'
  const view = { disclosure }
  const goPromise = () => navigation.navigate('SoloCreate')
  const goFriends = () => navigation.navigate(homeCreateTarget().name)
  const goJoin = () => navigation.navigate('JoinRitual', {})

  if (homeState.status === 'loading') {
    return <View style={styles.center} accessibilityRole="progressbar" accessibilityLiveRegion="polite"><ActivityIndicator accessibilityLabel="Loading your rituals" /><Text style={styles.muted}>Loading rituals…</Text><Text style={styles.disclosure}>{view.disclosure}</Text></View>
  }
  if (homeState.status === 'error') {
    return <View style={styles.center} accessibilityLiveRegion="polite"><Text style={styles.errorTitle}>Your rituals are out of reach</Text><Text style={styles.muted}>{homeState.message}</Text><Text style={styles.disclosure}>{view.disclosure}</Text><Button mode="contained" onPress={() => load()} accessibilityLabel="Try again">Try again</Button></View>
  }

  const { active, finished } = homeSections(ritualsForWallet(homeState.rituals, selectedAccount?.publicKey), chainNow)
  const onOpen = (ritual: HomeRitual) => openRitual(navigation, ritual)
  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Rituals home">
    <View style={styles.hero}><Text style={styles.wordmark} accessibilityRole="header">Rituals</Text><Text style={styles.tagline}>Show up, or pay up.</Text></View>
    {recovery && <Text style={styles.muted} accessibilityLiveRegion="polite">{recovery.body}</Text>}
    {active.length === 0
      ? <EmptySolo key={selectedAccount?.publicKey.toBase58() ?? 'disconnected'} wallet={selectedAccount?.publicKey ?? null} client={client} connection={connection} onPromise={goPromise} onFriends={goFriends} onJoin={goJoin} styles={styles} />
      : <View accessibilityLabel="Your rituals"><Section title="Your rituals" /><RitualGrid rituals={active} known={homeState.known} outcomes={outcomes} now={chainNow} onOpen={onOpen} onPromise={goPromise} styles={styles} /></View>}
    {finished.length > 0 && <View style={styles.finished}>
      <Pressable onPress={() => setFinishedExpanded((expanded) => !expanded)} accessibilityRole="button" accessibilityLabel={`Finished · ${finished.length}`} accessibilityState={{ expanded: finishedExpanded }} style={styles.finishedToggle}>
        <Text style={styles.finishedTitle}>Finished · {finished.length}</Text>
        <Icon source={finishedExpanded ? 'chevron-up' : 'chevron-down'} color={colors.muted} size={24} />
      </Pressable>
      {finishedExpanded && <RitualGrid rituals={finished} known={homeState.known} outcomes={outcomes} now={chainNow} onOpen={onOpen} muted styles={styles} />}
    </View>}
    {SCOPE.seasons && <SeasonsSection season={homeState.season} status={homeState.seasonStatus} onRetry={() => load()} onOpen={() => {
      if (DEMO_SEASON.address !== null) navigation.navigate('Season', { seasonAddress: DEMO_SEASON.address.toBase58() })
    }} styles={styles} />}

    <Footnote>{disclosure}</Footnote>
  </ScrollView>
}

function EmptySolo({ wallet, client, connection, onPromise, onFriends, onJoin, styles }: { wallet: PublicKey | null; client: RitualClientState; connection: Connection; onPromise: () => void; onFriends: () => void; onJoin: () => void; styles: ReturnType<typeof makeStyles> }) {
  // Mounted only without active rituals; the wallet key isolates balances and faucet results.
  const [testBalance, setTestBalance] = useState<bigint | null>(null)
  const [balanceTick, setBalanceTick] = useState(0)
  const onFaucetSent = useCallback(() => setBalanceTick((value) => value + 1), [])
  const faucet = useDevnetFaucet(wallet?.toBase58() ?? null, onFaucetSent)
  useFocusEffect(useCallback(() => {
    setTestBalance(null)
    if (!wallet || client.status !== 'ready') return
    let active = true
    void client.client.getProtocolConfig()
      .then((config) => readTestTokenBalance(connection, config.account.allowedStakeMint, wallet))
      .then((balance) => { if (active) setTestBalance(balance) })
      .catch(() => { if (active) setTestBalance(null) })
    return () => { active = false }
  }, [client, connection, wallet, balanceTick]))
  const faucetPrimary = homePrimaryAction({ connected: wallet !== null, hasActiveRituals: false, testBalance, faucetResult: faucet.result }) === 'faucet'
  return <View style={styles.empty}>
    <Text style={styles.emptyTitle}>Start a ritual?</Text>
    <View style={styles.actions}>
      {faucetPrimary
        ? <ActionButton label="Get test tokens" onPress={faucet.request} disabled={faucet.status === 'requesting'} loading={faucet.status === 'requesting'} />
        : <ActionButton label="Start one" onPress={onPromise} />}
      {faucet.status === 'done' && faucet.result && <Text style={styles.muted} accessibilityLiveRegion="polite">{faucetLine(faucet.result)}</Text>}
      {faucetPrimary && faucet.status === 'done' && <ActionButton tone="link" label="Start one" onPress={onPromise} />}
      {SCOPE.homeFriends && <ActionButton tone="quiet" label="With friends" onPress={onFriends} />}
      {SCOPE.homeJoin && <ActionButton tone="quiet" label="Join with a link" onPress={onJoin} />}
    </View>
  </View>
}

function RitualGrid({ rituals, known, outcomes, now, onOpen, onPromise, muted = false, styles }: { rituals: readonly HomeRitual[]; known: readonly KnownRitual[]; outcomes: WeekOutcomes; now: number | null; onOpen: (ritual: HomeRitual) => void; onPromise?: () => void; muted?: boolean; styles: ReturnType<typeof makeStyles> }) {
  // Two columns, about four tiles a screen; each ritual in its own colour.
  const { width } = useWindowDimensions()
  const tileWidth = Math.floor((width - space.screen * 2 - space.md) / 2)
  return <View style={styles.grid}>
    {rituals.map((ritual) => <RitualTile key={ritual.id} ritual={ritual} known={known} outcomes={outcomes.get(ritual.address)} now={now} width={tileWidth} onPress={() => onOpen(ritual)} muted={muted} styles={styles} />)}
    {onPromise && <Pressable onPress={onPromise} accessibilityRole="button" accessibilityLabel="Start another ritual" style={({ pressed }) => [styles.newTile, { width: tileWidth }, pressed && styles.tilePressed]}>
      <Text style={styles.newPlus}>+</Text>
      <Text style={styles.newText}>New ritual</Text>
    </Pressable>}
  </View>
}

function SeasonsSection({ season, status, onRetry, onOpen, styles }: { season: SeasonAccountView | null; status: HomeState['seasonStatus']; onRetry: () => void; onOpen: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Section title="Seasons" aside={season ? 'LIVE NOW' : undefined}>
    {DEMO_SEASON.address === null
      ? <Text style={styles.muted}>No Season running right now.</Text>
      : season
        ? <SeasonCard title={DEMO_SEASON.title} liveCountLine={seasonCountLine(season)} actionLabel="Open" onPress={onOpen} />
        : status === 'not-found'
          ? <Text style={styles.muted}>No Season running right now.</Text>
          : status === 'error'
            ? <View style={styles.seasonError}><Text style={styles.muted}>Couldn't load the Season.</Text><ActionButton tone="quiet" label="Try again" onPress={onRetry} /></View>
            : <Text style={styles.muted}>Loading the Season…</Text>}
  </Section>
}

function seasonCountLine(season: SeasonAccountView): string {
  const current = seasonCountForNow(season.checkedInCount, season.schedule, Math.floor(Date.now() / 1000))
  return `${seasonParticipantLine(season.participantCount)} · ${current.count} checked in this week`
}

function RitualTile({ ritual, known, outcomes, now, width, onPress, muted, styles }: { ritual: HomeRitual; known: readonly KnownRitual[]; outcomes: ReadonlyMap<number, SoloWeekOutcome> | undefined; now: number | null; width: number; onPress: () => void; muted: boolean; styles: ReturnType<typeof makeStyles> }) {
  const account = ritual.bundle.ritual.account
  const moneyLine = tileMoneyLine(account, outcomes)
  const tint = ritualTintAmong(ritual.address, known)
  const cells: WeekCell[] = account.kind === 'Solo'
    ? soloHomeCells(account, outcomes, now, ritual.bundle)
    : weekCells(account.status, account.schedule.length, account.currentEventIndex, account.settledEventCount)
  const { status, closingLine } = homeTilePresentation(ritual.bundle, now)
  return <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`${ritual.title}. ${status.text}. ${closingLine ?? weekSummary(cells)}. ${moneyLine}.`}
    style={({ pressed }) => [styles.tile, { width, backgroundColor: tint }, pressed && styles.tilePressed, muted && styles.tileFinished]}
  >
    <View style={styles.tileOrb} />
    <View style={styles.tileHead}>
      <Text style={styles.tileStake}>{moneyLine}</Text>
      <Text style={styles.tileTitle} numberOfLines={3}>{ritual.title}</Text>
    </View>
    <View style={styles.tileFoot}>
      <WeekStrip cells={cells} tint={tint} compact summary={closingLine !== null} summaryLabel={closingLine ?? undefined} />
      <View style={[styles.tilePill, status.act && styles.tilePillAct]}><Text style={[styles.tilePillText, status.act && styles.tilePillActText]} numberOfLines={1}>{status.text}</Text></View>
    </View>
  </Pressable>
}

function openRitual(navigation: NativeStackNavigationProp<RootStackParamList>, ritual: HomeRitual) {
  const target = homeRitualTarget({ id: ritual.id, kind: ritual.bundle.ritual.account.kind })
  if (target.name === 'SoloRitual') navigation.navigate(target.name, target.params)
  else navigation.navigate(target.name, target.params)
}

function weekCells(status: string, length: number, current: number, settled: number): WeekCell[] {
  return Array.from({ length }, (_, index) => {
    if (status === 'Completed' || index < settled) return 'done'
    if (status === 'Active' && index === current) return 'now'
    return 'future'
  })
}

export const safeErrorMessage = (_error: unknown): string => 'Unable to load rituals right now. Check your connection and try again.'

const makeStyles = (theme: MD3Theme, color: Palette) => StyleSheet.create({
  content: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.xxl, backgroundColor: theme.colors.background },
  hero: { marginTop: space.lg, marginBottom: space.lg },
  wordmark: { ...type.display, color: color.fg, includeFontPadding: false },
  tagline: { ...type.body, color: color.muted, marginTop: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  finished: { marginTop: space.lg },
  finishedToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  finishedTitle: { ...type.section, color: color.muted },
  tile: { minHeight: 196, borderRadius: radius.lg, padding: space.lg, overflow: 'hidden', justifyContent: 'space-between' },
  tileFinished: { opacity: 0.82 },
  tilePressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  tileOrb: { position: 'absolute', right: -40, top: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.14)' },
  tileHead: { gap: space.xs },
  tileStake: { ...type.label, textTransform: 'none', letterSpacing: 0.5, color: color.white, opacity: 0.85 },
  tileTitle: { ...type.heading, color: color.white },
  tileFoot: { gap: space.sm, marginTop: space.md },
  tilePill: { alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 4 },
  tilePillText: { ...type.caption, fontFamily: type.bodyStrong.fontFamily, color: color.white },
  tilePillAct: { backgroundColor: color.go },
  tilePillActText: { color: color.goInk },
  newTile: { minHeight: 196, borderRadius: radius.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: color.line, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  newPlus: { ...type.display, color: color.muted },
  newText: { ...type.bodyStrong, color: color.muted },
  actions: { gap: space.sm, marginTop: space.xl },
  empty: { backgroundColor: color.card, borderColor: color.line, borderWidth: 1, borderRadius: radius.lg, padding: space.xl, marginTop: space.sm },
  emptyKicker: { ...type.label, color: color.muted },
  emptyTitle: { ...type.hero, color: color.fg, marginTop: space.sm },
  emptyBody: { ...type.body, color: color.muted, marginTop: space.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md, backgroundColor: theme.colors.background },
  seasonError: { gap: space.sm, alignItems: 'center' },
  muted: { ...type.body, color: color.muted, textAlign: 'center' },

  errorTitle: { ...type.section, color: color.fg, textAlign: 'center' },
  disclosure: { ...type.caption, color: color.faint, textAlign: 'center', marginVertical: space.md },
})
