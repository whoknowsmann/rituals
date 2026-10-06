import React from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { listKnownRituals } from '../features/rituals/authoritativeRituals'
import { widgetOutcomeFromBundle, type WidgetBundle, type WidgetWeekOutcomes } from './widgetBundle'
import { createWidgetPublisher, readWidgetSnapshot } from './widgetSnapshot'
import { widgetModelFromSnapshot, type WidgetKnown, type WidgetOutcome } from './widgetModel'

const publish = createWidgetPublisher(AsyncStorage)
let queue: Promise<unknown> = Promise.resolve()

/** Best effort, foreground only. Never adds chain reads or blocks a confirmed action. */
export function refreshWidget(bundles?: readonly WidgetBundle[], known?: readonly WidgetKnown[], outcomes?: WidgetWeekOutcomes, replaceAll = false): Promise<void> {
  const updates = bundles?.map((entry) => widgetOutcomeFromBundle(entry, Math.floor(Date.now() / 1000), outcomes?.get(entry.address)))
  // Do not replace honest counts with a partial history while Home's batch loads.
  if (replaceAll && bundles?.some((entry, index) => entry.bundle.ritual.account.kind === 'Solo' && ['Active', 'Completed'].includes(entry.bundle.ritual.account.status) && !updates?.[index])) return Promise.resolve()
  return enqueueRefresh(updates?.filter((value): value is WidgetOutcome => value !== null), known, replaceAll)
}

export function publishWidgetOutcome(outcome: WidgetOutcome): Promise<void> {
  return enqueueRefresh([outcome])
}

function enqueueRefresh(updates?: readonly WidgetOutcome[], known?: readonly WidgetKnown[], replaceAll = false): Promise<void> {
  const next = queue.catch(() => undefined).then(async () => {
    if (Platform.OS !== 'android') return
    if (updates) await publish(known ?? await listKnownRituals(), updates, replaceAll)
    const snapshot = await readWidgetSnapshot(AsyncStorage)
    // Lazy imports keep other platforms and an older binary's ordinary screens usable.
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget')
    const { RitualWidget } = require('./RitualWidget') as typeof import('./RitualWidget')
    await requestWidgetUpdate({ widgetName: 'RitualWidget', renderWidget: () => React.createElement(RitualWidget, { model: widgetModelFromSnapshot(snapshot, Math.floor(Date.now() / 1000)) }) })
  }).catch(() => undefined)
  queue = next
  return next
}
