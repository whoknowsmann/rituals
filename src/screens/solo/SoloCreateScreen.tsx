import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import { PublicKey } from '@solana/web3.js'
import { decodeSeason, type SeasonAccountView } from '../../data/rituals/accounts'
import { DEMO_CAUSE } from '../../data/rituals/demoConfig'
import { useRitualClient } from '../../features/rituals/client/useRitualClient'
import { useCreateRitual } from '../../features/rituals/create/useCreateRitual'
import { useAuthorization } from '../../utils/useAuthorization'
import { needsDevnetSwitchHint, SEED_VAULT_DEVNET_HINT } from '../../utils/walletChoice'
import { useConnection } from '../../utils/ConnectionProvider'
import { walletHandoffNote, withWalletHandoff } from '../../features/rituals/walletHandoff'
import { rememberRitual } from '../../features/rituals/authoritativeRituals'
import { asyncStoragePendingActionStore } from '../../features/rituals/recovery/pendingAction'
import { saveProofMode } from '../../features/rituals/solo/notes/soloNotes'
import { parseTokenAmount } from '../../features/rituals/create/decimal'
import { formatAtomic } from '../../features/rituals/displayFormat'
import { suggestRituals, type RitualSuggestion } from '../../features/rituals/create/suggestRituals'
import { DEMO_SOLO_CADENCE } from '../../domain/rituals/schedule'
import { ActionButton, ErrorLine, Footnote, Hero, Section, Stamp } from '../../components/crew'
import { color, fonts, radius, space, type, themedStyles, useColors } from '../../theme'
import { buildSoloCreateDeps } from '../../features/rituals/solo/create/buildSoloCreateDeps'
import { selectSoloSchedule, soloEventCount, SOLO_MAX_WEEKS, SOLO_MIN_WEEKS, STAKE_PRESETS, stepWeeks } from '../../features/rituals/solo/create/schedule'
import { shouldReturnToFirstCreateStep } from '../../features/rituals/solo/create/navigationGuard'
import { nextSoloCreateStep, previousSoloCreateStep, soloCreateStepPosition, soloCreateSteps, type SoloCreateStep } from '../../features/rituals/solo/create/steps'
import { SCOPE } from '../../features/rituals/productScope'
import { loadOrCreateSettler } from '../../features/rituals/solo/settler/settlerKey'
import { formatSol, settlerBudgetLamports } from '../../features/rituals/solo/settler/settlerBudget'
import { startedSaying } from '../../features/rituals/solo/sayings'
import { suggestionIsSelected, suggestionKey } from '../../features/rituals/solo/create/suggestionSelection'
import {
  SOLO_CREATE_MESSAGES,
  applyTypedIntention,
  destinationChoices,
  publicKeyFromCanonical,
  validateSoloCreateStep,
  validateWitnessAddress,
  type SoloCreateDraft,
} from '../../features/rituals/solo/create/validation'
import type { RootStackParamList } from '../../navigators/AppNavigator'

type Props = NativeStackScreenProps<RootStackParamList, 'SoloCreate'>
type Navigation = NativeStackNavigationProp<RootStackParamList>
type SeasonRead = Readonly<{ status: 'loading' | 'ready' | 'error'; account?: SeasonAccountView; message?: string }>

const CREATE_STEPS = soloCreateSteps(SCOPE)

const initialDraft: SoloCreateDraft = {
  intention: '',
  title: '',
  requirement: '',
  witnessMode: 'just-me',
  witnessAddress: '',
  // With the chooser hidden, every new promise offers the note line at each stamp.
  proofMode: SCOPE.proofChooser ? 'none' : 'note',
  stakePerWeek: '5',
  destination: 'cause',
  personAddress: '',
}

