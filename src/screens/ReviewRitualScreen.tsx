import React from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Divider, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { buildReviewViewModel } from '../features/rituals/create/reviewViewModel'
import { reviewCompleteTarget } from '../features/rituals/create/routeHelpers'

type Props = NativeStackScreenProps<RootStackParamList, 'ReviewRitual'>
type ReviewRow = readonly [label: string, value: string]

export function ReviewRitualScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const styles = makeStyles(useTheme())
  const review = buildReviewViewModel(route.params)
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
      <Text variant="headlineMedium">Review locked terms</Text>
      <Card style={styles.card} accessibilityLabel="Locked ritual terms">
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
          <Text style={styles.disclosure}>Terms cannot be changed after review.</Text>
        </Card.Content>
      </Card>
      <Button
        mode="contained"
        onPress={() => navigation.navigate(reviewCompleteTarget().name)}
        accessibilityLabel="Save fixture ritual"
      >
        Save fixture ritual
      </Button>
      <Text style={styles.footer}>Continue in fixture mode · no wallet · no transaction submitted</Text>
    </ScrollView>
  )
}

const makeStyles = (theme: MD3Theme) => StyleSheet.create({
  content: { padding: 20, gap: 14 },
  card: { borderRadius: 18 },
  notice: { borderRadius: 18 },
  body: { marginVertical: 12, lineHeight: 21 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
  },
  label: { color: theme.colors.onSurfaceVariant, flex: 1, minWidth: 100 },
  value: { fontWeight: '700', flex: 1, minWidth: 140, textAlign: 'right' },
  disclosure: { marginTop: 10, lineHeight: 20, color: theme.colors.onSurface },
  footer: { textAlign: 'center', color: theme.colors.onSurfaceVariant, fontSize: 12 },
})
