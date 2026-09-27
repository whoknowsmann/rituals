import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../navigators/AppNavigator'
import { useRitualClient } from '../../features/rituals/client/useRitualClient'
import { useAuthorization } from '../../utils/useAuthorization'
import { useRitualBundle, listKnownRituals } from '../../features/rituals/authoritativeRituals'
import { useRitualAction } from '../../features/rituals/useRitualAction'
import { buildRitualActionDeps } from '../../features/rituals/buildRitualActionDeps'
import { asyncStoragePendingActionStore } from '../../features/rituals/recovery/pendingAction'
import { walletHandoffNote, withWalletHandoff } from '../../features/rituals/walletHandoff'
import { ActionButton, ErrorLine, Footnote, Stamp } from '../../components/crew'
import { color, radius, space, type } from '../../theme'
import { witnessConfirmModel } from '../../features/rituals/solo/lifecycle/witnessConfirmModel'
import { PublicKey } from '@solana/web3.js'

type Props = NativeStackScreenProps<RootStackParamList, 'WitnessConfirm'>

export function WitnessConfirmScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const client = useRitualClient()
  const { selectedAccount, walletPackage } = useAuthorization()
  const state = useRitualBundle(client, route.params.ritualId, route.params.eventIndex)
  const [requirement, setRequirement] = useState<string | null>(null)
  const accountRef = useRef(selectedAccount); accountRef.current = selectedAccount
  const currentBundle = state.status === 'ready' ? state.bundle : null
  useEffect(() => { void listKnownRituals().then((rituals) => setRequirement(rituals.find((item) => item.address === route.params.ritualId)?.requirement ?? null)) }, [route.params.ritualId])
  const makeDeps = useCallback(() => {
    if (client.status !== 'ready' || state.status !== 'ready' || !currentBundle || !selectedAccount) throw new Error('Ritual or wallet is not ready')
    const ritualAddress = new PublicKey(route.params.ritualId)
    const claimant = currentBundle.claims.find((entry) => entry.account !== null)?.member ?? currentBundle.ritual.account.members[0]
    return buildRitualActionDeps({ client: client.client, ritualAddress, actor: selectedAccount.publicKey, kind: 'approve', eventIndex: route.params.eventIndex, claimant, pendingActionStore: asyncStoragePendingActionStore, authorizedActor: () => accountRef.current?.publicKey ?? null })
  }, [client, currentBundle, route.params.eventIndex, route.params.ritualId, selectedAccount, state.status])
  const action = useRitualAction(makeDeps)
  const confirmedDigest = useRef<string | null>(null)
  useEffect(() => {
    if (action.state.status === 'confirmed' && confirmedDigest.current !== action.state.result.messageDigest) { confirmedDigest.current = action.state.result.messageDigest; state.retry() }
  }, [action.state])

  if (state.status === 'loading') return <Centered>Reading the check-in…</Centered>
  if (state.status === 'error' || !state.bundle) return <ErrorState message={state.message ?? 'This check-in could not be read.'} retry={state.retry} onHome={() => navigation.goBack()} />
  const model = witnessConfirmModel(state.bundle, selectedAccount?.publicKey ?? null, requirement)
  const copy = withWalletHandoff(action.copy, action.state.status, walletPackage)
  const canConfirm = model.authorized && model.state === 'pending' && action.canSubmit && !action.isBusy
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.kicker}>WITNESS VIEW</Text>
      <Text style={s.title} accessibilityRole="header">Did {model.name} make it?</Text>
      <View style={s.card}>
        <Text style={s.kicker}>THIS WEEK</Text>
        <Text style={s.cardTitle}>{model.requirement}</Text>
        <Text style={s.muted}>{model.message}</Text>
        {model.state === 'confirmed' ? <Stamp kind="showed-up" note="Confirmed by the witness." /> : null}
        {model.state === 'unavailable' ? <ErrorLine>This check-in is not available yet.</ErrorLine> : null}
        {!model.authorized && model.state !== 'confirmed' ? <Text style={s.muted}>Only the ritual witness can confirm this check-in.</Text> : null}
        {action.state.status !== 'idle' && model.state !== 'confirmed' ? <Text style={s.muted}>{action.state.status === 'awaiting-wallet' ? copy.body : action.state.status === 'confirmed' ? 'Checking the updated check-in…' : action.state.status === 'error' ? action.copy.body : 'Getting this check-in ready…'}</Text> : null}
        {model.state === 'pending' && model.authorized && action.state.status === 'idle' ? <Text style={s.note}>{walletHandoffNote(walletPackage)}</Text> : null}
        {action.state.status === 'error' && <ErrorLine>{action.copy.body}</ErrorLine>}
        {action.state.status === 'error' && action.canSubmit ? <ActionButton tone="quiet" label="Try again" onPress={action.reset} /> : null}
        {model.state === 'pending' ? <ActionButton label={action.isBusy ? 'Working…' : 'I saw it · confirm'} onPress={action.start} disabled={!canConfirm} loading={action.isBusy} /> : null}
      </View>
      <Text style={s.note}>Witnesses never stake and never receive money.</Text>
      <ActionButton tone="quiet" label="Back" onPress={() => navigation.goBack()} />
      <Footnote>Devnet · TEST tokens have no real value</Footnote>
    </ScrollView>
  )
}

function Centered({ children }: { children: React.ReactNode }) { return <View style={s.center}><Text style={s.muted}>{children}</Text></View> }
function ErrorState({ message, retry, onHome }: { message: string; retry: () => void; onHome: () => void }) { return <View style={s.center}><Text style={s.title}>Witness view unavailable</Text><ErrorLine>{message}</ErrorLine><ActionButton tone="quiet" label="Try again" onPress={retry} /><ActionButton tone="dark" label="Back" onPress={onHome} /></View> }

const s = StyleSheet.create({
  screen: { backgroundColor: color.bg }, content: { padding: space.screen, paddingBottom: 48, gap: space.md }, kicker: { ...type.label, color: color.muted }, title: { ...type.display, color: color.fg }, card: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.md }, cardTitle: { ...type.title, color: color.fg }, muted: { ...type.body, color: color.muted }, note: { ...type.caption, color: color.faint, textAlign: 'center' }, center: { flex: 1, padding: space.screen, justifyContent: 'center', gap: space.md, backgroundColor: color.bg },
})
