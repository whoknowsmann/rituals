import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { ActionButton, Chip, DropIn, Hero, Section, haptic } from '../components/crew'
import { RITUAL_TEMPLATES, templateSelectionTarget } from '../features/rituals/create/templates'
import { suggestRituals } from '../features/rituals/create/suggestRituals'
import { color, memberColor, radius, space, type } from '../theme'

type Navigation = NativeStackNavigationProp<RootStackParamList, 'TemplatePicker'>

/** Starting points, written the way a person would say them. */
const EXAMPLES = ['Call my mom', 'Run with my brother', 'Finish this book'] as const

/** Suggestions update while typing once there is enough to go on. */
const LIVE_MIN_CHARS = 3
const LIVE_DEBOUNCE_MS = 220

export function TemplatePickerScreen() {
  const navigation = useNavigation<Navigation>()
  const scroll = useRef<ScrollView>(null)
  const resultsY = useRef(0)
  const [intent, setIntent] = useState('')
  const [submitted, setSubmitted] = useState('')
  // Bumped on every explicit Suggest so re-tapping the same text still visibly
  // does something (the cards drop in again) instead of looking dead.
  const [round, setRound] = useState(0)

  useEffect(() => {
    const text = intent.trim()
    if (text.length < LIVE_MIN_CHARS) return
    const timer = setTimeout(() => setSubmitted(text), LIVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [intent])

  // Suggestions are computed on-device and deterministically, so there is no
  // loading state, no network dependency, and nothing to fail in a demo.
  const suggestions = useMemo(
    () => (submitted.trim().length === 0 ? [] : suggestRituals(submitted)),
    [submitted],
  )

  const reveal = () => {
    // Wait a frame so freshly rendered cards have a layout position.
    requestAnimationFrame(() => scroll.current?.scrollTo({ y: Math.max(0, resultsY.current - space.lg), animated: true }))
  }

  const suggest = (text: string) => {
    const clean = text.trim()
    if (clean.length === 0) return
    Keyboard.dismiss()
    setIntent(clean)
    setSubmitted(clean)
    setRound((r) => r + 1)
    haptic.light()
    reveal()
  }

  return (
    <ScrollView
      ref={scroll}
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Choose a ritual template"
    >
      <Hero>What do you keep meaning to do?</Hero>

      <View style={styles.field}>
        <TextInput
          value={intent}
          onChangeText={setIntent}
          onSubmitEditing={() => suggest(intent)}
          placeholder="Call my mom on Sundays"
          placeholderTextColor={color.faint}
          returnKeyType="go"
          autoCapitalize="sentences"
          maxLength={120}
          style={styles.input}
          accessibilityLabel="Describe your ritual"
        />
        <ActionButton
          label="Suggest"
          tone="dark"
          onPress={() => suggest(intent)}
          disabled={intent.trim().length === 0}
          accessibilityLabel="Suggest rituals"
          style={styles.suggest}
        />
      </View>

      <View style={styles.chips}>
        {EXAMPLES.map((example) => (
          <Chip key={example} onPress={() => suggest(example)} accessibilityLabel={`Try example: ${example}`}>
            {example}
          </Chip>
        ))}
      </View>

      {suggestions.length > 0 && (
        <View onLayout={(e) => { resultsY.current = e.nativeEvent.layout.y }}>
          <Section title="Two ways to do it" />
          {suggestions.map((suggestion, i) => (
            <DropIn key={`${round}:${submitted}:${suggestion.shape}`}>
              <View style={styles.card} accessibilityLabel={`Suggestion: ${suggestion.draft.title}, ${suggestion.shape}`}>
                <View style={[styles.cardBand, { backgroundColor: memberColor(i) }]} />
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{suggestion.draft.title}</Text>
                  <Text style={styles.cardShape}>{suggestion.shape}</Text>
                  <Text style={styles.cardRule}>{suggestion.draft.requirement}</Text>
                  <View style={styles.cardFoot}>
                    <Text style={styles.cardStake}>{suggestion.draft.memberTotalStake} tSKR each</Text>
                    <ActionButton
                      label="Use this"
                      tone={i === 0 ? 'go' : 'quiet'}
                      onPress={() => navigation.navigate('ReviewRitual', { ...suggestion.draft })}
                      accessibilityLabel={`Use suggestion ${suggestion.draft.title}, ${suggestion.shape}`}
                      style={styles.use}
                    />
                  </View>
                </View>
              </View>
            </DropIn>
          ))}
          <Text style={styles.note}>{suggestions[0].rationale}</Text>
        </View>
      )}

      <Section title="Or start from scratch" />
      <View style={styles.templates}>
        {RITUAL_TEMPLATES.map((template, i) => {
          const target = templateSelectionTarget(template.category)
          return (
            <Pressable
              key={template.category}
              onPress={() => { haptic.light(); navigation.navigate(target.name, target.params) }}
              accessibilityRole="button"
              accessibilityLabel={`Use ${template.label} template`}
              style={({ pressed }) => [styles.template, pressed && styles.pressed]}
            >
              <View style={[styles.dot, { backgroundColor: memberColor(i) }]} />
              <Text style={styles.templateText}>{template.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: color.bg },
  content: { padding: space.screen, paddingBottom: 48 },

  field: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: 6, paddingLeft: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { ...type.bodyStrong, fontSize: 17, flex: 1, color: color.fg, paddingVertical: space.md },
  suggest: { paddingVertical: 13, paddingHorizontal: space.lg, borderRadius: radius.md },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },

  card: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, marginBottom: space.md, overflow: 'hidden', flexDirection: 'row' },
  cardBand: { width: 8 },
  cardBody: { flex: 1, padding: space.lg },
  cardTitle: { ...type.title, color: color.fg },
  cardShape: { ...type.label, color: color.muted, marginTop: space.sm },
  cardRule: { ...type.body, color: color.fg, marginTop: space.md },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg, gap: space.md },
  cardStake: { ...type.moneySm, color: color.fg },
  use: { paddingVertical: 12, paddingHorizontal: space.xl },
  note: { ...type.caption, color: color.muted, marginTop: space.xs, paddingHorizontal: 2 },

  templates: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  template: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 14 },
  pressed: { transform: [{ scale: 0.96 }] },
  dot: { width: 10, height: 10, borderRadius: 5 },
  templateText: { ...type.bodyStrong, color: color.fg },
})
