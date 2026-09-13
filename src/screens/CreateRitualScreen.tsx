import React, { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, SegmentedButtons, Text, TextInput, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { draftFromTemplate, RITUAL_TEMPLATES } from '../features/rituals/create/templates'
import { reviewNavigationParams } from '../features/rituals/create/routeHelpers'
import {
  clearFieldError,
  limitCodePoints,
  validateRitualDraft,
  type RitualDraft,
} from '../features/rituals/create/draftForm'

type Props = NativeStackScreenProps<RootStackParamList, 'CreateRitual'>

export function CreateRitualScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const theme = useTheme()
  const styles = makeStyles(theme)
  const template = RITUAL_TEMPLATES.find(
    (item) => item.category === route.params.templateCategory,
  ) ?? RITUAL_TEMPLATES[0]
  const [draft, setDraft] = useState<RitualDraft>(() => draftFromTemplate(template))
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})

  const set = (key: keyof RitualDraft, value: string) => {
    const max = key === 'title' ? 80 : key === 'requirement' ? 280 : undefined
    const nextValue = max === undefined ? value : limitCodePoints(value, max)
    setErrors((current) => clearFieldError(current, key))
    setDraft((current) => ({ ...current, [key]: nextValue }))
  }

  const field = (key: keyof RitualDraft, label: string, multiline = false) => {
    const max = key === 'title' ? 80 : key === 'requirement' ? 280 : undefined
    const count = max === undefined ? undefined : Array.from(draft[key]).length
    return (
      <View style={styles.field}>
        <TextInput
          label={label}
          value={draft[key]}
          onChangeText={(value) => set(key, value)}
          error={Boolean(errors[key])}
          multiline={multiline}
          accessibilityLabel={label}
          keyboardType={
            multiline
              ? 'default'
              : key === 'memberTotalStake'
                ? 'decimal-pad'
                : 'number-pad'
          }
        />
        {count !== undefined && (
          <Text style={styles.counter}>{count}/{max}</Text>
        )}
        {errors[key] && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {errors[key]}
          </Text>
        )}
      </View>
    )
  }

  const submit = () => {
    const result = validateRitualDraft(draft)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    navigation.navigate('ReviewRitual', reviewNavigationParams(draft))
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text variant="headlineMedium">Create your ritual</Text>
      <Text style={styles.muted}>Start with a template, then edit every term.</Text>
      {field('title', 'Title')}
      {field('requirement', 'What will members do?', true)}
      <View style={styles.stack}>
        {field('memberCount', 'Members (2–6)')}
        {field('eventCount', 'Events (1–16)')}
      </View>
      {field('memberTotalStake', 'Per-member total stake (TEST)')}
      <View accessible accessibilityLabel="Confirmation mode">
        <Text variant="labelLarge">Confirmation mode</Text>
        <SegmentedButtons
          value={draft.confirmationMode}
          onValueChange={(value) => set('confirmationMode', value)}
          buttons={[
            { value: 'HONOR', label: 'Honor' },
            { value: 'ONE_FRIEND', label: 'One friend' },
            { value: 'MAJORITY', label: 'Majority' },
            { value: 'UNANIMOUS', label: 'Unanimous' },
          ]}
        />
        {errors.confirmationMode && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {errors.confirmationMode}
          </Text>
        )}
      </View>
      <View accessible accessibilityLabel="Activation fee payer">
        <Text variant="labelLarge">Activation fee payer</Text>
        <SegmentedButtons
          value={draft.feePayerMode}
          onValueChange={(value) => set('feePayerMode', value)}
          buttons={[
            { value: 'HOST', label: 'Host' },
            { value: 'SPLIT', label: 'Split' },
          ]}
        />
        {draft.feePayerMode === 'SPLIT' && (
          <Text style={styles.muted}>Activation fee split deterministically across members.</Text>
        )}
        {errors.feePayerMode && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {errors.feePayerMode}
          </Text>
        )}
      </View>
      <Button mode="contained" onPress={submit} accessibilityLabel="Review ritual terms">
        Review locked terms
      </Button>
      <Text style={styles.disclosure}>Fixture mode only · TEST on devnet has no real value · no wallet or transaction</Text>
    </ScrollView>
  )
}

const makeStyles = (theme: MD3Theme) => StyleSheet.create({
  content: { padding: 20, gap: 14 },
  field: { minWidth: 0 },
  muted: { color: theme.colors.onSurfaceVariant },
  error: { color: theme.colors.error, fontSize: 12, marginTop: 4 },
  counter: { color: theme.colors.onSurfaceVariant, fontSize: 12, textAlign: 'right', marginTop: 3 },
  stack: { gap: 10 },
  disclosure: { textAlign: 'center', color: theme.colors.onSurfaceVariant, fontSize: 12 },
})