export function SoloCreateScreen({ route }: Props) { const styles = useStyles(); const color = useColors();
  const navigation = useNavigation<Navigation>()
  const { connection } = useConnection()
  const client = useRitualClient()
  const { selectedAccount, walletPackage } = useAuthorization()
  const accountRef = useRef(selectedAccount)
  accountRef.current = selectedAccount
  const [step, setStep] = useState<SoloCreateStep>(1)
  const stepPosition = soloCreateStepPosition(step, CREATE_STEPS)
  const [draft, setDraft] = useState<SoloCreateDraft>(initialDraft)
  const [pickedEventCount, setPickedEventCount] = useState<string | number | undefined>(undefined)
  const [selectedSuggestionKey, setSelectedSuggestionKey] = useState<string | null>(null)
  const [stepErrors, setStepErrors] = useState<readonly string[]>([])
  const [suggestionRound, setSuggestionRound] = useState(0)
  const [confirmedReadback, setConfirmedReadback] = useState(false)
  const [readbackError, setReadbackError] = useState<string | null>(null)
  // The app's settle key, pre-paid in this same approval so weeks close with
  // no further wallet prompt. Without it, create still works (manual settle).
  const [settlerKey, setSettlerKey] = useState<PublicKey | null>(null)
  useEffect(() => {
    let active = true
    void loadOrCreateSettler().then((key) => { if (active) setSettlerKey(key.publicKey) }).catch(() => undefined)
    return () => { active = false }
  }, [])
  const seasonAddressText = SCOPE.seasons ? route.params?.seasonAddress : undefined
  const seasonAddress = useMemo(() => {
    if (!seasonAddressText) return null
    try { return new PublicKey(seasonAddressText) } catch { return null }
  }, [seasonAddressText])
  const [season, setSeason] = useState<SeasonRead>(() => seasonAddressText ? { status: 'loading' } : { status: 'ready' })

  useEffect(() => {
    if (!seasonAddressText) { setSeason({ status: 'ready' }); return }
    if (!seasonAddress) { setSeason({ status: 'error', message: 'This Season address is invalid.' }); return }
    if (client.status !== 'ready') { setSeason({ status: 'error', message: 'This Season could not be read yet.' }); return }
    let active = true
    setSeason({ status: 'loading' })
    void connection.getAccountInfo(seasonAddress, 'confirmed').then((info) => {
      if (!active) return
      if (!info) throw new Error('missing')
      const account = decodeSeason({ owner: info.owner, data: info.data }, client.client.programId, seasonAddress)
      setSeason({ status: 'ready', account })
    }).catch(() => {
      if (active) setSeason({ status: 'error', message: 'This Season could not be read. Nothing can be created until it is available.' })
    })
    return () => { active = false }
  }, [client, connection, seasonAddress, seasonAddressText])

  const suggestions = useMemo<readonly RitualSuggestion[]>(
    () => draft.intention.trim().length > 0 ? suggestRituals(draft.intention) : [],
    [draft.intention, suggestionRound],
  )

  const witnessKey = draft.witnessMode === 'one-witness' ? publicKeyFromCanonical(draft.witnessAddress) : null
  const stepThreeErrors = useMemo(() => {
    return [...validateSoloCreateStep(3, draft, selectedAccount?.publicKey)]
  }, [draft, selectedAccount])
  const causeUnavailable = draft.destination === 'cause' && DEMO_CAUSE.tokenAccount === null
  const weekCount = soloEventCount({ seasonWindows: season.account?.schedule.length, picked: pickedEventCount })
  const totalStakeLabel = (() => {
    try { return formatAtomic(parseTokenAmount(draft.stakePerWeek) * BigInt(weekCount), 6) } catch { return '—' }
  })()

  const makeDeps = useCallback(() => {
    if (client.status !== 'ready') throw new Error('Rituals are not ready.')
    if (!selectedAccount) throw new Error('Connect your wallet before starting this ritual.')
    if (seasonAddressText && season.status !== 'ready') throw new Error(season.message ?? 'This Season could not be read.')
    const eventCount = soloEventCount({ seasonWindows: season.account?.schedule.length, picked: pickedEventCount })
    const schedule = selectSoloSchedule({
      cadence: DEMO_SOLO_CADENCE,
      referenceSeconds: Math.floor(Date.now() / 1000),
      eventCount,
      seasonSchedule: season.account?.schedule,
    })
    const stakePerWeekAtomic = parseTokenAmount(draft.stakePerWeek)
    return buildSoloCreateDeps({
      client: client.client,
      creator: selectedAccount.publicKey,
      title: draft.title,
      requirement: draft.requirement,
      eventCount,
      stakePerWeekAtomic,
      schedule,
      witnessMode: draft.witnessMode,
      witnessAddress: draft.witnessAddress,
      destination: draft.destination,
      causeTokenAccount: DEMO_CAUSE.tokenAccount,
      personAddress: draft.personAddress,
      seasonAddress,
      settlerFunding: settlerKey ? { to: settlerKey, lamports: settlerBudgetLamports(eventCount) } : null,
      authorizedActor: () => accountRef.current?.publicKey ?? null,
      getBlockHeight: () => connection.getBlockHeight('confirmed'),
      pendingActionStore: asyncStoragePendingActionStore,
    })
  }, [client, connection, draft, pickedEventCount, season, seasonAddress, seasonAddressText, selectedAccount, settlerKey])

  const create = useCreateRitual(makeDeps)
  const createCopy = withWalletHandoff(create.copy, create.state.status, walletPackage)
  const confirmedAddress = create.state.status === 'confirmed' ? create.state.ritualAddress : null

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!shouldReturnToFirstCreateStep({
        step,
        isBusy: create.isBusy,
        isConfirmed: create.state.status === 'confirmed',
        actionType: event.data.action.type,
      })) return
      event.preventDefault()
      setStep((value) => previousSoloCreateStep(value, CREATE_STEPS))
      setStepErrors([])
    })
    return unsubscribe
  }, [create.isBusy, create.state.status, navigation, step])

  useEffect(() => {
    if (!confirmedAddress || client.status !== 'ready') {
      setConfirmedReadback(false)
      setReadbackError(null)
      return
    }
    let active = true
    setConfirmedReadback(false)
    setReadbackError(null)
    void client.client.readRitual(new PublicKey(confirmedAddress)).then((read) => {
      if (!read.account.kind || read.account.kind !== 'Solo' || read.account.status !== 'Active') throw new Error('unexpected')
      if (!active) return
      setConfirmedReadback(true)
      void rememberRitual({ address: confirmedAddress, title: draft.title, requirement: draft.requirement }).catch(() => undefined)
      void saveProofMode(confirmedAddress, draft.proofMode).catch(() => undefined)
    }).catch(() => {
      if (active) setReadbackError('Your ritual was sent, but it is not ready to show yet. Keep this screen open and try again.')
    })
    return () => { active = false }
  }, [client, confirmedAddress, draft.proofMode, draft.requirement, draft.title])

  const advance = () => {
    const creator = selectedAccount?.publicKey
    const current = step === 1 ? applyTypedIntention(draft) : draft
    if (current !== draft) setDraft(current)
    const errors = [...validateSoloCreateStep(step, current, creator)]
    if (step === 3) errors.push(...stepThreeErrors.filter((error) => !errors.includes(error)))
    setStepErrors(errors)
    if (errors.length > 0) return
    const next = nextSoloCreateStep(step, CREATE_STEPS)
    if (next !== null) setStep(next)
  }

  const chooseSuggestion = (suggestion: RitualSuggestion) => {
    setDraft((current) => ({
      ...current,
      title: suggestion.draft.title,
      requirement: suggestion.draft.requirement,
    }))
    setPickedEventCount(suggestion.draft.eventCount)
    setSelectedSuggestionKey(suggestionKey(suggestion))
    setSuggestionRound((value) => value + 1)
    setStepErrors([])
  }

  // buildSoloCreateDeps invokes client.prepareCreateSoloFundAndActivate for this single approval.
  if (create.state.status === 'confirmed' && confirmedReadback) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Hero kicker="Ritual started">You showed up for yourself.</Hero>
        <View style={styles.confirmedCard}>
          <Stamp kind="promise" note={startedSaying(confirmedAddress ?? '')} />
        </View>
        <ActionButton label="See your ritual" onPress={() => navigation.navigate('SoloRitual', { ritualId: confirmedAddress! })} accessibilityLabel="See your ritual" />
        <Footnote>Devnet · TEST tokens have no real value</Footnote>
      </ScrollView>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.progress} accessibilityLabel={`Make it yours, step ${stepPosition.position} of ${stepPosition.total}`}>
        <Text style={styles.kicker}>MAKE IT YOURS · {stepPosition.position} OF {stepPosition.total}</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(stepPosition.position / stepPosition.total) * 100}%` }]} /></View>
      </View>

      {step === 1 && (
        <>
          <Hero>What’s your ritual?</Hero>
          <Text style={styles.helper}>One clear thing you will do each week.</Text>
          <TextInput
            value={draft.intention}
            onChangeText={(value) => {
              setDraft((current) => ({ ...current, intention: value, title: '', requirement: '' }))
              setPickedEventCount(undefined)
              setSelectedSuggestionKey(null)
              setStepErrors([])
            }}
            placeholder="Run three times a week"
            placeholderTextColor={color.faint}
            autoCapitalize="sentences"
            maxLength={120}
            style={styles.input}
            accessibilityLabel="Describe your ritual"
          />
          {suggestions.length > 0 && (
            <View style={styles.suggestions}>
              <Section title="A starting point" />
              {suggestions.map((suggestion) => {
                const selected = suggestionIsSelected(suggestion, selectedSuggestionKey)
                return (
                <Pressable key={`${suggestionRound}:${suggestionKey(suggestion)}`} onPress={() => chooseSuggestion(suggestion)} style={({ pressed }) => [styles.suggestion, selected && styles.optionSelected, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Use ${suggestion.draft.title}`}>
                  <View style={[styles.band, { backgroundColor: selected ? color.goDeep : color.line }]} />
                  <View style={styles.suggestionBody}>
                    <Text style={styles.suggestionTitle}>{suggestion.draft.title}</Text>
                    <Text style={styles.suggestionRule}>{suggestion.draft.requirement}</Text>
                    <Text style={styles.suggestionMeta}>{suggestion.draft.eventCount} weeks · 5 TEST each week</Text>
                  </View>
                  <Text style={styles.use}>{selected ? '✓ Chosen' : 'Use'}</Text>
                </Pressable>
                )
              })}
            </View>
          )}
          {stepErrors.map((error) => <ErrorLine key={error}>{error}</ErrorLine>)}
          <ActionButton label="Next" onPress={advance} accessibilityLabel={nextSoloCreateStep(1, CREATE_STEPS) === 2 ? 'Continue to who keeps you honest' : 'Continue to your stake'} />
        </>
      )}

      {step === 2 && (
        <>
          <Hero>Who keeps you honest?</Hero>
          <OptionRow selected={draft.witnessMode === 'just-me'} title="Just me" detail="Honor system · you check in inside the window." onPress={() => setDraft((current) => ({ ...current, witnessMode: 'just-me' }))} />
          {SCOPE.witness && <OptionRow selected={draft.witnessMode === 'one-witness'} title="+ One witness" detail="A person confirms. They never stake." onPress={() => setDraft((current) => ({ ...current, witnessMode: 'one-witness' }))} />}
          {SCOPE.witness && draft.witnessMode === 'one-witness' && (
            <View style={styles.indentedField}>
              <TextInput value={draft.witnessAddress} onChangeText={(value) => setDraft((current) => ({ ...current, witnessAddress: value }))} placeholder="Paste their wallet address" placeholderTextColor={color.faint} autoCapitalize="none" style={styles.input} accessibilityLabel="Witness wallet address" />
              {selectedAccount && validateWitnessAddress(draft.witnessAddress, selectedAccount.publicKey) && <ErrorLine>{validateWitnessAddress(draft.witnessAddress, selectedAccount.publicKey)}</ErrorLine>}
            </View>
          )}
          {SCOPE.groupFromCreate && <OptionRow selected={false} title="With friends" detail="2–6 people stake and confirm one another." onPress={() => navigation.navigate('TemplatePicker')} />}
          {SCOPE.proofChooser && <Section title="Proof, if you want it" aside="OPTIONAL" />}
          {SCOPE.proofChooser && <View style={styles.proofRow}>
            <ProofOption selected={draft.proofMode === 'none'} title="None" detail="Your word is enough." onPress={() => setDraft((current) => ({ ...current, proofMode: 'none' }))} />
            <ProofOption selected={draft.proofMode === 'note'} title="Note" detail="Add a line when you check in. Kept on this phone." onPress={() => setDraft((current) => ({ ...current, proofMode: 'note' }))} />
          </View>}
          {stepErrors.map((error) => <ErrorLine key={error}>{error}</ErrorLine>)}
          <ActionButton label="Next" onPress={advance} accessibilityLabel="Continue to missed week terms" />
        </>
      )}

      {step === 3 && (
        <>
          <Hero>If I miss a week</Hero>
          <Text style={styles.helper}>A quiet consequence, chosen before you start.</Text>
          <View style={styles.stakeCard}>
            <Text style={styles.label}>HOW MANY WEEKS</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => setPickedEventCount(stepWeeks(weekCount, -1))} disabled={weekCount <= SOLO_MIN_WEEKS || season.account !== undefined} accessibilityRole="button" accessibilityLabel="One week fewer" style={({ pressed }) => [styles.stepButton, (weekCount <= SOLO_MIN_WEEKS || season.account !== undefined) && styles.stepButtonOff, pressed && styles.pressed]}><Text style={styles.stepButtonText}>−</Text></Pressable>
              <Text style={styles.stepValue} accessibilityLiveRegion="polite">{weekCount} {weekCount === 1 ? 'week' : 'weeks'}</Text>
              <Pressable onPress={() => setPickedEventCount(stepWeeks(weekCount, 1))} disabled={weekCount >= SOLO_MAX_WEEKS || season.account !== undefined} accessibilityRole="button" accessibilityLabel="One more week" style={({ pressed }) => [styles.stepButton, (weekCount >= SOLO_MAX_WEEKS || season.account !== undefined) && styles.stepButtonOff, pressed && styles.pressed]}><Text style={styles.stepButtonText}>+</Text></Pressable>
            </View>
            <View style={styles.divider} />
            <Text style={styles.label}>STAKE EACH WEEK</Text>
            <View style={styles.amountBox}>
              <TextInput value={draft.stakePerWeek} onChangeText={(value) => setDraft((current) => ({ ...current, stakePerWeek: value }))} keyboardType="decimal-pad" selectTextOnFocus style={styles.stakeInput} accessibilityLabel="Stake each week" />
              <Text style={styles.money}>TEST</Text>
            </View>
            <View style={styles.presets}>
              {STAKE_PRESETS.map((amount) => {
                const chosen = draft.stakePerWeek === amount
                return <Pressable key={amount} onPress={() => setDraft((current) => ({ ...current, stakePerWeek: amount }))} accessibilityRole="button" accessibilityState={{ selected: chosen }} accessibilityLabel={`${amount} TEST each week`} style={({ pressed }) => [styles.preset, chosen && styles.presetChosen, pressed && styles.pressed]}><Text style={[styles.presetText, chosen && styles.presetTextChosen]}>{amount}</Text></Pressable>
              })}
            </View>
            <Text style={styles.quiet}>{`${weekCount} ${weekCount === 1 ? 'week' : 'weeks'} · ${totalStakeLabel} in all · Demo speed`}</Text>
            {settlerKey && <Text style={styles.quiet}>{`+ ${formatSol(settlerBudgetLamports(weekCount))} so each week closes on its own`}</Text>}
          </View>
          <Section title="If I miss, it goes to" aside="LOCKED BEFORE YOU START" />
          {destinationChoices(DEMO_CAUSE).filter((choice) => SCOPE.personDestination || choice.kind === 'cause').map((choice) => (
            <OptionRow key={choice.kind} selected={draft.destination === choice.kind} disabled={choice.disabled} title={choice.kind === 'cause' ? DEMO_CAUSE.label : choice.label} detail={choice.disabled ? choice.detail : choice.kind === 'cause' ? 'The selected cause' : choice.detail} onPress={() => { if (!choice.disabled) setDraft((current) => ({ ...current, destination: choice.kind })) }} />
          ))}
          {draft.destination === 'person' && (
            <View style={styles.indentedField}>
              <TextInput value={draft.personAddress} onChangeText={(value) => setDraft((current) => ({ ...current, personAddress: value }))} placeholder="Paste their wallet address" placeholderTextColor={color.faint} autoCapitalize="none" style={styles.input} accessibilityLabel="Person destination wallet address" />
              {selectedAccount && <ErrorLine>{validatePersonError(draft.personAddress, selectedAccount.publicKey, witnessKey)}</ErrorLine>}
            </View>
          )}
          <Text style={styles.skip}>✓ One declared skip · call it before the week opens and that week comes back to you.</Text>
          <View style={styles.promiseCard} accessibilityLabel="Your ritual">
            <Text style={styles.label}>YOUR RITUAL</Text>
            <Text style={styles.promiseText}>I’ll show up for {draft.title || 'this'} every week.</Text>
            <Text style={styles.signature}>You · signing for yourself</Text>
          </View>
          {seasonAddressText && season.status === 'error' && <ErrorLine>{season.message}</ErrorLine>}
          {stepErrors.map((error) => <ErrorLine key={error}>{error}</ErrorLine>)}
          {create.state.status !== 'idle' && create.state.status !== 'confirmed' && (
            <View style={styles.status} accessibilityLabel="Create status">
              <Text style={styles.statusTitle}>{createCopy.title}</Text>
              <Text style={styles.quiet} accessibilityLiveRegion="polite">{createCopy.body}</Text>
            </View>
          )}
          {create.state.status === 'confirmed' && !confirmedReadback && !readbackError && (
            <View style={styles.status} accessibilityLabel="Checking your ritual">
              <Text style={styles.statusTitle}>Checking your ritual…</Text>
              <Text style={styles.quiet}>Your wallet approved. We are checking that your ritual is ready.</Text>
            </View>
          )}
          {create.state.status === 'confirmed' && readbackError && <ErrorLine>{readbackError}</ErrorLine>}
          {needsDevnetSwitchHint(walletPackage) && create.state.status !== 'confirmed' && (
            <View style={styles.devnetCard} accessibilityLabel="Seed Vault Wallet network">
              <Text style={styles.devnetTitle}>Seed Vault Wallet: switch to Devnet</Text>
              <Text style={styles.quiet}>{SEED_VAULT_DEVNET_HINT}</Text>
            </View>
          )}
          {create.state.status === 'idle' && selectedAccount && !stepThreeErrors.length && <Text style={styles.walletNote}>{walletHandoffNote(walletPackage)}</Text>}
          {create.state.status !== 'confirmed' && (
            <ActionButton label={create.isBusy ? 'Working…' : 'Make it real'} onPress={() => { setStepErrors(stepThreeErrors); if (stepThreeErrors.length === 0 && !causeUnavailable) create.start() }} disabled={!selectedAccount || client.status !== 'ready' || season.status !== 'ready' || create.isBusy || !create.canSubmit || stepThreeErrors.length > 0 || causeUnavailable} loading={create.isBusy} accessibilityLabel="Approve and start the ritual" />
          )}
          {create.state.status === 'error' && create.canSubmit && <ActionButton label="Try again" tone="quiet" onPress={create.start} accessibilityLabel="Try starting the ritual again" />}
        </>
      )}
      {!selectedAccount && <Text style={styles.quiet}>Connect your wallet to start this ritual.</Text>}
      <Footnote>Devnet · TEST tokens have no real value</Footnote>
    </ScrollView>
  )
}

