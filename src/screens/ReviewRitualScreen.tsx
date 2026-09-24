import React from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Divider, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { buildReviewViewModel } from '../features/rituals/create/reviewViewModel'
import { homeCreateTarget, reviewCompleteTarget, rosterNavigationParams } from '../features/rituals/create/routeHelpers'

type Props = NativeStackScreenProps<RootStackParamList, 'ReviewRitual'>
type ReviewRow = readonly [label: string, value: string]

export function ReviewRitualScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const styles = makeStyles(useTheme())
  // buildReviewViewModel validates the raw string draft itself. Never pass it a
  // validated draft (numeric counts) — that fails closed as an invalid link.
  const review = buildReviewViewModel(route.params as unknown)

  if (review === null) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.notice} accessibilityLabel="Invalid ritual link">
          <Card.Content>
            <Text variant="headlineSmall">This ritual link is invalid</Text>
            <Text style={styles.body}>The review details could not be verified. Nothing was saved and no transaction was submitted.</Text>
          </Card.Content>
        </Card>
        <Button mode="contained" onPress={() => navigation.navigate(homeCreateTarget().name)}>
          Return to create/templates
        </Button>
        <Button mode="outlined" onPress={() => navigation.navigate(reviewCompleteTarget().name)}>
          Home
        </Button>
      </ScrollView>
    )
  }

  const rows: readonly ReviewRow[] = [
    ['Members', review.members],
    ['Events', review.events],
    ['Per-member total', review.perMemberTotal],
    ['Per-event allocation', review.perEventAllocation],
    ['Group pool', review.groupPool],
    ['Activation fee', review.activationFee],
    ['Mode', review.confirmationMode],
    ['Threshold', review.confirmationThreshold],
    ['Fee payer', review.feePayer],
  ]

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text variant="headlineMedium" accessibilityRole="header">Review ritual terms</Text>
      <Card style={styles.card} accessibilityLabel="Ritual terms preview">
        <Card.Content>
          <Text variant="titleLarge">{review.title}</Text>
          <Text style={styles.body}>{review.requirement}</Text>
          <Divider />
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </Card.Content>
      </Card>
      <Card style={styles.notice} accessibilityLabel="Review disclosures">
        <Card.Content>
          <Text variant="titleMedium">Before anything can activate</Text>
          {review.disclosures.map((text) => (
            <Text key={text} style={styles.disclosure}>• {text}</Text>
          ))}
          <Text style={styles.disclosure}>This is a preview. Go back to edit any term before creating it.</Text>
        </Card.Content>
      </Card>
      <Button
        mode="contained"
        onPress={() => navigation.navigate('RitualRoster', rosterNavigationParams(route.params))}
        accessibilityLabel="Add member wallets"
      >
        Add member wallets
      </Button>
      <Text style={styles.footer}>Preview only · not saved · no transaction will be submitted</Text>
    </ScrollView>
  )
}

const makeStyles = (theme: MD3Theme) => StyleSheet.create({
  content: { padding: 20, gap: 14 },
  card: { borderRadius: 18 },
  notice: { borderRadius: 18 },
  body: { marginVertical: 12, lineHeight: 21 },
  row: { paddingTop: 12, alignItems: 'flex-start' },
  label: { color: theme.colors.onSurfaceVariant },
  value: { fontWeight: '700', marginTop: 3, textAlign: 'left' },
  disclosure: { marginTop: 10, lineHeight: 20, color: theme.colors.onSurface },
  footer: { textAlign: 'center', color: theme.colors.onSurfaceVariant, fontSize: 12 },
})
