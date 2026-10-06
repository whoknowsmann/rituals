import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import { PublicKey } from '@solana/web3.js'
import type { RootStackParamList } from '../../navigators/AppNavigator'
import { ActionButton, Footnote, Section } from '../../components/crew'
import { useRitualClient } from '../../features/rituals/client/useRitualClient'
import { listKnownRituals } from '../../features/rituals/authoritativeRituals'
import { useConnection } from '../../utils/ConnectionProvider'
import { DEMO_SEASON } from '../../data/rituals/demoConfig'
import type { RitualAccountView, SeasonAccountView } from '../../data/rituals/accounts'
import { readSeason } from '../../features/rituals/solo/season/readSeason'
import { buildSeasonViewModel, seasonStatusLabel, seasonRitualStatus, type SeasonRitualStatus } from '../../features/rituals/solo/season/seasonViewModel'
import { SeasonCard } from '../../features/rituals/solo/season/SeasonCard'
import { color, space, type } from '../../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'Season'>
type SeasonRitual = Readonly<{ address: string; account: RitualAccountView }>
type State = Readonly<{ status: 'loading' | 'ready' | 'error'; season: SeasonAccountView | null; rituals: readonly SeasonRitual[]; message?: string }>

const initialState: State = { status: 'loading', season: null, rituals: [] }

export function SeasonScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { connection } = useConnection()
  const client = useRitualClient()
  const focused = useIsFocused()
  const address = useMemo(() => parseAddress(route.params?.seasonAddress), [route.params?.seasonAddress])
  const [state, setState] = useState<State>(initialState)
  const mounted = useRef(false)
  const generation = useRef(0)

  const refresh = useCallback(() => {
    const currentGeneration = ++generation.current
    setState(initialState)
    if (!address) {
      setState({ ...initialState, status: 'error', message: 'This Season is unavailable.' })
      return
    }
    if (client.status !== 'ready') {
      setState({ ...initialState, status: 'error', message: 'Seasons are unavailable right now.' })
      return
    }

    void Promise.all([
      readSeason(connection, address, client.client.programId),
      listKnownRituals(),
    ])
      .then(async ([seasonRead, known]) => {
        const rituals = await Promise.all(known.map(async (knownRitual) => {
          try {
            const read = await client.client.readRitual(new PublicKey(knownRitual.address))
            return { address: knownRitual.address, account: read.account }
          } catch {
            return null
          }
        }))
        if (mounted.current && currentGeneration === generation.current) setState({ status: 'ready', season: seasonRead.account, rituals: rituals.filter((ritual): ritual is SeasonRitual => ritual !== null) })
      })
      .catch(() => {
        if (mounted.current && currentGeneration === generation.current) setState({ ...initialState, status: 'error', message: 'We could not open this Season. Check your connection and try again.' })
      })
  }, [address, client, connection])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; generation.current += 1 }
  }, [])

  useEffect(() => {
    if (!focused) return
    refresh()
    const timer = setInterval(refresh, 15_000)
    return () => clearInterval(timer)
  }, [focused, refresh])

  if (state.status === 'loading') return <StateView title="Opening Season" body="Checking the latest count…" />
  if (state.status === 'error' || !state.season || !address) return <ErrorView message={state.message ?? 'This Season is unavailable.'} onRetry={refresh} onHome={() => navigation.navigate('RitualsHome')} />

  const title = DEMO_SEASON.address?.equals(address) ? DEMO_SEASON.title : 'Season'
  const rituals = state.rituals.map((ritual) => ({ season: ritual.account.season, status: ritual.account.status }))
  const model = buildSeasonViewModel({ title, season: state.season, seasonAddress: address, rituals, nowSeconds: Math.floor(Date.now() / 1000) })
  const matched = state.rituals.find((ritual) => ritual.account.season?.equals(address) ?? false)
  const actionLabel = matched ? 'Open' : 'Join'

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} accessibilityLabel="Season">
    <Text style={styles.kicker}>SEASON · OPEN TO ANYONE</Text>
    <SeasonCard title={model.title} liveCountLine={`${model.participantLine} · ${model.checkedInLine}`} actionLabel={actionLabel} hideAction={!matched && !model.joinOpen} onPress={() => {
      if (matched) navigation.navigate('SoloRitual', { ritualId: matched.address })
      else navigation.navigate('SoloCreate', { seasonAddress: address.toBase58() })
    }} />
    <Text style={styles.dates}>{model.dates}</Text>
    <View style={styles.status} accessibilityLiveRegion="polite">
      <Text style={styles.statusTitle}>{model.statusLabel}</Text>
      {model.status === 'not-joined' && model.joinOpen && <Text style={styles.muted}>Join this Season with your own promise and destination.</Text>}
      {model.status === 'not-joined' && !model.joinOpen && <Text style={styles.muted}>Joins close when week 1 opens. You can still start a promise of your own.</Text>}
      {model.status !== 'not-joined' && <Text style={styles.muted}>Your ritual is part of this Season.</Text>}
    </View>
    <Section title="How it feels" aside="SOLO, NOT ALONE">
      <Text style={styles.muted}>A small count of people showing up. No leaderboard. No shared stake.</Text>
    </Section>
    <Footnote>Devnet · tSKR is a test token with no real value</Footnote>
  </ScrollView>
}

function parseAddress(value: unknown): PublicKey | null {
  if (typeof value !== 'string') return null
  try {
    const address = new PublicKey(value)
    return address.equals(PublicKey.default) ? null : address
  } catch { return null }
}

function StateView({ title, body }: { title: string; body: string }) {
  return <View style={styles.center} accessibilityRole="progressbar" accessibilityLiveRegion="polite"><Text style={styles.heading}>{title}</Text><Text style={styles.muted}>{body}</Text></View>
}

function ErrorView({ message, onRetry, onHome }: { message: string; onRetry: () => void; onHome: () => void }) {
  return <View style={styles.center} accessibilityLiveRegion="polite"><Text style={styles.heading}>Season unavailable</Text><Text style={styles.muted}>{message}</Text><ActionButton tone="quiet" label="Try again" onPress={onRetry} /><ActionButton tone="dark" label="Home" onPress={onHome} /></View>
}

const styles = StyleSheet.create({
  screen: { backgroundColor: color.bg },
  content: { padding: space.screen, paddingBottom: 48, gap: space.md },
  kicker: { ...type.label, color: color.muted },
  dates: { ...type.caption, color: color.muted, textAlign: 'center' },
  status: { backgroundColor: color.card, borderColor: color.line, borderWidth: 1, borderRadius: 15, padding: space.lg, gap: space.xs },
  statusTitle: { ...type.heading, color: color.fg },
  heading: { ...type.section, color: color.fg, textAlign: 'center' },
  muted: { ...type.body, color: color.muted },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: color.bg, padding: space.screen, gap: space.md },
})

export type { SeasonRitualStatus }
export { seasonRitualStatus, seasonStatusLabel }
