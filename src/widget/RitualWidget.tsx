import React from 'react'
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import { color, fonts, radius } from '../theme/tokens'
import type { WidgetModel } from './widgetModel'
import { stampFaceSvg } from './stampFace'

const padding = 14

/** Explicit dp budgets, rather than a tall empty weighted header. */
export function widgetLayout(width: number, height: number, empty = false) {
  const innerWidth = Math.max(1, width - padding * 2)
  const innerHeight = Math.max(1, height - padding * 2)
  const horizontal = width >= 240 && width >= height * 1.5
  const faceSize = Math.floor(horizontal ? Math.min(innerHeight, innerWidth * 0.43) : Math.min(innerWidth, innerHeight * (empty ? 0.72 : 0.55)))
  const numberHeight = horizontal ? Math.min(64, innerHeight * 0.43) : Math.floor(innerHeight * 0.23)
  const lineHeight = horizontal ? Math.min(40, innerHeight * 0.3) : innerHeight - faceSize - (empty ? 0 : numberHeight)
  return { horizontal, faceSize, numberHeight, lineHeight, innerWidth, innerHeight }
}

/** Stamp is the status. Tap only opens Rituals; no direct signing or transaction. */
export function RitualWidget({ model, width = 160, height = 160 }: { model: WidgetModel; width?: number; height?: number }) {
  const empty = model.state === 'empty'
  const layout = widgetLayout(width, height, empty)
  const textColor = empty ? color.fg : color.card
  const number = <FlexWidget style={{ height: layout.numberHeight, flexDirection: 'row', alignItems: 'center', justifyContent: layout.horizontal ? 'flex-start' : 'center', flexGap: 5 }}>
    <TextWidget text={String(model.streak)} maxLines={1} style={{ height: 'match_parent', fontFamily: fonts.display, fontWeight: '900', fontSize: Math.floor(layout.numberHeight * 0.94), adjustsFontSizeToFit: true, color: model.state === 'stamped' ? '#C8F560' : textColor }} />
    <TextWidget text="week streak" maxLines={1} style={{ fontFamily: fonts.bodyStrong, fontWeight: '600', fontSize: layout.numberHeight < 24 ? 8 : 10, color: textColor }} />
  </FlexWidget>
  const line = <TextWidget text={model.line} maxLines={2} style={{ width: 'match_parent', height: layout.lineHeight, fontFamily: fonts.bodyStrong, fontWeight: '600', fontSize: layout.horizontal ? 15 : width < 140 ? 10 : 12, adjustsFontSizeToFit: true, textAlign: layout.horizontal ? 'left' : 'center', color: textColor }} />
  return <FlexWidget clickAction="OPEN_APP" style={{ width: 'match_parent', height: 'match_parent', flexDirection: layout.horizontal ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: model.tint as `#${string}`, borderRadius: radius.lg, padding, overflow: 'hidden' }}>
    <SvgWidget svg={stampFaceSvg(model.face, model.ink, model.seal)} style={{ width: layout.faceSize, height: layout.faceSize }} />
    {layout.horizontal ? <FlexWidget style={{ width: 0, flex: 1, marginLeft: 12, height: 'match_parent', justifyContent: 'center' }}>
      {!empty ? number : null}
      {line}
      {model.title ? <TextWidget text={model.title} maxLines={1} truncate="END" style={{ width: 'match_parent', fontFamily: fonts.body, fontWeight: '400', fontSize: 11, color: textColor, marginTop: 4 }} /> : null}
    </FlexWidget> : <FlexWidget style={{ width: 'match_parent', alignItems: 'center' }}>
      {!empty ? number : null}
      {line}
    </FlexWidget>}
  </FlexWidget>
}
