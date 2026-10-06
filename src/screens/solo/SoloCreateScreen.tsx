import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import { PublicKey } from '@solana/web3.js'
import { decodeSeason, type SeasonAccountView } from '../../data/rituals/accounts'
import { DEMO_CAUSES } from '../../data/rituals/demoConfig'
import { useRitualClient } from '../../features/rituals/client/useRitualClient'
import { useCreateRitual } from '../../features/rituals/create/useCreateRitual'
import { useAuthorization } from '../../utils/useAuthorization'
import { useDevnetMismatchAlert } from '../../features/rituals/useDevnetMismatchAlert'
import { useDevnetFaucet } from '../../features/rituals/faucet/useDevnetFaucet'
import { faucetLine } from '../../features/rituals/faucet/devnetFaucet'
import { useConnection } from '../../utils/ConnectionProvider'
import { readChainTime } from '../../features/rituals/chainTime'
import { useChainTime } from '../../features/rituals/useChainTime'
import { withWalletHandoff } from '../../features/rituals/walletHandoff'
import { rememberRitual } from '../../features/rituals/authoritativeRituals'
import { useReminders } from '../../features/rituals/reminders/useReminders'
import { asyncStoragePendingActionStore } from '../../features/rituals/recovery/pendingAction'
import { saveProofMode } from '../../features/rituals/solo/notes/soloNotes'
import { parseTokenAmount } from '../../features/rituals/create/decimal'
import { formatAtomic } from '../../features/rituals/displayFormat'
import { suggestRituals, type RitualSuggestion } from '../../features/rituals/create/suggestRituals'
import { ActionButton, ErrorLine, Footnote, Hero, Section, Stamp } from '../../components/crew'
import { radius, space, type, themedStyles, useColors } from '../../theme'
import { buildSoloCreateDeps } from '../../features/rituals/solo/create/buildSoloCreateDeps'
import { splitTotalStake, atomicDecimalText } from '../../features/rituals/solo/create/stakeSplit'
import { DEFAULT_SOLO_SPEED, SOLO_SPEEDS, selectSoloSchedule, soloCadenceFor, soloEventCount, soloScheduleSummary, SOLO_MAX_WEEKS, SOLO_MIN_WEEKS, STAKE_PRESETS, DEFAULT_STAKE_TOTAL, stepWeeks, type SoloSpeed } from '../../features/rituals/solo/create/schedule'
import { shouldReturnToFirstCreateStep } from '../../features/rituals/solo/create/navigationGuard'
import { nextSoloCreateStep, previousSoloCreateStep, soloCreateStepPosition, soloCreateSteps, type SoloCreateStep } from '../../features/rituals/solo/create/steps'
import { SCOPE } from '../../features/rituals/productScope'
import { loadOrCreateSettler } from '../../features/rituals/solo/settler/settlerKey'
import { settlerBudgetLamports } from '../../features/rituals/solo/settler/settlerBudget'
import { DEMO_CLOCK_WARNING } from '../../features/rituals/solo/settler/settlementVisibility'
import { startedSaying } from '../../features/rituals/solo/sayings'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { deriveGroupPool, feeConfigFromProtocol, quoteActivationFee, type FeeConfig } from '../../domain/rituals/money'
import { RITUAL_FEE_CONFIG } from '../../features/rituals/create/draftForm'
import { suggestionIsSelected, suggestionKey } from '../../features/rituals/solo/create/suggestionSelection'
import {
  SOLO_CREATE_MESSAGES,
  applyTypedIntention,
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
  const focused = useIsFocused()
  const chainNow = useChainTime(connection, focused)
  const client = useRitualClient()
  const { selectedAccount, walletPackage } = useAuthorization()
  const accountRef = useRef(selectedAccount)
  accountRef.current = selectedAccount
  const [step, setStep] = useState<SoloCreateStep>(1)
  const stepPosition = soloCreateStepPosition(step, CREATE_STEPS)
  const [draft, setDraft] = useState<SoloCreateDraft>(initialDraft)
  const [pickedEventCount, setPickedEventCount] = useState<string | number | undefined>(undefined)
  // Demo speed by default; Real weeks writes 7-day windows.
  const [speed, setSpeed] = useState<SoloSpeed>(DEFAULT_SOLO_SPEED)
  const [stakeTotal, setStakeTotal] = useState(DEFAULT_STAKE_TOTAL)
  const [causeIndex, setCauseIndex] = useState(0)
  const [remindWeekly, setRemindWeekly] = useState(true)
  const { afterCreate: scheduleReminders } = useReminders()
  const [selectedSuggestionKey, setSelectedSuggestionKey] = useState<string | null>(null)
  const [stepErrors, setStepErrors] = useState<readonly string[]>([])
  const [suggestionRound, setSuggestionRound] = useState(0)
  const [confirmedReadback, setConfirmedReadback] = useState(false)
  // This screen stays mounted under the ritual; client/auth identities change.
  const handledCreateAddresses = useRef(new Set<string>())
  const [readbackError, setReadbackError] = useState<string | null>(null)
  const [readbackAttempt, setReadbackAttempt] = useState(0)
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
  const selectedCause = DEMO_CAUSES[causeIndex] ?? DEMO_CAUSES[0]
  const causeUnavailable = draft.destination === 'cause' && selectedCause.tokenAccount === null
  const weekCount = soloEventCount({ seasonWindows: season.account?.schedule.length, picked: pickedEventCount, speed })
  // One stake for the whole ritual, split across the weeks (Jack, 2026-10-06).
  const stakeSplit = splitTotalStake(stakeTotal, weekCount)
  const stakeDraft = useMemo(() => ({ ...draft, stakePerWeek: stakeSplit.ok ? atomicDecimalText(stakeSplit.split.perWeekAtomic) : '' }), [draft, stakeSplit.ok ? stakeSplit.split.perWeekAtomic : -1n])
  // A wallet destination must already hold a token account for the stake mint:
  // the program locks that account at create, and the one-approval create does
  // not open accounts for other people.
  const [personAccount, setPersonAccount] = useState<'unknown' | 'present' | 'missing'>('unknown')
  useEffect(() => {
    const owner = draft.destination === 'person' ? publicKeyFromCanonical(draft.personAddress) : null
    if (!owner || client.status !== 'ready') { setPersonAccount('unknown'); return }
    let active = true
    void client.client.getProtocolConfig().then(async (config) => {
      const ata = getAssociatedTokenAddressSync(config.account.allowedStakeMint, owner)
      const info = await connection.getAccountInfo(ata, 'confirmed')
      if (active) setPersonAccount(info ? 'present' : 'missing')
    }).catch(() => { if (active) setPersonAccount('unknown') })
    return () => { active = false }
  }, [client, connection, draft.destination, draft.personAddress])
  const stepThreeErrors = useMemo(() => {
    const errors = [...validateSoloCreateStep(3, stakeDraft, selectedAccount?.publicKey)]
    if (!stakeSplit.ok && stakeSplit.reason === 'too-small') errors.unshift(`Too small to split over ${weekCount} ${weekCount === 1 ? 'week' : 'weeks'}.`)
    if (stakeDraft.destination === 'person' && personAccount === 'missing') errors.push("That wallet has no tSKR account yet, so it can't receive a missed week. Pick a cause, or have them tap Get test tokens once.")
    return errors
  }, [stakeDraft, selectedAccount, stakeSplit.ok, weekCount, personAccount])
  const totalStakeLabel = (() => {
    return stakeSplit.ok ? formatAtomic(stakeSplit.split.lockedAtomic, 6) : '—'
  })()
  const stakeEachLabel = (() => {
    return stakeSplit.ok ? formatAtomic(stakeSplit.split.perWeekAtomic, 6) : 'stake'
  })()
  // The windows this create will write, summarised honestly for either speed.
  const scheduleLine = (() => {
    if (chainNow === null) return 'Checking the week clock…'
    const nowSeconds = chainNow
    try {
      const selection = selectSoloSchedule({ cadence: soloCadenceFor(speed), referenceSeconds: nowSeconds, eventCount: weekCount, seasonSchedule: season.account?.schedule })
      return soloScheduleSummary({ weekCount, stakeEachLabel, totalStakeLabel, schedule: selection.schedule, nowSeconds })
    } catch { return `${weekCount} ${weekCount === 1 ? 'week' : 'weeks'} · ${totalStakeLabel}` }
  })()
  // What the approval will take in tSKR: stake for every week, plus whatever
  // activation fee the live ProtocolConfig says (0 once the protocol is free).
  // Checked against the wallet so a short balance never reaches the wallet.
  const [liveFeeConfig, setLiveFeeConfig] = useState<FeeConfig>(RITUAL_FEE_CONFIG)
  const feeAtomic = (() => {
    try {
      const total = stakeSplit.ok ? stakeSplit.split.lockedAtomic : 0n
      return total > 0n ? quoteActivationFee(deriveGroupPool(total, 1), liveFeeConfig) : 0n
    } catch { return 0n }
  })()
  const neededAtomic = (() => {
    try {
      const total = stakeSplit.ok ? stakeSplit.split.lockedAtomic : 0n
      return total > 0n ? total + feeAtomic : null
    } catch { return null }
  })()
  const [testBalance, setTestBalance] = useState<bigint | null>(null)
  const [balanceTick, setBalanceTick] = useState(0)
  // "Get test tokens": the faucet pays; after a send the balance line re-reads a few seconds later.
  const faucet = useDevnetFaucet(selectedAccount?.publicKey.toBase58() ?? null, () => { setTimeout(() => setBalanceTick((value) => value + 1), 4000) })
  useEffect(() => {
    if (client.status !== 'ready' || !selectedAccount) { setTestBalance(null); return }
    let active = true
    void client.client.getProtocolConfig().then(async (config) => {
      if (active) { try { setLiveFeeConfig(feeConfigFromProtocol(config.account, RITUAL_FEE_CONFIG.tokenDecimals)) } catch { /* keep the constant */ } }
      const ata = getAssociatedTokenAddressSync(config.account.allowedStakeMint, selectedAccount.publicKey)
      const balance = await connection.getTokenAccountBalance(ata, 'confirmed').then((read) => BigInt(read.value.amount)).catch((error: unknown) => {
        if (String((error as Error)?.message ?? error).toLowerCase().includes('could not find account')) return 0n
        throw error
      })
      if (active) setTestBalance(balance)
    }).catch(() => { if (active) setTestBalance(null) }) // unknown: never block on a failed read
    return () => { active = false }
  }, [client, connection, selectedAccount, balanceTick])
  const shortOfTest = testBalance !== null && neededAtomic !== null && testBalance < neededAtomic

  const makeDeps = useCallback(() => {
    if (client.status !== 'ready') throw new Error('Rituals are not ready.')
    if (!selectedAccount) throw new Error('Connect your wallet before starting this ritual.')
    if (seasonAddressText && season.status !== 'ready') throw new Error(season.message ?? 'This Season could not be read.')
    const eventCount = soloEventCount({ seasonWindows: season.account?.schedule.length, picked: pickedEventCount, speed })
    const schedule = async () => selectSoloSchedule({
      cadence: soloCadenceFor(speed),
      referenceSeconds: await readChainTime(connection),
      eventCount,
      seasonSchedule: season.account?.schedule,
    })
    const split = splitTotalStake(stakeTotal, eventCount)
    if (!split.ok) throw new Error('Enter a stake.')
    const stakePerWeekAtomic = split.split.perWeekAtomic
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
      causeTokenAccount: selectedCause.tokenAccount,
      personAddress: draft.personAddress,
      seasonAddress,
      settlerFunding: settlerKey ? { to: settlerKey, lamports: settlerBudgetLamports(eventCount) } : null,
      authorizedActor: () => accountRef.current?.publicKey ?? null,
      getBlockHeight: () => connection.getBlockHeight('confirmed'),
      pendingActionStore: asyncStoragePendingActionStore,
      rememberBeforeSend: async (address) => {
        await rememberRitual({ address, title: draft.title, requirement: draft.requirement })
        await saveProofMode(address, draft.proofMode)
      },
    })
  }, [client, connection, draft, pickedEventCount, season, seasonAddress, seasonAddressText, selectedAccount, settlerKey, speed, stakeTotal])

  const create = useCreateRitual(makeDeps)
  const createCopy = withWalletHandoff(create.copy, create.state.status, walletPackage)
  useDevnetMismatchAlert(create.state.status, create.state.status === 'error' ? create.state.category : null, walletPackage)
  const createComplete = create.state.status === 'confirmed' || create.state.status === 'recovered'
  const confirmedAddress = createComplete || (create.state.status === 'error' && !create.state.retryable) ? ('ritualAddress' in create.state ? create.state.ritualAddress : null) : null

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!shouldReturnToFirstCreateStep({
        step,
        isBusy: create.isBusy,
        isConfirmed: createComplete,
        actionType: event.data.action.type,
      })) return
      event.preventDefault()
      setStep((value) => previousSoloCreateStep(value, CREATE_STEPS))
      setStepErrors([])
    })
    return unsubscribe
  }, [create.isBusy, createComplete, navigation, step])

  useEffect(() => {
    if (!confirmedAddress || client.status !== 'ready') {
      setConfirmedReadback(false)
      setReadbackError(null)
      return
    }
    if (handledCreateAddresses.current.has(confirmedAddress)) {
      setConfirmedReadback(true)
      setReadbackError(null)
      return
    }
    let active = true
    setConfirmedReadback(false)
    setReadbackError(null)
    void client.client.readRitual(new PublicKey(confirmedAddress)).then((read) => {
      if (read.account.kind !== 'Solo' || !['Active', 'Completed'].includes(read.account.status) || !read.account.creator.equals(accountRef.current?.publicKey ?? PublicKey.default)) throw new Error('unexpected')
      if (!active) return
      create.observeReadback(confirmedAddress)
      setConfirmedReadback(true)
      // Mark synchronously, before starting any asynchronous one-shot writes.
      if (handledCreateAddresses.current.has(confirmedAddress)) return
      handledCreateAddresses.current.add(confirmedAddress)
      void rememberRitual({ address: confirmedAddress, title: draft.title, requirement: draft.requirement }).catch(() => undefined)
      void saveProofMode(confirmedAddress, draft.proofMode).catch(() => undefined)
      void scheduleReminders({ ritualAddress: confirmedAddress, schedule: read.account.schedule, ritualTitle: draft.title,
        stakeLabel: formatAtomic(read.account.perEventAllocation, read.account.stakeDecimals), causeLabel: draft.destination === 'cause' ? selectedCause.label : 'the person you picked',
        enabled: speed === 'real' && remindWeekly })
    }).catch(() => {
      if (active) setReadbackError('Your ritual was sent, but it is not ready to show yet. Keep this screen open and try again.')
    })
    return () => { active = false }
  }, [client, confirmedAddress, draft.proofMode, draft.requirement, draft.title, draft.destination, speed, remindWeekly, scheduleReminders, readbackAttempt])

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
  if (createComplete && confirmedReadback) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Hero kicker="Ritual started">Locked in.</Hero>
        <View style={styles.confirmedCard}>
          <Stamp kind="promise" note={startedSaying(confirmedAddress ?? '')} />
        </View>
        <ActionButton label="See your ritual" onPress={() => navigation.navigate('SoloRitual', { ritualId: confirmedAddress! })} accessibilityLabel="See your ritual" />
        <Footnote>Devnet · tSKR is a test token with no real value</Footnote>
      </ScrollView>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.progress} accessibilityLabel={`New ritual, step ${stepPosition.position} of ${stepPosition.total}`}>
        <Text style={styles.kicker}>NEW RITUAL · {stepPosition.position} OF {stepPosition.total}</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(stepPosition.position / stepPosition.total) * 100}%` }]} /></View>
      </View>

      {step === 1 && (
        <>
          <Hero>What’s your ritual?</Hero>
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
              <Section title="Suggestions" />
              {suggestions.map((suggestion) => {
                const selected = suggestionIsSelected(suggestion, selectedSuggestionKey)
                return (
                <Pressable key={`${suggestionRound}:${suggestionKey(suggestion)}`} onPress={() => chooseSuggestion(suggestion)} style={({ pressed }) => [styles.suggestion, selected && styles.optionSelected, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Use ${suggestion.draft.title}`}>
                  <View style={[styles.band, { backgroundColor: selected ? color.goDeep : color.line }]} />
                  <View style={styles.suggestionBody}>
                    <Text style={styles.suggestionTitle}>{suggestion.draft.title}</Text>
                    <Text style={styles.suggestionRule}>{suggestion.draft.requirement}</Text>
                    <Text style={styles.suggestionMeta}>{suggestion.draft.eventCount} weeks</Text>
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
          <Hero>Your stake</Hero>
          <View style={styles.stakeCard}>
            <Text style={styles.label}>HOW MANY WEEKS</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => setPickedEventCount(stepWeeks(weekCount, -1))} disabled={weekCount <= SOLO_MIN_WEEKS || season.account !== undefined} accessibilityRole="button" accessibilityLabel="One week fewer" style={({ pressed }) => [styles.stepButton, (weekCount <= SOLO_MIN_WEEKS || season.account !== undefined) && styles.stepButtonOff, pressed && styles.pressed]}><Text style={styles.stepButtonText}>−</Text></Pressable>
              <Text style={styles.stepValue} accessibilityLiveRegion="polite">{weekCount} {weekCount === 1 ? 'week' : 'weeks'}</Text>
              <Pressable onPress={() => setPickedEventCount(stepWeeks(weekCount, 1))} disabled={weekCount >= SOLO_MAX_WEEKS || season.account !== undefined} accessibilityRole="button" accessibilityLabel="One more week" style={({ pressed }) => [styles.stepButton, (weekCount >= SOLO_MAX_WEEKS || season.account !== undefined) && styles.stepButtonOff, pressed && styles.pressed]}><Text style={styles.stepButtonText}>+</Text></Pressable>
            </View>
            {/* Demo speed · Real weeks: the same pills as the stake picks. A joined Season fixes the windows, so it locks this too. */}
            <View style={styles.presets}>
              {SOLO_SPEEDS.map((option) => {
                const chosen = speed === option.speed
                const locked = season.account !== undefined
                return <Pressable key={option.speed} onPress={() => setSpeed(option.speed)} disabled={locked} accessibilityRole="button" accessibilityState={{ selected: chosen, disabled: locked }} accessibilityLabel={option.accessibilityLabel} style={({ pressed }) => [styles.preset, chosen && styles.presetChosen, locked && styles.stepButtonOff, pressed && styles.pressed]}><Text style={[styles.presetText, chosen && styles.presetTextChosen]}>{option.label}</Text></Pressable>
              })}
            </View>
            {speed === 'real' && (
              <View style={styles.presets}>
                <Pressable onPress={() => setRemindWeekly((value) => !value)} disabled={create.isBusy} accessibilityRole="switch" accessibilityState={{ checked: remindWeekly, disabled: create.isBusy }} accessibilityLabel="Remind me each week" style={({ pressed }) => [styles.preset, remindWeekly && styles.presetChosen, pressed && styles.pressed]}>
                  <Text style={[styles.presetText, remindWeekly && styles.presetTextChosen]}>{remindWeekly ? '✓ ' : ''}Remind me each week</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.divider} />
            <Text style={styles.label}>STAKE</Text>
            <View style={styles.amountBox}>
              <TextInput value={stakeTotal} onChangeText={setStakeTotal} keyboardType="decimal-pad" selectTextOnFocus style={styles.stakeInput} accessibilityLabel="Total stake" />
              <Text style={styles.money}>tSKR</Text>
            </View>
            <View style={styles.presets}>
              {STAKE_PRESETS.map((amount) => {
                const chosen = stakeTotal === amount
                return <Pressable key={amount} onPress={() => setStakeTotal(amount)} accessibilityRole="button" accessibilityState={{ selected: chosen }} accessibilityLabel={`${amount} tSKR in total`} style={({ pressed }) => [styles.preset, chosen && styles.presetChosen, pressed && styles.pressed]}><Text style={[styles.presetText, chosen && styles.presetTextChosen]}>{amount}</Text></Pressable>
              })}
            </View>
            <Text style={styles.quiet} accessibilityLiveRegion="polite">{scheduleLine}</Text>
            {stakeSplit.ok && !stakeSplit.split.exact && <Text style={styles.quiet}>{`Splits evenly to ${formatAtomic(stakeSplit.split.lockedAtomic, 6)}.`}</Text>}
            {testBalance !== null && (shortOfTest || testBalance === 0n) && <Text style={styles.quiet}>{`You have ${formatAtomic(testBalance, 6)}`}</Text>}
            {testBalance !== null && (shortOfTest || testBalance === 0n) && faucet.status !== 'done' && <ActionButton tone="quiet" label={faucet.status === 'requesting' ? 'Sending…' : 'Get test tokens'} onPress={faucet.request} disabled={faucet.status === 'requesting'} loading={faucet.status === 'requesting'} accessibilityLabel="Get test tokens from the devnet faucet" />}
            {faucet.status === 'done' && faucet.result && <Text style={styles.quiet} accessibilityLiveRegion="polite">{faucetLine(faucet.result)}</Text>}
            {shortOfTest && neededAtomic !== null && <ErrorLine>{`Not enough tSKR: this needs ${formatAtomic(neededAtomic, 6)}${feeAtomic > 0n ? ' (stake plus the activation fee)' : ''}.`}</ErrorLine>}
          </View>
          {/* Where missed weeks go: the user picks (Jack, 2026-10-06). Three labelled demo causes or a wallet. */}
          <Text style={styles.label}>IF YOU MISS A WEEK, IT GOES TO</Text>
          {DEMO_CAUSES.map((cause, index) => (
            <OptionRow key={cause.label} selected={draft.destination === 'cause' && causeIndex === index} disabled={cause.tokenAccount === null || create.isBusy} title={cause.label} onPress={() => { setCauseIndex(index); setDraft((current) => ({ ...current, destination: 'cause' })) }} />
          ))}
          <OptionRow selected={draft.destination === 'person'} disabled={create.isBusy} title="A wallet you choose" onPress={() => setDraft((current) => ({ ...current, destination: 'person' }))} />
          {draft.destination === 'person' && (
            <View style={styles.indentedField}>
              <TextInput value={draft.personAddress} onChangeText={(value) => setDraft((current) => ({ ...current, personAddress: value.trim() }))} placeholder="Paste a wallet address" placeholderTextColor={color.faint} autoCapitalize="none" autoCorrect={false} style={styles.input} accessibilityLabel="Wallet address for missed weeks" />
              {selectedAccount && draft.personAddress.length > 0 && <ErrorLine>{validatePersonError(draft.personAddress, selectedAccount.publicKey, witnessKey)}</ErrorLine>}
            </View>
          )}
          {seasonAddressText && season.status === 'error' && <ErrorLine>{season.message}</ErrorLine>}
          {client.status !== 'ready' && <ErrorLine>{client.reason}</ErrorLine>}
          {causeUnavailable && <ErrorLine>This cause is unavailable. Try again later.</ErrorLine>}
          {stepErrors.map((error) => <ErrorLine key={error}>{error}</ErrorLine>)}
          {stepThreeErrors.filter((error) => !stepErrors.includes(error)).map((error) => <ErrorLine key={error}>{error}</ErrorLine>)}
          {create.state.status === 'error' && createCopy.tone === 'neutral' && <Text style={styles.quiet} accessibilityLiveRegion="polite">{createCopy.body}</Text>}
          {create.state.status !== 'idle' && !createComplete && createCopy.tone !== 'neutral' && (
            <View style={styles.status} accessibilityLabel="Create status">
              <Text style={styles.statusTitle}>{createCopy.title}</Text>
              <Text style={styles.quiet} accessibilityLiveRegion="polite">{createCopy.body}</Text>
            </View>
          )}
          {createComplete && !confirmedReadback && !readbackError && (
            <View style={styles.status} accessibilityLabel="Checking your ritual">
              <Text style={styles.statusTitle}>Checking your ritual…</Text>
              <Text style={styles.quiet}>Your wallet approved. We are checking that your ritual is ready.</Text>
            </View>
          )}
          {confirmedAddress && readbackError && <ErrorLine>{readbackError}</ErrorLine>}
          {confirmedAddress && readbackError && <ActionButton tone="quiet" label="Check your ritual again" onPress={() => setReadbackAttempt((value) => value + 1)} />}
          {!createComplete && speed === 'demo' && <Text style={styles.quiet}>{DEMO_CLOCK_WARNING}</Text>}
          {!createComplete && (
            <ActionButton label={create.isBusy ? 'Locking in…' : 'Lock it in'} onPress={() => { setStepErrors(stepThreeErrors); if (stepThreeErrors.length === 0 && !causeUnavailable) create.start() }} disabled={!selectedAccount || client.status !== 'ready' || season.status !== 'ready' || create.isBusy || !create.canSubmit || stepThreeErrors.length > 0 || causeUnavailable || shortOfTest} loading={create.isBusy} accessibilityLabel="Lock in this ritual" />
          )}

        </>
      )}
      {!selectedAccount && <Text style={styles.quiet}>Connect your wallet to start this ritual.</Text>}
      <Footnote>Devnet · tSKR is a test token with no real value</Footnote>
    </ScrollView>
  )
}

