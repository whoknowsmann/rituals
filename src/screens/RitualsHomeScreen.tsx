import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { ActionButton, Chip, FeedRow, Footnote, Poster, PosterLine, Section, WeekStrip, type WeekCell } from '../components/crew'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { loadKnownRitualBundles, formatAtomic, statusLabel, type KnownRitual } from '../features/rituals/authoritativeRituals'
import { homeCreateTarget } from '../features/rituals/create/routeHelpers'
import { ritualDetailTarget } from '../features/rituals/claims/routeHelpers'
import { color, memberColor, palette, radius, space, type } from '../theme'

type LoadedRitual = KnownRitual & { bundle: Awaited<ReturnType<typeof loadKnownRitualBundles>>[number]['bundle'] }
type HomeRitual = LoadedRitual & { id: string }
type FeedClaim = LoadedRitual['bundle']['claims'][number]

export function RitualsHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const client = useRitualClient()
  const [homeState, setHomeState] = useState<{ status: 'loading' | 'ready' | 'error'; rituals: readonly HomeRitual[]; message?: string }>({ status: 'loading', rituals: [] })
  const mounted = useRef(false)
  const requestGeneration = useRef(0)

  const load = useCallback(() => {
    // AUTHORITATIVE CHAIN READS are the only source for this screen's ritual data.
    const generation = ++requestGeneration.current
    setHomeState({ status: 'loading', rituals: [] })
    if (client.status !== 'ready') {
      setHomeState({ status: 'error', rituals: [], message: safeErrorMessage(client.reason) })
      return
    }
    void loadKnownRitualBundles(client.client)
      .then((rituals) => {
        if (mounted.current && generation === requestGeneration.current) {
          setHomeState({ status: 'ready', rituals: rituals.map((ritual) => ({ ...ritual, id: ritual.address })) })
        }
      })
      .catch((error: unknown) => {
        if (mounted.current && generation === requestGeneration.current) setHomeState({ status: 'error', rituals: [], message: safeErrorMessage(error) })
      })
  }, [client])

  useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
      requestGeneration.current += 1
    }
  }, [load])

  const disclosure = 'DEVNET · TEST TOKENS'
  const view = { disclosure }

  if (homeState.status === 'loading') {
    return <View style={styles.center} accessibilityRole="progressbar" accessibilityLiveRegion="polite"><ActivityIndicator accessibilityLabel="Loading your crew" /><Text style={styles.muted}>Checking in with your crew…</Text><Text style={styles.disclosure}>{view.disclosure}</Text></View>
  }
  if (homeState.status === 'error') {
    return <View style={styles.center} accessibilityLiveRegion="polite"><Text style={styles.errorTitle}>Your crew is out of reach</Text><Text style={styles.muted}>{homeState.message}</Text><Text style={styles.disclosure}>{view.disclosure}</Text><Button mode="contained" onPress={load} accessibilityLabel="Try again">Try again</Button></View>
  }

  const ritual = chooseRitual(homeState.rituals)
  const goCreate = () => navigation.navigate(homeCreateTarget().name)
  const goJoin = () => navigation.navigate('JoinRitual', {})

  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Rituals home">
    <View style={styles.hero}><Text style={styles.wordmark} accessibilityRole="header">Rituals</Text><Text style={styles.tagline}>Show up, or pay up.</Text></View>
    {!ritual ? <EmptyCrew onCreate={goCreate} onJoin={goJoin} styles={styles} /> : <>
      <View key={ritual.id}>
        <CrewPoster ritual={ritual} styles={styles} />
        <ActionButton tone="quiet" label="Open ritual" onPress={() => {
          const target = ritualDetailTarget(ritual.address)
          navigation.navigate(target.name, target.params)
        }} style={styles.openButton} />
      </View>
      <CrewFeed ritual={ritual} styles={styles} />
      <View style={styles.actions}>
        <ActionButton label="Start a ritual" onPress={goCreate} />
        <ActionButton tone="quiet" label="Join with a link" onPress={goJoin} />
      </View>
    </>}
    <Footnote>{view.disclosure}</Footnote>
  </ScrollView>
}

function EmptyCrew({ onCreate, onJoin, styles }: { onCreate: () => void; onJoin: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.empty}>
    <Text style={styles.emptyTitle}>No rituals yet</Text>
    <Text style={styles.emptyBody}>Start something with your people, or join from a link.</Text>
    <View style={styles.actions}>
      <ActionButton label="Start a ritual" onPress={onCreate} />
      <ActionButton tone="quiet" label="Join with a link" onPress={onJoin} />
    </View>
  </View>
}

