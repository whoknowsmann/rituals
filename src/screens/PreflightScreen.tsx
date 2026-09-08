import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Chip, Divider, Text } from 'react-native-paper'
import { analyze } from '../domain/preflight/analyze'
import { PREFLIGHT_FIXTURES } from '../domain/preflight/fixtures'
import { buildResultViewModel, type ResultTone } from '../components/preflight/resultViewModel'

const toneColors: Record<ResultTone, { border: string; accent: string; surface: string }> = {
  clear: { border: '#35d07f', accent: '#35d07f', surface: '#0c241a' },
  hold: { border: '#f2b84b', accent: '#f2b84b', surface: '#2a200d' },
  abort: { border: '#ff5d68', accent: '#ff5d68', surface: '#2b1115' },
}

function DetailList({ title, values }: { title: string; values: readonly string[] }) {
  return (
    <View style={styles.detailSection}>
      <Text variant="labelLarge" style={styles.detailHeading}>
        {title}
      </Text>
      {values.length === 0 ? (
        <Text style={styles.muted}>None observed</Text>
      ) : (
        values.map((value, index) => (
          <Text key={`${title}-${index}-${value}`} style={styles.detailItem}>
            • {value}
          </Text>
        ))
      )}
    </View>
  )
}

export function PreflightScreen() {
  const [selectedFixtureId, setSelectedFixtureId] = useState(PREFLIGHT_FIXTURES[0].id)
  const selectedFixture =
    PREFLIGHT_FIXTURES.find((fixture) => fixture.id === selectedFixtureId) ?? PREFLIGHT_FIXTURES[0]
  const result = useMemo(
    () => buildResultViewModel(analyze(selectedFixture.evidence)),
    [selectedFixture],
  )
  const colors = toneColors[result.tone]

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text variant="headlineLarge" style={styles.brand}>
        PREFLIGHT
      </Text>
      <Text variant="titleMedium" style={styles.tagline}>
        Inspect the transaction before wallet approval.
      </Text>
      <Text style={styles.boundary}>
        Demo fixtures only. Preflight does not intercept requests from other apps.
      </Text>

      <Text variant="labelLarge" style={styles.sectionLabel}>
        SELECT SAFE DEMO SCENARIO
      </Text>
      <View style={styles.fixtureButtons}>
        {PREFLIGHT_FIXTURES.map((fixture) => (
          <Button
            key={fixture.id}
            mode={selectedFixtureId === fixture.id ? 'contained' : 'outlined'}
            onPress={() => setSelectedFixtureId(fixture.id)}
            compact
            style={styles.fixtureButton}
          >
            {fixture.id === 'clear-transfer'
              ? 'Expected transfer'
              : fixture.id === 'unknown-program'
                ? 'Unknown program'
                : 'Authority loss'}
          </Button>
        ))}
      </View>

      <Card style={[styles.resultCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Card.Content>
          <View style={styles.badgeRow}>
            <Chip textStyle={{ color: colors.accent }} style={styles.fixtureChip}>
              SAFE FIXTURE
            </Chip>
            <Text style={[styles.completeness, { color: colors.accent }]}>
              {result.completeness}
            </Text>
          </View>

          <Text variant="headlineMedium" style={[styles.verdict, { color: colors.accent }]}>
            {result.title}
          </Text>
          <Text variant="bodyLarge" style={styles.summary}>
            {result.summary}
          </Text>
          <Text variant="labelMedium" style={styles.confidence}>
            {result.confidence} · SIMULATION {result.simulation}
          </Text>

          <Divider style={styles.divider} />

          <DetailList title="OBSERVED ASSET CHANGES" values={result.assetChanges} />
          <DetailList title="AUTHORITY CHANGES" values={result.authorityChanges} />
          <DetailList title="PROGRAMS" values={result.programs} />
          <DetailList title="WARNINGS" values={result.warnings} />
          <DetailList title="UNSUPPORTED OR UNRESOLVED" values={result.unsupported} />

          <View style={[styles.actionBox, { borderColor: colors.border }]}>
            <Text variant="labelLarge" style={{ color: colors.accent }}>
              RECOMMENDED ACTION
            </Text>
            <Text variant="bodyLarge" style={styles.actionText}>
              {result.action}
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Text style={styles.disclaimer}>{result.disclaimer}</Text>
      <Text style={styles.fixtureLabel}>{selectedFixture.label}</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#070b10',
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  brand: {
    color: '#eef7ff',
    fontWeight: '900',
    letterSpacing: 4,
  },
  tagline: {
    color: '#b8c7d8',
    marginTop: 4,
  },
  boundary: {
    color: '#7f90a3',
    marginTop: 8,
    lineHeight: 20,
  },
  sectionLabel: {
    color: '#8fa4ba',
    letterSpacing: 1.2,
    marginTop: 24,
    marginBottom: 10,
  },
  fixtureButtons: {
    gap: 8,
  },
  fixtureButton: {
    borderRadius: 8,
  },
  resultCard: {
    borderWidth: 1,
    borderRadius: 16,
    marginTop: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  fixtureChip: {
    backgroundColor: '#121a23',
  },
  completeness: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  verdict: {
    fontWeight: '900',
    letterSpacing: 1.2,
    marginTop: 18,
  },
  summary: {
    color: '#eef7ff',
    lineHeight: 25,
    marginTop: 8,
  },
  confidence: {
    color: '#91a2b5',
    marginTop: 12,
  },
  divider: {
    backgroundColor: '#344151',
    marginVertical: 18,
  },
  detailSection: {
    marginBottom: 16,
  },
  detailHeading: {
    color: '#91a2b5',
    letterSpacing: 0.7,
    marginBottom: 5,
  },
  detailItem: {
    color: '#e5eef7',
    lineHeight: 22,
  },
  muted: {
    color: '#75869a',
    fontStyle: 'italic',
  },
  actionBox: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  actionText: {
    color: '#f4f8fc',
    marginTop: 4,
  },
  disclaimer: {
    color: '#8191a3',
    lineHeight: 20,
    marginTop: 14,
    textAlign: 'center',
  },
  fixtureLabel: {
    color: '#5f7083',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
})