function validatePersonError(address: string, creator: PublicKey, witness: PublicKey | null): string {
  const errors = validateSoloCreateStep(3, { ...initialDraft, destination: 'person', personAddress: address, witnessMode: witness ? 'one-witness' : 'just-me', witnessAddress: witness?.toBase58() ?? '' }, creator)
  return errors.find((error) => error !== SOLO_CREATE_MESSAGES.stakeRequired) ?? ''
}

function OptionRow({ selected, disabled, title, detail, onPress }: { selected: boolean; disabled?: boolean; title: string; detail?: string; onPress: () => void }) { const styles = useStyles();
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected, disabled }} style={[styles.option, selected && styles.optionSelected, disabled && styles.optionDisabled]}><View style={[styles.radio, selected && styles.radioSelected]} /><View style={styles.optionCopy}><Text style={styles.optionTitle}>{title}</Text>{detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}</View></Pressable>
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
  status: { backgroundColor: color.card, borderRadius: radius.lg, borderColor: color.line, borderWidth: 1, padding: space.lg, gap: space.xs },
  statusTitle: { ...type.heading, color: color.fg },
  confirmedCard: { backgroundColor: color.paperMuted, borderRadius: radius.lg, padding: space.xl },
  devnetCard: { backgroundColor: color.card, borderColor: color.goDeep, borderWidth: 1.5, borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  devnetTitle: { ...type.bodyStrong, color: color.fg },
}))
