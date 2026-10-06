import React, { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text as RNText, View } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { useAuthorization } from '../utils/useAuthorization'
import { useRitualBundle, formatAtomic, listKnownRituals } from '../features/rituals/authoritativeRituals'
import { weekIsOpen, weekOpensLabel } from '../features/rituals/displayFormat'
import { claimCompletionTarget, parseRitualRouteParams } from '../features/rituals/claims/routeHelpers'
import { fundingPeople, ritualDetailModel } from '../features/rituals/crewView'
import { ActionButton, Footnote, PeopleList, Poster, PosterLine, Section } from '../components/crew'
import { color, memberColor, space, type } from '../theme'

export function RitualDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute()
  const parsed = parseRitualRouteParams((route as { params?: unknown }).params)
  const client = useRitualClient()
  const { selectedAccount } = useAuthorization()
  const state = useRitualBundle(client, parsed?.ritualId ?? '', undefined)
  const ritualId = parsed?.ritualId ?? null
  const [title, setTitle] = useState<string | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000); return () => clearInterval(t) }, [])
  useEffect(() => {
    if (!ritualId) return
    let active = true
    void listKnownRituals().then((known) => { if (active) setTitle(known.find((k) => k.address === ritualId)?.title ?? null) })
    return () => { active = false }
  }, [ritualId])

  if (!parsed) return <Unavailable onHome={() => navigation.navigate('RitualsHome')} message="That link doesn't point to a ritual." />
  if (state.status === 'loading') return <View style={s.center}><RNText style={s.muted}>Opening this ritual…</RNText></View>
  if (state.status === 'error' || !state.bundle) return <Unavailable onHome={() => navigation.navigate('RitualsHome')} onRetry={state.retry} message="We couldn't load this ritual. Check your connection and try again." />

  const { bundle } = state
  const account = bundle.ritual.account
  const me = selectedAccount?.publicKey ?? null
  const model = ritualDetailModel(account, me)
  const people = fundingPeople(account, me)
  const eventIndex = bundle.event?.account.eventIndex ?? account.currentEventIndex
  const target = claimCompletionTarget(parsed.ritualId, eventIndex)
  const claimOpen = bundle.event?.account.status === 'Claiming'
  const window = account.schedule[Math.min(account.currentEventIndex, account.schedule.length - 1)]
  const opensAt = window ? Number(window.opens) : null
  const open = opensAt !== null && weekIsOpen(opensAt, now)

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} accessibilityLabel="Ritual detail">
      <Poster tint={memberColor(0)} kicker={model.kicker} title={title ?? 'Your ritual'}>
        <PosterLine label="Each person puts in" value={formatAtomic(account.memberTotalStake, account.stakeDecimals)} />
        {account.status === 'Active' && opensAt !== null && !bundle.event && <PosterLine label={open ? 'This week' : `Week ${account.currentEventIndex + 1} opens`} value={open ? 'Open now' : weekOpensLabel(opensAt, now)} />}
      </Poster>

      {account.status === 'Funding' && (
        <>
          <Section title="Your crew" aside={model.progress} />
          <PeopleList people={people} />
          <RNText style={s.note}>Starts once everyone has put in their stake.</RNText>
          {model.myStakeNeeded && (
            <ActionButton label="Put in your stake" onPress={() => navigation.navigate('RitualAction', { ritualId: parsed.ritualId, phase: 'fund' })} />
          )}
        </>
      )}

      {account.status === 'Active' && (
        <>
          <Section title="This week" aside={bundle.event ? `Week ${eventIndex + 1}` : undefined} />
          {!bundle.event && !open && <RNText style={s.muted}>Nothing to do yet. Come back when week {account.currentEventIndex + 1} opens.</RNText>}
          {!bundle.event && open && <ActionButton tone="dark" label="Open this week" onPress={() => navigation.navigate('RitualAction', { ritualId: parsed.ritualId, phase: 'initialize-event', eventIndex })} />}
          {bundle.event?.account.status === 'Resolving' && <ActionButton tone="dark" label="Settle this week" onPress={() => navigation.navigate('RitualAction', { ritualId: parsed.ritualId, phase: 'finalize', eventIndex })} />}
          {model.showClaim && bundle.event && (
            <ActionButton label="I did it" disabled={!claimOpen} onPress={() => navigation.navigate(target.name, target.params)} accessibilityLabel="Claim completion" />
          )}
        </>
      )}

      {account.status === 'Completed' && <RNText style={s.muted}>This ritual is finished. Every week has settled.</RNText>}
      {account.status === 'Cancelled' && <RNText style={s.muted}>This ritual was called off before it started. Stakes went back to everyone who put in.</RNText>}

      <Footnote>Devnet · tSKR is a test token with no real value</Footnote>
    </ScrollView>
  )
}

function Unavailable({ onHome, onRetry, message }: { onHome: () => void; onRetry?: () => void; message: string }) {
  return (
    <View style={[s.content, s.center]} accessibilityLiveRegion="polite">
      <RNText style={s.heading}>This ritual is unavailable</RNText>
      <RNText style={s.muted}>{message}</RNText>
      {onRetry && <ActionButton tone="quiet" label="Try again" onPress={onRetry} />}
      <ActionButton tone="dark" label="Home" onPress={onHome} accessibilityLabel="Return home" />
    </View>
  )
}

const s = StyleSheet.create({
  screen: { backgroundColor: color.bg },
  content: { padding: space.screen, paddingBottom: 48, gap: space.md },
  center: { flex: 1, justifyContent: 'center', backgroundColor: color.bg, padding: space.screen },
  heading: { ...type.heading, color: color.fg },
  muted: { ...type.body, color: color.muted },
  note: { ...type.caption, color: color.muted, paddingHorizontal: 2 },
})