function CrewPoster({ ritual, styles }: { ritual: HomeRitual; styles: ReturnType<typeof makeStyles> }) {
  const account = ritual.bundle.ritual.account
  const ready = `${account.fundedMemberCount} of ${account.members.length} ready`
  const cells = weekCells(account.status, account.schedule.length, account.currentEventIndex, account.settledEventCount)
  return <Poster tint={memberColor(0)} kicker={`${statusLabel(account.status)} · ${ready}`} title={ritual.title}>
    <WeekStrip cells={cells} tint={memberColor(0)} />
    <PosterLine label="Per event" value={formatAtomic(account.perEventAllocation, account.stakeDecimals)} />
    <Text style={styles.requirement}>{ritual.requirement}</Text>
  </Poster>
}

function CrewFeed({ ritual, styles }: { ritual: HomeRitual; styles: ReturnType<typeof makeStyles> }) {
  const claims = ritual.bundle.claims.filter((claim) => claim.account !== null)
  const confirmed = claims.filter((claim) => claim.account?.status === 'Confirmed').length
  const summary = claims.length === 0 ? 'Nothing posted yet' : `${confirmed} of ${claims.length} confirmed`
  return <Section title="Crew this week" aside={summary}>
    {claims.length > 0 ? claims.map((claim) => <ClaimRow key={claim.address.toBase58()} claim={claim} styles={styles} />) : <View style={styles.feedEmpty}>
      <Text style={styles.emptyTitle}>{ritual.bundle.ritual.account.status === 'Funding' ? 'Check-ins start when everyone is ready.' : 'No check-ins yet.'}</Text>
      <Text style={styles.emptyBody}>{ritual.bundle.event ? 'The crew has a clean slate for this event.' : 'This ritual has not opened an event yet.'}</Text>
    </View>}
  </Section>
}

function ClaimRow({ claim, styles }: { claim: FeedClaim; styles: ReturnType<typeof makeStyles> }) {
  const account = claim.account
  if (!account) return null
  const name = memberName(claim.memberIndex)
  const action = account.status === 'Confirmed' ? 'checked in' : account.status === 'Questioned' ? 'checked in · needs a closer look' : 'claimed this event'
  const chip = account.status === 'Confirmed' ? <Chip ok>Confirmed</Chip> : account.status === 'Questioned' ? <Chip>Needs a second look</Chip> : <Chip>Waiting for a friend</Chip>
  return <FeedRow index={claim.memberIndex} name={name} action={action}>{chip}</FeedRow>
}

function chooseRitual(rituals: readonly HomeRitual[]): HomeRitual | null {
  return rituals.find(({ bundle }) => bundle.ritual.account.status === 'Active')
    ?? rituals.find(({ bundle }) => bundle.ritual.account.status === 'Funding')
    ?? rituals[rituals.length - 1]
    ?? null
}

function weekCells(status: string, length: number, current: number, settled: number): WeekCell[] {
  return Array.from({ length }, (_, index) => {
    if (status === 'Completed' || index < settled) return 'done'
    if (status === 'Active' && index === current) return 'now'
    return 'future'
  })
}

function memberName(index: number): string {
  return index === 0 ? 'Host' : `Friend ${index + 1}`
}

export const safeErrorMessage = (_error: unknown): string => 'Unable to load rituals right now. Check your connection and try again.'

const makeStyles = (theme: MD3Theme) => StyleSheet.create({
  content: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.xxl, backgroundColor: theme.colors.background },
  // Wordmark and tagline are separate Text nodes: nesting them in one header
  // Text shared a line box, which clipped the display face's ascenders on device.
  hero: { marginTop: space.lg, marginBottom: space.lg },
  wordmark: { ...type.display, color: color.fg, includeFontPadding: false },
  tagline: { ...type.body, color: color.muted, marginTop: space.xs },
  requirement: { ...type.body, color: color.white, marginTop: space.lg, opacity: 0.92 },
  openButton: { marginTop: space.sm },
  actions: { gap: space.sm, marginTop: space.xl },
  empty: { backgroundColor: color.card, borderColor: color.line, borderWidth: 1, borderRadius: radius.lg, padding: space.xl, marginTop: space.sm },
  emptyTitle: { ...type.section, color: color.fg },
  emptyBody: { ...type.body, color: color.muted, marginTop: space.sm },
  feedEmpty: { paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: color.line },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md, backgroundColor: theme.colors.background },
  muted: { ...type.body, color: color.muted, textAlign: 'center' },
  errorTitle: { ...type.section, color: color.fg, textAlign: 'center' },
  disclosure: { ...type.label, color: color.faint, textAlign: 'center', marginVertical: space.md },
})
