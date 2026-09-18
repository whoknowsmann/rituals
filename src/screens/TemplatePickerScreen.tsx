import React, { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Chip, Divider, Text, TextInput, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { RITUAL_TEMPLATES, templateSelectionTarget } from '../features/rituals/create/templates'
import { suggestRituals } from '../features/rituals/create/suggestRituals'

type Navigation = NativeStackNavigationProp<RootStackParamList, 'TemplatePicker'>

const EXAMPLES = ['run with my brother', 'finally finish this book', 'call my mom'] as const

export function TemplatePickerScreen() {
  const navigation = useNavigation<Navigation>()
  const theme = useTheme()
  const styles = makeStyles(theme)
  const [intent, setIntent] = useState('')
  const [submitted, setSubmitted] = useState('')

  // Suggestions are computed on-device and deterministically, so there is no
  // loading state, no network dependency, and nothing to fail in a demo.
  const suggestions = useMemo(
    () => (submitted.trim().length === 0 ? [] : suggestRituals(submitted)),
    [submitted],
  )

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" accessibilityLabel="Choose a ritual template">
      <Text variant="headlineMedium">What do you want to keep doing?</Text>
      <Text style={styles.muted}>
        Describe it in a few words and we will shape it into a ritual. Every field stays editable.
      </Text>

      <TextInput
        label="Your intention"
        value={intent}
        onChangeText={setIntent}
        onSubmitEditing={() => setSubmitted(intent)}
        returnKeyType="go"
        accessibilityLabel="Describe your ritual"
      />

      <View style={styles.chips}>
        {EXAMPLES.map((example) => (
          <Chip
            key={example}
            compact
            onPress={() => { setIntent(example); setSubmitted(example) }}
            accessibilityLabel={`Try example: ${example}`}
          >
            {example}
          </Chip>
        ))}
      </View>

      <Button
        mode="contained"
        onPress={() => setSubmitted(intent)}
        disabled={intent.trim().length === 0}
        accessibilityLabel="Suggest rituals"
      >
        Suggest rituals
      </Button>

      {suggestions.length > 0 && (
        <>
          <Divider style={styles.divider} />
          <Text variant="titleMedium">Suggested for you</Text>
          <Text style={styles.muted}>{suggestions[0].rationale}</Text>
          {suggestions.map((suggestion) => (
            <Card key={suggestion.draft.title} style={styles.card} accessibilityLabel={`Suggestion: ${suggestion.draft.title}`}>
              <Card.Content>
                <Text variant="titleLarge">{suggestion.draft.title}</Text>
                <Text style={styles.body}>{suggestion.draft.requirement}</Text>
                <Text style={styles.meta}>
                  {suggestion.draft.eventCount} events · {suggestion.draft.memberTotalStake} TEST per member
                </Text>
                <Button
                  mode="contained-tonal"
                  onPress={() => navigation.navigate('ReviewRitual', { ...suggestion.draft })}
                  accessibilityLabel={`Use suggestion ${suggestion.draft.title}`}
                >
                  Use this
                </Button>
              </Card.Content>
            </Card>
          ))}
        </>
      )}

      <Divider style={styles.divider} />
      <Text variant="titleMedium">Or start from a template</Text>
      {RITUAL_TEMPLATES.map((template) => {
        const target = templateSelectionTarget(template.category)
        return (
          <Card key={template.category} style={styles.card}>
            <Card.Content>
              <Text variant="titleLarge">{template.label}</Text>
              <Text style={styles.body}>{template.requirement}</Text>
              <Button
                mode="contained-tonal"
                onPress={() => navigation.navigate(target.name, target.params)}
                accessibilityLabel={`Use ${template.label} template`}
              >
                Use template
              </Button>
            </Card.Content>
          </Card>
        )
      })}
    </ScrollView>
  )
}

const makeStyles = (theme: MD3Theme) => StyleSheet.create({
  content: { padding: 20, gap: 14 },
  card: { borderRadius: 18 },
  body: { marginVertical: 10, lineHeight: 21 },
  muted: { color: theme.colors.onSurfaceVariant, lineHeight: 20 },
  meta: { color: theme.colors.onSurfaceVariant, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  divider: { marginVertical: 6 },
})
