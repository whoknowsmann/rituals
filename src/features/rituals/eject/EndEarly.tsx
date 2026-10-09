import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { PublicKey } from '@solana/web3.js'
import type { RootStackParamList } from '../../../navigators/AppNavigator'
import type { EjectQuote } from '../../../data/rituals/ejectQuote'
import { useAuthorization } from '../../../utils/useAuthorization'
import { useConnection } from '../../../utils/ConnectionProvider'
import { ActionButton, Poster, PosterLine } from '../../../components/crew'
import { radius, space, type, themedStyles, useColors } from '../../../theme'
import { useRitualClient } from '../client/useRitualClient'
import { listKnownRituals, loadKnownRitualBundles } from '../authoritativeRituals'
import { ritualTintAmong } from '../home/ritualColours'
import { asyncStoragePendingActionStore } from '../recovery/pendingAction'
import { clearRitualReminders } from '../reminders/runtime'
import { labelSoloDestination } from '../solo/lifecycle/soloRitualModel'
import { useSoloDestinationOwner } from '../solo/lifecycle/useSoloDestinationOwner'
import { useRitualAction } from '../useRitualAction'
import { withWalletHandoff } from '../walletHandoff'
import { buildEjectDeps } from './ejectDeps'
import { ejectRows, ejectTitle, endableRituals, nameConfirmed, type EndableRitual } from './ejectFlow'

export type EndingRitual = EndableRitual & Readonly<{ tint: string }>

