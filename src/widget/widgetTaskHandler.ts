import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { RitualWidget } from './RitualWidget'
import { widgetModelFromSnapshot } from './widgetModel'
import { readWidgetSnapshot } from './widgetSnapshot'

/** Headless: local storage only. Never import the foreground bundle adapter. */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetInfo.widgetName !== 'RitualWidget' || widgetAction === 'WIDGET_DELETED') return
  const snapshot = await readWidgetSnapshot(AsyncStorage)
  renderWidget(React.createElement(RitualWidget, { width: widgetInfo.width, height: widgetInfo.height, model: widgetModelFromSnapshot(snapshot, Math.floor(Date.now() / 1000)) }))
}