function validatePersonError(address: string, creator: PublicKey, witness: PublicKey | null): string {
  const errors = validateSoloCreateStep(3, { ...initialDraft, destination: 'person', personAddress: address, witnessMode: witness ? 'one-witness' : 'just-me', witnessAddress: witness?.toBase58() ?? '' }, creator)
  return errors.find((error) => error !== SOLO_CREATE_MESSAGES.stakeRequired) ?? ''
}

function OptionRow({ selected, disabled, title, detail, onPress }: { selected: boolean; disabled?: boolean; title: string; detail: string; onPress: () => void }) { const styles = useStyles();
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected, disabled }} style={[styles.option, selected && styles.optionSelected, disabled && styles.optionDisabled]}><View style={[styles.radio, selected && styles.radioSelected]} /><View style={styles.optionCopy}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.optionDetail}>{detail}</Text></View></Pressable>
}

function ProofOption({ selected, title, detail, onPress }: { selected: boolean; title: string; detail: string; onPress: () => void }) { const styles = useStyles();
  return <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={[styles.proof, selected && styles.optionSelected]}><View style={[styles.radio, selected && styles.radioSelected]} /><Text style={styles.optionTitle}>{title}</Text><Text style={styles.optionDetail}>{detail}</Text></Pressable>
}