/** Active solo rituals this wallet made, each with a quiet "End early". Nothing renders without one. */
export function YourRituals({ onEnd }: { onEnd: (ritual: EndingRitual) => void }) {
  const s = useS()
  const client = useRitualClient()
  const { selectedAccount } = useAuthorization()
  const focused = useIsFocused()
  const wallet = selectedAccount?.publicKey.toBase58() ?? null
  const [rituals, setRituals] = useState<readonly EndingRitual[]>([])
  const [loadError, setLoadError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  useEffect(() => {
    setLoadError(false)
    if (!focused || client.status !== 'ready' || !wallet) { setRituals([]); return }
    let active = true
    void Promise.all([loadKnownRitualBundles(client.client), listKnownRituals()])
      .then(([loaded, known]) => { if (active) setRituals(endableRituals(loaded, new PublicKey(wallet)).map((ritual) => Object.freeze({ ...ritual, tint: ritualTintAmong(ritual.address, known) }))) })
      .catch(() => { if (active) { setRituals([]); setLoadError(true) } })
    return () => { active = false }
  }, [client, focused, wallet, retryCount])
  if (rituals.length === 0 && !loadError) return null
  return (
    <View style={s.card} accessibilityLabel="Your rituals">
      <Text style={s.heading} accessibilityRole="header">Your rituals</Text>
      {loadError && <ActionButton tone="quiet" label="Try again" onPress={() => setRetryCount((count) => count + 1)} />}
      {rituals.map((ritual) => (
        <View key={ritual.address} style={s.row}>
          <Text style={s.name} numberOfLines={1}>{ritual.title}</Text>
          <Pressable onPress={() => onEnd(ritual)} accessibilityRole="button" accessibilityLabel={`End ${ritual.title} early`} hitSlop={10}>
            <Text style={s.link}>End early</Text>
          </Pressable>
        </View>
      ))}
    </View>
  )
}

/** Step one: the money. Step two: type the name. Then one wallet approval. */
export function EndEarly({ ritual, onClose }: { ritual: EndingRitual; onClose: () => void }) {
  const s = useS()
  const colors = useColors()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const client = useRitualClient()
  const { connection } = useConnection()
  const { selectedAccount, walletPackage } = useAuthorization()
  const accountRef = useRef(selectedAccount); accountRef.current = selectedAccount
  const address = useMemo(() => new PublicKey(ritual.address), [ritual.address])
  const [quote, setQuote] = useState<EjectQuote | null>(null)
  const quoteRef = useRef<EjectQuote | null>(null); quoteRef.current = quote
  const [step, setStep] = useState<'money' | 'name'>('money')
  const [typed, setTyped] = useState('')
  const [line, setLine] = useState<string | null>(null)
  const moved = useRef(false)
  const finished = useRef(false)
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose

  useEffect(() => {
    if (client.status !== 'ready') return
    let active = true
    void client.client.getEjectQuote(address).then((value) => { if (active) setQuote(value) }, () => { if (active) setLine('Could not read this ritual.') })
    return () => { active = false }
  }, [client, address])
  const destinationOwner = useSoloDestinationOwner(ritual.address, quote?.ritual.account.forfeitDestination, quote?.ritual.account.stakeMint)

  const makeDeps = useCallback(() => {
    if (client.status !== 'ready' || !selectedAccount || !quoteRef.current) throw new Error('Ritual or wallet is not ready')
    moved.current = false
    return buildEjectDeps({
      client: client.client, ritualAddress: address, actor: selectedAccount.publicKey, shown: quoteRef.current,
      onAmountsChanged: (next) => { moved.current = true; setQuote(next); setStep('money') },
      authorizedActor: () => accountRef.current?.publicKey ?? null,
      pendingActionStore: asyncStoragePendingActionStore,
      getBlockHeight: () => connection.getBlockHeight('confirmed'),
      getSignatureStatus: async (signature) => {
        const value = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0]
        return value ? { slot: value.slot, err: value.err, confirmationStatus: value.confirmationStatus ?? null } : null
      },
    })
  }, [address, client, connection, selectedAccount])
  const eject = useRitualAction(makeDeps)

  const ended = useCallback(() => {
    if (finished.current) return
    finished.current = true
    void clearRitualReminders(ritual.address).catch(() => undefined).finally(() => {
      onCloseRef.current()
      navigation.navigate('SoloRitual', { ritualId: ritual.address })
    })
  }, [navigation, ritual.address])
  // A lost or cancelled wallet reply is settled by the chain (useRitualAction reconciles it), not by the reply.
  useEffect(() => { if (eject.state.status === 'confirmed' || eject.state.status === 'recovered') ended() }, [eject.state.status, ended])
  useEffect(() => {
    if (eject.state.status !== 'error') return
    const maybeLanded = eject.state.submitted || eject.state.unresolved || eject.state.category === 'confirmation'
    if (moved.current) { setLine('Amounts changed.'); return }
    if (!maybeLanded) { setLine(eject.state.category === 'network-mismatch' || eject.state.category === 'transaction-failed' ? eject.copy.body : 'Nothing was sent.'); return }
    setLine(eject.copy.body)
  }, [eject.copy.body, eject.state])

  const decimals = quote?.ritual.account.stakeDecimals ?? 6
  const rows = quote ? ejectRows(quote, labelSoloDestination(quote.ritual.account.forfeitDestination, undefined, destinationOwner), decimals) : [{ label: 'Back to you', value: '…' }]
  const busy = eject.isBusy || eject.state.status === 'confirmed' || eject.state.status === 'recovered'
  const busyLabel = withWalletHandoff(eject.copy, eject.state.status, walletPackage).title

  return (
    <View style={s.flow}>
      <Poster tint={ritual.tint} title={ejectTitle(ritual.title)}>
        {rows.map((row) => <PosterLine key={row.label} label={row.label} value={row.value} />)}
      </Poster>
      {step === 'money'
        ? <ActionButton label="Continue" onPress={() => { setLine(null); setStep('name') }} disabled={!quote} />
        : <>
          <TextInput value={typed} onChangeText={setTyped} placeholder={ritual.title} placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} editable={!busy} style={s.input} accessibilityLabel={`Type ${ritual.title} to confirm`} />
          <ActionButton tone="dark" label={busy ? busyLabel : 'End and get it back'} onPress={() => { setLine(null); eject.start() }} disabled={!nameConfirmed(typed, ritual.title) || !eject.canSubmit} loading={busy} />
        </>}
      {line && <Text style={s.muted} accessibilityLiveRegion="polite">{line}</Text>}
      <ActionButton tone="quiet" label="Cancel" onPress={onClose} disabled={busy} />
    </View>
  )
}

const useS = themedStyles((color) => StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.sm },
  heading: { ...type.heading, color: color.fg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingVertical: space.xs },
  name: { ...type.body, color: color.fg, flexShrink: 1 },
  link: { ...type.body, color: color.muted, textDecorationLine: 'underline' },
  flow: { gap: space.md },
  input: { ...type.body, color: color.fg, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md },
  muted: { ...type.body, color: color.muted },
}))
