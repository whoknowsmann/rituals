import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import { color } from '../theme/tokens'
import type { WidgetModel } from './widgetModel'

/** One 2x2 poster. A single tap target opens the app; it never signs or settles. */
export function RitualWidget({ model }: { model: WidgetModel }) {
  const ink = color.card
  return <FlexWidget clickAction="OPEN_APP" style={{ width: 'match_parent', height: 'match_parent', backgroundColor: model.tint as `#${string}`, borderRadius: 20, padding: 12, justifyContent: 'space-between' }}>
    <TextWidget text={model.title} maxLines={2} truncate="END" style={{ fontFamily: 'Fraunces_900Black', fontWeight: '900', fontSize: 22, color: ink }} />
    <FlexWidget style={{ flexGap: 3 }}>
      {model.weekLine ? <TextWidget text={model.weekLine} maxLines={1} style={{ fontSize: 12, color: ink }} /> : null}
      {model.countLine ? <TextWidget text={model.countLine} maxLines={1} style={{ fontSize: 12, color: ink }} /> : null}
      {model.statusLine ? <TextWidget text={model.statusLine} maxLines={2} style={{ fontSize: 12, fontWeight: 'bold', color: ink }} /> : null}
    </FlexWidget>
  </FlexWidget>
}
