import React, { useCallback, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../navigators/AppNavigator'
import { useRitualClient } from '../../features/rituals/client/useRitualClient'
import { useAuthorization } from '../../utils/useAuthorization'
import { useSoloRitualBundle } from '../../features/rituals/solo/lifecycle/useSoloRitualBundle'
import { readSoloNotes, type SoloNotes } from '../../features/rituals/solo/notes/soloNotes'
import { keptSaying } from '../../features/rituals/solo/sayings'
import { ActionButton, ErrorLine, Footnote, Stamp } from '../../components/crew'
import { color, fonts, radius, space, type, themedStyles, useColors } from '../../theme'
import { soloReceiptModel, soloReceiptMoneyLine } from '../../features/rituals/solo/lifecycle/soloReceiptModel'
import { useSoloDestinationOwner } from '../../features/rituals/solo/lifecycle/useSoloDestinationOwner'

type Props = NativeStackScreenProps<RootStackParamList, 'SoloReceipt'>

export function SoloReceiptScreen({ route }: Props) { const s = useS();
  const navigation = useNavigation()
  const client = useRitualClient()
  const { selectedAccount } = useAuthorization()
  const state = useSoloRitualBundle(client, route.params.ritualId, route.params.eventIndex)
  const destinationOwner = useSoloDestinationOwner(route.params.ritualId, state.bundle?.ritual.account.forfeitDestination, state.bundle?.ritual.account.stakeMint)
  const [soloNotes, setSoloNotes] = useState<SoloNotes | null>(null)
  useFocusEffect(useCallback(() => {
    let active = true
    void readSoloNotes(route.params.ritualId).then((notes) => { if (active) setSoloNotes(notes) })
    return () => { active = false }
  }, [route.params.eventIndex, route.params.ritualId]))
  if (state.status === 'loading') return <Centered>Reading the week…</Centered>
  if (state.status === 'error' || !state.bundle) return <ErrorState message={state.message ?? 'This week could not be read.'} retry={state.retry} onHome={() => navigation.goBack()} />
  if (!selectedAccount || !state.bundle.ritual.account.creator.equals(selectedAccount.publicKey)) return <Centered>Connect the wallet that created this ritual.</Centered>
  const receipt = soloReceiptModel(state.bundle, selectedAccount?.publicKey ?? null, destinationOwner)
  const moneyLine = soloReceiptMoneyLine(state.bundle, destinationOwner)
  const receiptNote = soloNotes?.notes[String(route.params.eventIndex)] ?? null
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} accessibilityLabel="Solo receipt">
      <Text style={s.kicker}>RECEIPT</Text>
      <Text style={s.title} accessibilityRole="header">Week {route.params.eventIndex + 1}</Text>
      {receipt.state === 'pending' ? <View style={s.card}><Text style={s.cardTitle}>Not closed yet</Text><Text style={s.muted}>This week has not settled. Come back after the week closes.</Text></View> : null}
      {receipt.state === 'kept' ? <View style={s.card}><Stamp kind="kept" note={keptSaying(route.params.ritualId, route.params.eventIndex, state.bundle.ritual.account.schedule.length)} />{moneyLine && <Text style={s.muted}>{moneyLine}</Text>}{receiptNote ? <View style={s.receiptNote}><Text style={s.noteLabel}>YOUR NOTE</Text><Text style={s.hand}>{receiptNote}</Text></View> : null}</View> : null}
      {receipt.state === 'missed' ? <View style={s.card}><Stamp kind="missed" note={route.params.eventIndex + 1 < (state.status === 'ready' ? state.bundle.ritual.account.schedule.length : 0) ? "That's a week, not a verdict." : undefined} animate={false} />{moneyLine && <Text style={s.muted}>{moneyLine}</Text>}</View> : null}
      {receipt.state === 'skipped' ? <View style={s.paper}><Stamp kind="skipped" note="Your stake comes back." animate={false} />{moneyLine && <Text style={s.muted}>{moneyLine}</Text>}</View> : null}
      {/* The receipt is a reading of chain state; let anyone check it (Jack, 2026-10-12: an in-app
          receipt that claims money went to a cause must point at the transaction, or it looks hidden). */}
      {receipt.state !== 'pending' && state.bundle.event && (
        <ActionButton tone="link" label="View on Solana Explorer" accessibilityLabel="View this week's settlement on Solana Explorer"
          onPress={() => { void Linking.openURL(explorerAccountUrl(state.bundle!.event!.address.toBase58())).catch(() => {}) }} />
      )}
      <ActionButton tone="link" label="Back to ritual" onPress={() => navigation.goBack()} />
      <Footnote>Devnet · tSKR is a test token with no real value</Footnote>
    </ScrollView>
  )
}


/** Devnet account page: the week's settle transaction and the token transfer it made sit in its history. */
export function explorerAccountUrl(address: string): string { return `https://explorer.solana.com/address/${address}?cluster=devnet` }

function Centered({ children }: { children: React.ReactNode }) { const s = useS(); return <View style={s.center}><Text style={s.muted}>{children}</Text></View> }
function ErrorState({ message, retry, onHome }: { message: string; retry: () => void; onHome: () => void }) { const s = useS(); return <View style={s.center}><Text style={s.title}>Receipt unavailable</Text><ErrorLine>{message}</ErrorLine><ActionButton tone="quiet" label="Try again" onPress={retry} /><ActionButton tone="dark" label="Back" onPress={onHome} /></View> }

const useS = themedStyles((color) => StyleSheet.create({
  screen: { backgroundColor: color.bg }, content: { padding: space.screen, paddingBottom: 48, gap: space.md }, kicker: { ...type.label, color: color.muted }, title: { ...type.display, color: color.fg }, card: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.md }, paper: { backgroundColor: color.paperMuted, borderRadius: radius.lg, padding: space.lg, gap: space.md }, cardTitle: { ...type.title, color: color.fg }, muted: { ...type.body, color: color.muted }, value: { ...type.bodyStrong, color: color.fg, textAlign: 'right', flexShrink: 1 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.sm }, receiptNote: { gap: space.xs }, noteLabel: { ...type.label, color: color.muted }, consequence: { ...type.body, color: color.danger }, hand: { ...type.body, fontFamily: fonts.hand, color: color.fg }, center: { flex: 1, padding: space.screen, justifyContent: 'center', gap: space.md, backgroundColor: color.bg },
}))
