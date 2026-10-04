import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { ActionButton, Footnote, Poster, PosterLine, Section, WeekStrip, type WeekCell } from '../components/crew'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { loadKnownRitualBundles, formatAtomic, statusLabel, type KnownRitual } from '../features/rituals/authoritativeRituals'
import { homeCreateTarget } from '../features/rituals/create/routeHelpers'
import { homeRitualTarget } from '../features/rituals/home/homeViewModel'
import { useConnection } from '../utils/ConnectionProvider'
import { DEMO_SEASON } from '../data/rituals/demoConfig'
import type { SeasonAccountView } from '../data/rituals/accounts'
import { readSeason } from '../features/rituals/solo/season/readSeason'
import { seasonStatusForError } from '../features/rituals/solo/season/seasonState'
import { seasonCountForNow, seasonParticipantLine } from '../features/rituals/solo/season/seasonViewModel'
import { SeasonCard } from '../features/rituals/solo/season/SeasonCard'
import { COMING_SOON_LINE, SCOPE } from '../features/rituals/productScope'
import { readSoloWeekOutcomes, soloHomeCells } from '../features/rituals/home/soloHistory'
import { withReadRetry } from '../features/rituals/client/resilientRead'
import { PublicKey } from '@solana/web3.js'
import { color, memberColor, radius, space, type } from '../theme'

type LoadedRitual = KnownRitual & { bundle: Awaited<ReturnType<typeof loadKnownRitualBundles>>[number]['bundle'] }
type HomeRitual = LoadedRitual & { id: string }
type WeekOutcomes = ReadonlyMap<string, ReadonlyMap<number, 'done' | 'missed'>>

type HomeState = Readonly<{
  status: 'loading' | 'ready' | 'error'
  rituals: readonly HomeRitual[]
  season: SeasonAccountView | null
  seasonStatus: 'no-address' | 'ready' | 'not-found' | 'error'
  message?: string
}>

const initialState: HomeState = { status: 'loading', rituals: [], season: null, seasonStatus: 'no-address' }

