import React, { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { DEFAULT_RITUAL_DRAFT, validateRitualDraft, type RitualDraft } from '../features/rituals/create/draftForm'
import { RITUAL_TEMPLATES } from '../features/rituals/create/templates'

type Props = NativeStackScreenProps<RootStackParamList, 'CreateRitual'>
export function CreateRitualScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const template = RITUAL_TEMPLATES.find((item) => item.category === route.params.templateCategory) ?? RITUAL_TEMPLATES[0]
  const [draft, setDraft] = useState<RitualDraft>({ ...DEFAULT_RITUAL_DRAFT, title: template.title, requirement: template.requirement })
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const set = (key: keyof RitualDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }))
  const field = (key: keyof RitualDraft, label: string, multiline = false) => <View><TextInput label={label} value={draft[key]} onChangeText={(value) => set(key, value)} error={Boolean(errors[key])} multiline={multiline} maxLength={key === 'title' ? 80 : key === 'requirement' ? 280 : undefined} />{errors[key] && <Text style={styles.error}>{errors[key]}</Text>}</View>
  const submit = () => { const result = validateRitualDraft(draft); if (!result.ok) { setErrors(result.errors); return }; navigation.navigate('ReviewRitual', draft) }
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text variant="headlineMedium">Create your ritual</Text><Text style={styles.muted}>Start with a template, then edit every term.</Text>
    {field('title', 'Title')}{field('requirement', 'What will members do?', true)}
    <View style={styles.row}><View style={styles.half}>{field('memberCount', 'Members (2–6)')}</View><View style={styles.half}>{field('eventCount', 'Events (1–16)')}</View></View>
    {field('memberTotalStake', 'Per-member total stake (TEST)')}
    <Text variant="labelLarge">Confirmation mode</Text><SegmentedButtons value={draft.confirmationMode} onValueChange={(value) => set('confirmationMode', value)} buttons={[{ value: 'ONE_FRIEND', label: 'One friend' }, { value: 'MAJORITY', label: 'Majority' }, { value: 'UNANIMOUS', label: 'Unanimous' }]} />
    <Text variant="labelLarge">Activation fee payer</Text><SegmentedButtons value={draft.feePayerMode} onValueChange={(value) => set('feePayerMode', value)} buttons={[{ value: 'HOST', label: 'Host' }, { value: 'SPLIT', label: 'Split' }]} />
    <Button mode="contained" onPress={submit} accessibilityLabel="Review ritual terms">Review locked terms</Button>
    <Text style={styles.disclosure}>Fixture mode only · no wallet or transaction</Text>
  </ScrollView>
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 14 }, muted: { color: '#687078' }, error: { color: '#ba1a1a', fontSize: 12, marginTop: 4 }, row: { flexDirection: 'row', gap: 10 }, half: { flex: 1 }, disclosure: { textAlign: 'center', color: '#687078', fontSize: 12 } })
