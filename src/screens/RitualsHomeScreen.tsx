import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Card, Divider, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { loadKnownRitualBundles, nextEventLabel, formatAtomic, statusLabel, type KnownRitual } from '../features/rituals/authoritativeRituals'
import { homeCreateTarget } from '../features/rituals/create/routeHelpers'
import { ritualDetailTarget } from '../features/rituals/claims/routeHelpers'
import { palette, radius, space, type } from '../theme'

export function RitualsHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const client = useRitualClient()
  const [homeState, setHomeState] = useState<{ status: 'loading' | 'ready' | 'error'; rituals: readonly (KnownRitual & { bundle: Awaited<ReturnType<typeof loadKnownRitualBundles>>[number]['bundle'] })[]; message?: string }>({ status: 'loading', rituals: [] })
  const mounted = useRef(false)
  const requestGeneration = useRef(0)

  const load = useCallback(() => {
    const generation = ++requestGeneration.current
    setHomeState({ status: 'loading', rituals: [] })
    if (client.status !== 'ready') { setHomeState({ status: 'error', rituals: [], message: client.reason }); return }
    void loadKnownRitualBundles(client.client)
      .then((rituals) => { if (mounted.current && generation === requestGeneration.current) setHomeState({ status: 'ready', rituals }) })
      .catch((error: unknown) => { if (mounted.current && generation === requestGeneration.current) setHomeState({ status: 'error', rituals: [], message: safeErrorMessage(error) }) })
  }, [client])

  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; requestGeneration.current += 1 } }, [load])
  const disclosure = 'DEVNET · TEST TOKENS · AUTHORITATIVE CHAIN READS'
  const view = { disclosure }
  if (homeState.status === 'loading') return <View style={styles.center} accessibilityRole="progressbar" accessibilityLiveRegion="polite"><ActivityIndicator accessibilityLabel="Loading rituals" /><Text style={styles.muted}>Reading your rituals from devnet…</Text><Text style={styles.disclosure}>{view.disclosure}</Text></View>
  if (homeState.status === 'error') return <View style={styles.center} accessibilityLiveRegion="polite"><Text variant="headlineSmall">Could not read your rituals</Text><Text style={styles.muted}>{homeState.message}</Text><Text style={styles.disclosure}>{view.disclosure}</Text><Button mode="contained" onPress={load} accessibilityLabel="Try again">Try again</Button></View>
  // Live records use the canonical address as their stable key; the old fixture shape used key={ritual.id}.
  return <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Rituals home">
    <View style={styles.hero} accessibilityRole="header"><Text style={styles.wordmark}>Rituals</Text><Text style={styles.tagline}>Show up, or pay up.</Text></View>
    {homeState.rituals.length === 0 ? <Card style={styles.card}><Card.Content><Text variant="titleLarge">No rituals saved on this device</Text><Text style={styles.body}>Create or join a ritual to add its address here. Each saved address is read directly from devnet; no backend or indexer is used.</Text><Button mode="contained" onPress={() => navigation.navigate(homeCreateTarget().name)} accessibilityLabel="Create Ritual">Create Ritual</Button></Card.Content></Card> : homeState.rituals.map(({ address, title, requirement, bundle }) => <Card key={address} style={styles.card}><Card.Content style={styles.cardBody}><Text style={styles.ritualTitle}>{title}</Text><Text style={styles.body}>{requirement}</Text><View style={styles.potBlock}><Text style={styles.label}>YOUR STAKE</Text><Text style={styles.potAmount}>{formatAtomic(bundle.ritual.account.memberTotalStake, bundle.ritual.account.stakeDecimals)}</Text><Text style={styles.potNote}>Read from the Ritual account on devnet.</Text></View><View style={styles.metaRow}><View style={styles.metaItem}><Text style={styles.label}>STATUS</Text><Text style={styles.metaValue}>{statusLabel(bundle.ritual.account.status)}</Text></View><View style={styles.metaItem}><Text style={styles.label}>CREW</Text><Text style={styles.metaValue}>{bundle.ritual.account.fundedMemberCount}/{bundle.ritual.account.members.length} funded</Text></View></View><Divider style={styles.divider} /><Text style={styles.next}>NEXT · {nextEventLabel(bundle)}</Text><Button mode="contained" style={styles.cardAction} onPress={() => { const target = ritualDetailTarget(address); navigation.navigate(target.name, target.params) }} accessibilityLabel={`Open ${title}`}>Open group</Button></Card.Content></Card>)}
    <Button mode="contained-tonal" onPress={() => navigation.navigate(homeCreateTarget().name)} accessibilityLabel="Create a new Ritual">Create a new Ritual</Button><Button mode="outlined" onPress={() => navigation.navigate('JoinRitual', {})} accessibilityLabel="Join with an invite">Join with an invite</Button><Text style={styles.disclosure}>{view.disclosure}</Text>
  </ScrollView>
}

export const safeErrorMessage = (_error: unknown): string => 'Unable to load rituals right now. Check your connection and try again.'
const makeStyles = (theme: MD3Theme) => StyleSheet.create({ content: { padding: space.lg, paddingBottom: space.xxl, gap: space.md }, hero: { paddingTop: space.sm, paddingBottom: space.lg, gap: space.sm }, wordmark: { ...type.display, color: palette.bone }, tagline: { ...type.body, color: palette.gold500, fontWeight: '600' }, card: { borderRadius: radius.lg, backgroundColor: palette.ink800, borderWidth: 1, borderColor: palette.ink600 }, cardBody: { paddingVertical: space.lg }, ritualTitle: { ...type.title, color: palette.bone }, body: { ...type.body, color: palette.bone70, marginTop: space.sm }, potBlock: { marginTop: space.lg, padding: space.lg, borderRadius: radius.md, backgroundColor: palette.goldDim, borderWidth: 1, borderColor: palette.gold600, gap: space.xs }, potAmount: { ...type.money, color: palette.gold400 }, potNote: { ...type.caption, color: palette.gold500, marginTop: space.xs }, metaRow: { flexDirection: 'row', gap: space.lg, marginTop: space.lg, flexWrap: 'wrap' }, metaItem: { flexGrow: 1, flexBasis: 120, gap: space.xs }, metaValue: { ...type.heading, color: palette.bone }, label: { ...type.label, color: palette.bone50 }, divider: { marginVertical: space.lg, backgroundColor: palette.ink600 }, next: { ...type.label, color: palette.green500, marginBottom: space.md }, cardAction: { borderRadius: radius.pill }, muted: { ...type.body, color: palette.bone70, marginTop: space.sm }, disclosure: { ...type.label, color: palette.bone50, textAlign: 'center', marginVertical: space.md }, demo: { ...type.caption, color: palette.bone50, marginTop: space.lg }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md } })
