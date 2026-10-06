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
  // A Home batch's absent entry means unread history, not permission to infer
  // dots from the current bundle. Detail reads may use their enriched history.
  const updates = bundles?.map((entry) => widgetOutcomeFromBundle(entry, Math.floor(Date.now() / 1000), outcomes?.get(entry.address) ?? (replaceAll ? new Map() : undefined)))
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
    await requestWidgetUpdate({ widgetName: 'RitualWidget', renderWidget: ({ width, height }) => React.createElement(RitualWidget, { width, height, model: widgetModelFromSnapshot(snapshot, Math.floor(Date.now() / 1000)) }) })
  }).catch(() => undefined)
  queue = next
  return next
}
