import React, { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../navigators/AppNavigator'
import { useRitualClient } from '../../features/rituals/client/useRitualClient'
import { useAuthorization } from '../../utils/useAuthorization'
import { useRitualBundle } from '../../features/rituals/authoritativeRituals'
import { readSoloNotes, type SoloNotes } from '../../features/rituals/solo/notes/soloNotes'
import { keptSaying } from '../../features/rituals/solo/sayings'
import { formatAtomic } from '../../features/rituals/displayFormat'
import { ActionButton, ErrorLine, Footnote, Stamp } from '../../components/crew'
import { color, fonts, radius, space, type, themedStyles, useColors } from '../../theme'
import { soloReceiptModel } from '../../features/rituals/solo/lifecycle/soloReceiptModel'

type Props = NativeStackScreenProps<RootStackParamList, 'SoloReceipt'>

export function SoloReceiptScreen({ route }: Props) { const s = useS();
  const navigation = useNavigation()
  const client = useRitualClient()
  const { selectedAccount } = useAuthorization()
  const state = useRitualBundle(client, route.params.ritualId, route.params.eventIndex)
  const [soloNotes, setSoloNotes] = useState<SoloNotes | null>(null)
  useFocusEffect(useCallback(() => {
    let active = true
    void readSoloNotes(route.params.ritualId).then((notes) => { if (active) setSoloNotes(notes) })
    return () => { active = false }
  }, [route.params.eventIndex, route.params.ritualId]))
  if (state.status === 'loading') return <Centered>Reading the week…</Centered>
  if (state.status === 'error' || !state.bundle) return <ErrorState message={state.message ?? 'This week could not be read.'} retry={state.retry} onHome={() => navigation.goBack()} />
  const receipt = soloReceiptModel(state.bundle, selectedAccount?.publicKey ?? null)
  const decimals = state.bundle.ritual.account.stakeDecimals
  const receiptNote = soloNotes?.notes[String(route.params.eventIndex)] ?? null
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} accessibilityLabel="Solo receipt">
      <Text style={s.kicker}>RECEIPT</Text>
      <Text style={s.title} accessibilityRole="header">Week {route.params.eventIndex + 1}</Text>
      {receipt.state === 'pending' ? <View style={s.card}><Text style={s.cardTitle}>Not closed yet</Text><Text style={s.muted}>This week has not settled. Come back after the week closes.</Text></View> : null}
      {receipt.state === 'kept' ? <View style={s.card}><Text style={s.cardTitle}>Your stake is {receipt.copy}</Text><Stamp kind="kept" note={keptSaying(route.params.ritualId, route.params.eventIndex)} />{receiptNote ? <View style={s.receiptNote}><Text style={s.noteLabel}>YOUR NOTE</Text><Text style={s.hand}>{receiptNote}</Text></View> : null}<Row label="Your stake" value={`${formatAtomic(receipt.amount, decimals)} · ${receipt.copy}`} /></View> : null}
      {receipt.state === 'missed' ? <View style={s.card}><Text style={s.cardTitle}>This week was missed</Text><Stamp kind="missed" note="That's a week, not a verdict." animate={false} /><Row label="Missed stake" value={formatAtomic(receipt.amount, decimals)} /><Row label="Destination" value={receipt.destinationLabel ?? 'the locked destination'} /><Text style={s.consequence}>That week's stake went where you chose before the ritual began.</Text></View> : null}
      {receipt.state === 'skipped' ? <View style={s.paper}><Stamp kind="skipped" note="Your stake comes back." animate={false} /><Text style={s.muted}>This week was declared skipped before it opened.</Text></View> : null}
      <ActionButton tone="quiet" label="Back to my rituals" onPress={() => navigation.goBack()} />
      <Footnote>Devnet · TEST tokens have no real value</Footnote>
    </ScrollView>
  )
}

function Row({ label, value }: { label: string; value: string }) { const s = useS(); return <View style={s.row}><Text style={s.muted}>{label}</Text><Text style={s.value}>{value}</Text></View> }
function Centered({ children }: { children: React.ReactNode }) { const s = useS(); return <View style={s.center}><Text style={s.muted}>{children}</Text></View> }
function ErrorState({ message, retry, onHome }: { message: string; retry: () => void; onHome: () => void }) { const s = useS(); return <View style={s.center}><Text style={s.title}>Receipt unavailable</Text><ErrorLine>{message}</ErrorLine><ActionButton tone="quiet" label="Try again" onPress={retry} /><ActionButton tone="dark" label="Back" onPress={onHome} /></View> }

const useS = themedStyles((color) => StyleSheet.create({
  screen: { backgroundColor: color.bg }, content: { padding: space.screen, paddingBottom: 48, gap: space.md }, kicker: { ...type.label, color: color.muted }, title: { ...type.display, color: color.fg }, card: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.md }, paper: { backgroundColor: color.paperMuted, borderRadius: radius.lg, padding: space.lg, gap: space.md }, cardTitle: { ...type.title, color: color.fg }, muted: { ...type.body, color: color.muted }, value: { ...type.bodyStrong, color: color.fg, textAlign: 'right', flexShrink: 1 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.sm }, receiptNote: { gap: space.xs }, noteLabel: { ...type.label, color: color.muted }, consequence: { ...type.body, color: color.danger }, hand: { ...type.body, fontFamily: fonts.hand, color: color.fg }, center: { flex: 1, padding: space.screen, justifyContent: 'center', gap: space.md, backgroundColor: color.bg },
}))
