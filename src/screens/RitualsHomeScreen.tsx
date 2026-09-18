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
import { palette, radius, space, type } from '../theme'

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
        <Text variant="headlineSmall">No rituals running</Text>
        <Text style={styles.muted}>{view.errorMessage}</Text>
        <Text style={styles.disclosure}>{view.disclosure}</Text>
        <Button mode="contained" onPress={load} accessibilityLabel="Try again">Try again</Button>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Rituals home">
      <View style={styles.hero} accessibilityRole="header">
        <Text style={styles.wordmark}>{view.identity.title}</Text>
        <Text style={styles.tagline}>{view.identity.valueProposition}</Text>
      </View>

      {view.kind === 'empty' ? (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge">Start a ritual</Text>
            <Text style={styles.body}>Pick a ritual, set the stake, invite up to 5 friends. Whoever keeps up splits the pot.</Text>
            <Button mode="contained" onPress={() => navigation.navigate(homeCreateTarget().name)} accessibilityLabel="Create Ritual">Create Ritual</Button>
          </Card.Content>
        </Card>
      ) : (
        <>
          {view.activeRituals.map((ritual) => (
            <Card key={ritual.id} style={styles.card}>
              <Card.Content style={styles.cardBody}>
                <Text style={styles.ritualTitle}>{ritual.title}</Text>
                <Text style={styles.body}>{ritual.requirement}</Text>

                <View style={styles.potBlock}>
                  <Text style={styles.label}>POT ON THE LINE</Text>
                  <Text style={styles.potAmount}>{ritual.stakeAtRisk}</Text>
                  <Text style={styles.potNote}>Miss it and your share goes to whoever showed up.</Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={styles.label}>CREW</Text>
                    <Text style={styles.metaValue}>{ritual.memberProgress}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.label}>VERIFIED BY</Text>
                    <Text style={styles.metaValue}>{ritual.confirmationMode}</Text>
                  </View>
                </View>

                <Divider style={styles.divider} />
                <Text style={styles.next}>NEXT · {ritual.nextEvent}</Text>
                <Button mode="contained" style={styles.cardAction} onPress={() => { const target = ritualDetailTarget(ritual.id); navigation.navigate(target.name, target.params) }} accessibilityLabel={`Open ${ritual.title}`}>Open group</Button>
              </Card.Content>
            </Card>
          ))}
          {view.kind === 'pending-confirmation' && (
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.sectionHeading}><Text variant="titleMedium">Confirmations</Text>{view.confirmations.count > 0 && <Text style={[styles.badge, { backgroundColor: theme.colors.primary, color: theme.colors.onPrimary }]}>{view.confirmations.count}</Text>}</View>
                <Text style={styles.body}>A friend says they showed up. Back them or question it.</Text>
                {view.activeRituals[0]?.id && <Button mode="text" onPress={() => { const target = confirmationInboxTarget(view.activeRituals[0].id, 0); navigation.navigate(target.name, target.params) }} accessibilityLabel="Review confirmations">{view.confirmations.actionLabel}</Button>}
              </Card.Content>
            </Card>
          )}
          {view.kind === 'funding' && (
            <Card style={styles.card}><Card.Content><Text variant="titleMedium">Get your stake in</Text><Text style={styles.body}>Funding · {view.funding.progress}</Text><Button mode="contained-tonal" onPress={() => Alert.alert('Funding', 'Funding is not connected yet. No transaction was submitted.')} accessibilityLabel="Fund ritual">Fund ritual</Button></Card.Content></Card>
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
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.md },

  // Hero: the tagline is the pitch, so it gets real size rather than caption treatment.
  hero: { paddingTop: space.sm, paddingBottom: space.lg, gap: space.sm },
  wordmark: { ...type.display, color: palette.bone },
  tagline: { ...type.body, color: palette.gold500, fontWeight: '600' },

  card: { borderRadius: radius.lg, backgroundColor: palette.ink800, borderWidth: 1, borderColor: palette.ink600 },
  cardBody: { paddingVertical: space.lg },
  ritualTitle: { ...type.title, color: palette.bone },
  body: { ...type.body, color: palette.bone70, marginTop: space.sm },

  // The pot is the emotional core of the product, so it gets its own panel.
  potBlock: {
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: palette.goldDim,
    borderWidth: 1,
    borderColor: palette.gold600,
    gap: space.xs,
  },
  potAmount: { ...type.money, color: palette.gold400 },
  potNote: { ...type.caption, color: palette.gold500, marginTop: space.xs },

  metaRow: { flexDirection: 'row', gap: space.lg, marginTop: space.lg, flexWrap: 'wrap' },
  metaItem: { flexGrow: 1, flexBasis: 120, gap: space.xs },
  metaValue: { ...type.heading, color: palette.bone },

  label: { ...type.label, color: palette.bone50 },
  divider: { marginVertical: space.lg, backgroundColor: palette.ink600 },
  next: { ...type.label, color: palette.green500, marginBottom: space.md },
  cardAction: { borderRadius: radius.pill },

  muted: { ...type.body, color: palette.bone70, marginTop: space.sm },
  disclosure: { ...type.label, color: palette.bone50, textAlign: 'center', marginVertical: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  badge: { ...type.caption, borderRadius: radius.pill, minWidth: 24, paddingHorizontal: 8, paddingVertical: 3, textAlign: 'center', overflow: 'hidden', fontWeight: '800' },
})
