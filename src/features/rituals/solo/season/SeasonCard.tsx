import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ActionButton } from '../../../../components/crew'
import { color, memberColor, radius, space, type } from '../../../../theme'

export interface SeasonCardProps {
  readonly title: string
  readonly liveCountLine: string
  readonly actionLabel: 'Join' | 'Open' | string
  readonly onPress: () => void
}

export function SeasonCard({ title, liveCountLine, actionLabel, onPress }: SeasonCardProps) {
  return <View style={styles.card} accessibilityLabel={`${title}, ${liveCountLine}`}>
    <Text style={styles.kicker}>SEASON</Text>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.count}>{liveCountLine}</Text>
    <ActionButton label={actionLabel} onPress={onPress} style={styles.action} />
  </View>
}

const styles = StyleSheet.create({
  card: { backgroundColor: memberColor(2), borderRadius: radius.poster, padding: space.xl },
  kicker: { ...type.label, color: color.white, opacity: 0.85 },
  title: { ...type.hero, color: color.white, marginTop: space.sm },
  count: { ...type.bodyStrong, color: color.white, marginTop: space.lg },
  action: { marginTop: space.lg, backgroundColor: color.card, borderColor: color.card },
})