export function RitualsHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const client = useRitualClient()
  const { connection } = useConnection()
  const [homeState, setHomeState] = useState<HomeState>(initialState)
  // Kept / missed per closed week, read in one batch after the cards render.
  const [outcomes, setOutcomes] = useState<WeekOutcomes>(new Map())
  const mounted = useRef(false)
  const requestGeneration = useRef(0)

  const load = useCallback(() => {
    // AUTHORITATIVE CHAIN READS keep ritual cards grounded in current account data.
    const generation = ++requestGeneration.current
    setHomeState(initialState)
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

    void Promise.all([loadKnownRitualBundles(client.client), seasonPromise])
      .then(([rituals, season]) => {
        if (!mounted.current || generation !== requestGeneration.current) return
        setHomeState({
          status: 'ready',
          rituals: rituals.map((ritual) => ({ ...ritual, id: ritual.address })),
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
  useEffect(() => {
    mounted.current = true
    if (focused) load()
    return () => {
      mounted.current = false
      requestGeneration.current += 1
    }
  }, [focused, load])

  const disclosure = 'Devnet · TEST tokens have no real value'
  const view = { disclosure }
  const goPromise = () => navigation.navigate('SoloCreate')
  const goFriends = () => navigation.navigate(homeCreateTarget().name)
  const goJoin = () => navigation.navigate('JoinRitual', {})

  if (homeState.status === 'loading') {
    return <View style={styles.center} accessibilityRole="progressbar" accessibilityLiveRegion="polite"><ActivityIndicator accessibilityLabel="Loading your rituals" /><Text style={styles.muted}>Checking in…</Text><Text style={styles.disclosure}>{view.disclosure}</Text></View>
  }
  if (homeState.status === 'error') {
    return <View style={styles.center} accessibilityLiveRegion="polite"><Text style={styles.errorTitle}>Your rituals are out of reach</Text><Text style={styles.muted}>{homeState.message}</Text><Text style={styles.disclosure}>{view.disclosure}</Text><Button mode="contained" onPress={load} accessibilityLabel="Try again">Try again</Button></View>
  }

  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Rituals home">
    <View style={styles.hero}><Text style={styles.wordmark} accessibilityRole="header">Rituals</Text><Text style={styles.tagline}>Show up, or pay up.</Text></View>
    {homeState.rituals.length === 0
      ? <EmptySolo onPromise={goPromise} onFriends={goFriends} onJoin={goJoin} styles={styles} />
      : <ActiveRituals rituals={homeState.rituals} outcomes={outcomes} onOpen={(ritual) => openRitual(navigation, ritual)} onPromise={goPromise} styles={styles} />}
    {SCOPE.seasons && <SeasonsSection season={homeState.season} status={homeState.seasonStatus} onRetry={load} onOpen={() => {
      if (DEMO_SEASON.address !== null) navigation.navigate('Season', { seasonAddress: DEMO_SEASON.address.toBase58() })
    }} styles={styles} />}
    {!SCOPE.homeFriends && !SCOPE.seasons && <Text style={styles.comingSoon}>{COMING_SOON_LINE}</Text>}
    <Footnote>{disclosure}</Footnote>
  </ScrollView>
}

function EmptySolo({ onPromise, onFriends, onJoin, styles }: { onPromise: () => void; onFriends: () => void; onJoin: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.empty}>
    <Text style={styles.emptyKicker}>YOUR BOARD IS CLEAR</Text>
    <Text style={styles.emptyTitle}>Make a promise to yourself.</Text>
    <Text style={styles.emptyBody}>Choose the thing. Set your stake. Show up in your own time.</Text>
    <View style={styles.actions}>
      <ActionButton label="Make a promise" onPress={onPromise} />
      {SCOPE.homeFriends && <ActionButton tone="quiet" label="With friends" onPress={onFriends} />}
      {SCOPE.homeJoin && <ActionButton tone="quiet" label="Join with a link" onPress={onJoin} />}
    </View>
  </View>
}

function ActiveRituals({ rituals, outcomes, onOpen, onPromise, styles }: { rituals: readonly HomeRitual[]; outcomes: WeekOutcomes; onOpen: (ritual: HomeRitual) => void; onPromise: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <View accessibilityLabel="Your rituals">
    <Section title="Keep showing up" />
    {rituals.map((ritual) => <View key={ritual.id} style={styles.ritualCard}>
      <CrewPoster ritual={ritual} outcomes={outcomes.get(ritual.address)} styles={styles} />
      <ActionButton tone="quiet" label="Open" onPress={() => onOpen(ritual)} style={styles.openButton} />
    </View>)}
    <ActionButton tone="quiet" label="Make another promise" onPress={onPromise} />
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

function CrewPoster({ ritual, outcomes, styles }: { ritual: HomeRitual; outcomes: ReadonlyMap<number, 'done' | 'missed'> | undefined; styles: ReturnType<typeof makeStyles> }) {
  const account = ritual.bundle.ritual.account
  const kicker = account.kind === 'Solo' ? `Solo · ${statusLabel(account.status)}` : `${statusLabel(account.status)} · ${account.fundedMemberCount} of ${account.members.length} ready`
  const cells: WeekCell[] = account.kind === 'Solo'
    ? soloHomeCells(account, outcomes)
    : weekCells(account.status, account.schedule.length, account.currentEventIndex, account.settledEventCount)
  return <Poster tint={memberColor(0)} kicker={kicker} title={ritual.title}>
    <WeekStrip cells={cells} tint={memberColor(0)} />
    <PosterLine label="Per event" value={formatAtomic(account.perEventAllocation, account.stakeDecimals)} />
    <Text style={styles.requirement}>{ritual.requirement}</Text>
  </Poster>
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

const makeStyles = (theme: MD3Theme) => StyleSheet.create({
  content: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.xxl, backgroundColor: theme.colors.background },
  hero: { marginTop: space.lg, marginBottom: space.lg },
  wordmark: { ...type.display, color: color.fg, includeFontPadding: false },
  tagline: { ...type.body, color: color.muted, marginTop: space.xs },
  requirement: { ...type.body, color: color.white, marginTop: space.lg, opacity: 0.92 },
  ritualCard: { marginTop: space.sm },
  openButton: { marginTop: space.sm },
  actions: { gap: space.sm, marginTop: space.xl },
  empty: { backgroundColor: color.card, borderColor: color.line, borderWidth: 1, borderRadius: radius.lg, padding: space.xl, marginTop: space.sm },
  emptyKicker: { ...type.label, color: color.muted },
  emptyTitle: { ...type.hero, color: color.fg, marginTop: space.sm },
  emptyBody: { ...type.body, color: color.muted, marginTop: space.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md, backgroundColor: theme.colors.background },
  seasonError: { gap: space.sm, alignItems: 'center' },
  muted: { ...type.body, color: color.muted, textAlign: 'center' },
  comingSoon: { ...type.caption, color: color.muted, textAlign: 'center', marginTop: space.xl },
  errorTitle: { ...type.section, color: color.fg, textAlign: 'center' },
  disclosure: { ...type.label, color: color.faint, textAlign: 'center', marginVertical: space.md },
})