const useStyles = themedStyles((color) => StyleSheet.create({
  screen: { backgroundColor: color.bg },
  content: { padding: space.screen, paddingBottom: 48, gap: space.md },
  progress: { gap: space.xs },
  kicker: { ...type.label, color: color.muted },
  progressTrack: { height: 4, backgroundColor: color.line, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: color.fg },
  helper: { ...type.body, color: color.muted },
  input: { ...type.bodyStrong, color: color.fg, backgroundColor: color.card, borderColor: color.line, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md },
  suggestions: { gap: space.sm },
  suggestion: { flexDirection: 'row', backgroundColor: color.card, borderColor: color.line, borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center' },
  band: { width: 7, alignSelf: 'stretch' },
  suggestionBody: { flex: 1, padding: space.lg, gap: space.xs },
  suggestionTitle: { ...type.section, color: color.fg },
  suggestionRule: { ...type.body, color: color.fg },
  suggestionMeta: { ...type.caption, color: color.muted },
  use: { ...type.bodyStrong, color: color.fg, marginRight: space.lg },
  pressed: { opacity: 0.7 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: color.card, borderColor: color.line, borderWidth: 1, borderRadius: radius.lg, padding: space.lg },
  optionSelected: { borderColor: color.fg, borderWidth: 2 },
  optionDisabled: { opacity: 0.55 },
  radio: { width: 14, height: 14, borderRadius: 7, borderColor: color.line, borderWidth: 1.5 },
  radioSelected: { borderColor: color.fg, backgroundColor: color.fg },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { ...type.bodyStrong, color: color.fg },
  optionDetail: { ...type.caption, color: color.muted },
  indentedField: { gap: space.xs, paddingLeft: 28 },
  proofRow: { flexDirection: 'row', gap: space.sm },
  proof: { flex: 1, minHeight: 84, backgroundColor: color.card, borderColor: color.line, borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  stakeCard: { backgroundColor: color.card, borderRadius: radius.lg, padding: space.lg, borderColor: color.line, borderWidth: 1, gap: space.xs },
  label: { ...type.label, color: color.muted },
  stakeLine: { flexDirection: 'row', alignItems: 'center' },
  stakeInput: { ...type.money, color: color.fg, padding: 0, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
  stepButton: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: color.line, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  stepButtonOff: { opacity: 0.35 },
  stepButtonText: { ...type.title, color: color.fg },
  stepValue: { ...type.money, color: color.fg },
  divider: { height: 1, backgroundColor: color.line, marginVertical: space.md },
  amountBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1.5, borderColor: color.line, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: color.bg, marginTop: space.xs },
  presets: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, marginBottom: space.xs },
  preset: { flex: 1, borderWidth: 1.5, borderColor: color.line, borderRadius: radius.pill, paddingVertical: space.sm, alignItems: 'center' },
  presetChosen: { backgroundColor: color.go, borderColor: color.goDeep },
  presetText: { ...type.bodyStrong, color: color.fg },
  presetTextChosen: { color: color.goInk },
  money: { ...type.money, color: color.fg },
  quiet: { ...type.caption, color: color.muted },
  skip: { ...type.caption, color: color.muted, paddingHorizontal: 2 },
  promiseCard: { backgroundColor: color.paperMuted, borderRadius: radius.lg, padding: space.xl, gap: space.md },
  promiseText: { fontFamily: fonts.hand, color: color.fg, fontSize: 21, lineHeight: 28 },
  signature: { fontFamily: fonts.hand, color: color.fg, fontSize: 18, alignSelf: 'flex-end' },
  status: { backgroundColor: color.card, borderRadius: radius.lg, borderColor: color.line, borderWidth: 1, padding: space.lg, gap: space.xs },
  statusTitle: { ...type.heading, color: color.fg },
  walletNote: { ...type.caption, color: color.muted, textAlign: 'center' },
  confirmedCard: { backgroundColor: color.paperMuted, borderRadius: radius.lg, padding: space.xl },
  devnetCard: { backgroundColor: color.card, borderColor: color.goDeep, borderWidth: 1.5, borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  devnetTitle: { ...type.bodyStrong, color: color.fg },
}))
