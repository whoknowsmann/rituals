import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Card, Divider, Text, useTheme, type MD3Theme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { FixtureRitualsRepository } from '../data/rituals/FixtureRitualsRepository'
import type { RitualsRepository } from '../data/rituals/RitualsRepository'
import { buildHomeViewModel, safeErrorMessage, type HomeViewModel } from '../features/rituals/home/homeViewModel'
import { homeCreateTarget } from '../features/rituals/create/routeHelpers'
import { ritualDetailTarget, confirmationInboxTarget, settlementReceiptTarget } from '../features/rituals/claims/routeHelpers'

const repository = new FixtureRitualsRepository()

export function RitualsHomeScreen({ ritualsRepository = repository }: { readonly ritualsRepository?: RitualsRepository }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [view, setView] = useState<HomeViewModel>(() => buildHomeViewModel({ state: 'loading' }))
  const mounted = useRef(false)
  const requestGeneration = useRef(0)

  const load = useCallback(() => {
    const generation = ++requestGeneration.current
    setView(buildHomeViewModel({ state: 'loading' }))

    void ritualsRepository.getHomeSnapshot()
      .then((snapshot) => {
        if (mounted.current && generation === requestGeneration.current) setView(buildHomeViewModel(snapshot))
      })
      .catch((error: unknown) => {
        if (mounted.current && generation === requestGeneration.current) {
          setView(buildHomeViewModel({
            state: 'error',
            mode: 'fixture',
            source: 'devnet',
            disclosure: 'NO REAL VALUE',
            errorMessage: safeErrorMessage(error),
          }))
        }
      })
  }, [ritualsRepository])

  useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
      requestGeneration.current += 1
    }
  }, [load])

  if (view.kind === 'loading') {
    return (
      <View style={styles.center} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
        <ActivityIndicator accessibilityLabel="Loading rituals" />
        <Text style={styles.muted}>Loading your rituals…</Text>
        <Text style={styles.disclosure}>{view.disclosure}</Text>
      </View>
    )
  }

  if (view.kind === 'error') {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <Text variant="headlineSmall">Rituals are taking a breather</Text>
        <Text style={styles.muted}>{view.errorMessage}</Text>
        <Text style={styles.disclosure}>{view.disclosure}</Text>
        <Button mode="contained" onPress={load} accessibilityLabel="Try again">Try again</Button>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Rituals home">
      <View style={styles.hero} accessibilityRole="header">
        <Text variant="headlineMedium" style={styles.title}>{view.identity.title}</Text>
        <Text variant="bodyLarge" style={styles.subtitle}>{view.identity.valueProposition}</Text>
      </View>

      {view.kind === 'empty' ? (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge">Start your first ritual</Text>
            <Text style={styles.body}>Invite a few friends and make showing up easier together.</Text>
            <Button mode="contained" onPress={() => navigation.navigate(homeCreateTarget().name)} accessibilityLabel="Create Ritual">Create Ritual</Button>
          </Card.Content>
        </Card>
      ) : (
        <>
          {view.activeRituals.map((ritual) => (
            <Card key={ritual.id} style={styles.card}>
              <Card.Content>
                <Text variant="titleLarge">{ritual.title}</Text>
                <Text style={styles.body}>{ritual.requirement}</Text>
                <View style={styles.row}><Text style={styles.label}>MEMBERS</Text><Text>{ritual.memberProgress}</Text></View>
                <View style={styles.row}><Text style={styles.label}>STAKE AT RISK</Text><Text>{ritual.stakeAtRisk}</Text></View>
                <Divider style={styles.divider} />
                <Text style={styles.next}>Next up · {ritual.nextEvent}</Text>
                <Text style={styles.muted}>{ritual.confirmationMode}</Text>
                <Button mode="outlined" onPress={() => { const target = ritualDetailTarget(ritual.id); navigation.navigate(target.name, target.params) }} accessibilityLabel={`Open ${ritual.title}`}>Open group</Button>
              </Card.Content>
            </Card>
          ))}
          {view.kind === 'pending-confirmation' && (
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.sectionHeading}><Text variant="titleMedium">Confirmations</Text>{view.confirmations.count > 0 && <Text style={[styles.badge, { backgroundColor: theme.colors.primary, color: theme.colors.onPrimary }]}>{view.confirmations.count}</Text>}</View>
                <Text style={styles.body}>A friend is waiting for your confirmation.</Text>
                {view.activeRituals[0]?.id && <Button mode="text" onPress={() => { const target = confirmationInboxTarget(view.activeRituals[0].id, 0); navigation.navigate(target.name, target.params) }} accessibilityLabel="Review confirmations">{view.confirmations.actionLabel}</Button>}
              </Card.Content>
            </Card>
          )}
          {view.kind === 'funding' && (
            <Card style={styles.card}><Card.Content><Text variant="titleMedium">Keep the group moving</Text><Text style={styles.body}>Funding · {view.funding.progress}</Text><Button mode="contained-tonal" onPress={() => Alert.alert('Funding', 'Funding is not connected yet. No transaction was submitted.')} accessibilityLabel="Fund ritual">Fund ritual</Button></Card.Content></Card>
          )}
          {view.completedReceipt && (
            <Card style={styles.card}><Card.Content><Text variant="titleMedium">Completed</Text><Text style={styles.body}>{view.completedReceipt.title}</Text><Text variant="titleLarge">{view.completedReceipt.amount}</Text><Text style={styles.muted}>Fixture settlement receipt · no state change</Text><Button mode="outlined" onPress={() => { const target = settlementReceiptTarget(view.completedReceipt!.ritualId, view.completedReceipt!.eventIndex); navigation.navigate(target.name, target.params) }} accessibilityLabel="Open completed receipt">Open receipt</Button></Card.Content></Card>
          )}
        </>
      )}
      {view.kind !== 'empty' && <Button mode="contained-tonal" onPress={() => navigation.navigate(homeCreateTarget().name)} accessibilityLabel="Create a new Ritual">Create a new Ritual</Button>}
      <Text style={styles.disclosure}>{view.disclosure}</Text>
    </ScrollView>
  )
}

const makeStyles = (theme: MD3Theme) => StyleSheet.create({
  content: { padding: 20, gap: 14 },
  hero: { paddingVertical: 8, gap: 4 },
  title: { fontWeight: '700' },
  subtitle: { color: theme.colors.onSurfaceVariant },
  card: { borderRadius: 18 },
  body: { marginTop: 8, marginBottom: 14, lineHeight: 21 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  label: { color: theme.colors.onSurfaceVariant, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  divider: { marginVertical: 14 },
  next: { fontWeight: '700', marginBottom: 4 },
  muted: { color: theme.colors.onSurfaceVariant, marginTop: 8 },
  disclosure: { color: theme.colors.onSurfaceVariant, fontSize: 11, letterSpacing: 0.8, textAlign: 'center', marginVertical: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 12, minWidth: 24, paddingHorizontal: 7, paddingVertical: 2, textAlign: 'center', overflow: 'hidden' },
})
