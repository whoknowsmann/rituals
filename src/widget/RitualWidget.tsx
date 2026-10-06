import React from 'react'
import { FlexWidget, TextWidget, type FlexWidgetStyle } from 'react-native-android-widget'
import { color, fonts, radius } from '../theme/tokens'
import type { WidgetModel } from './widgetModel'

const paper = color.card
// Explicit widget brief: Home's action treatment, with this approved lime.
const actionLime = '#C8F560'
const padding = 14

/** Single-row punch card; even sixteen weeks fit the launcher's available width. */
export function widgetDotMetrics(width: number, count: number) {
  const available = Math.max(1, width - padding * 2)
  const gap = count > 8 ? 2 : 4
  // Reserve a dp per dot for Android rounding each dot AND gap to physical pixels.
  const size = Math.min(10, Math.max(2, Math.floor((available - count - gap * Math.max(0, count - 1)) / Math.max(1, count))))
  return { size, gap }
}

export function widgetDotStyle(cell: WidgetModel['cells'][number], size: number): FlexWidgetStyle {
  return {
    width: size, height: size, borderRadius: size / 2,
    backgroundColor: cell === 'done' ? paper : cell === 'missed' || cell === 'closed' ? color.fg : '#00000000',
    borderWidth: cell === 'now' ? Math.min(2, size / 4) : 1,
    borderColor: cell === 'future' ? '#FFFDF859' : cell === 'missed' || cell === 'closed' ? color.fg : paper,
  }
}

/** A Home tile, not a receipt. A single tap opens the app, never a transaction. */
export function RitualWidget({ model, width = 160 }: { model: WidgetModel; width?: number }) {
  const dots = widgetDotMetrics(width, model.cells.length)
  return <FlexWidget clickAction="OPEN_APP" style={{ width: 'match_parent', height: 'match_parent', backgroundColor: model.tint as `#${string}`, borderRadius: radius.lg, padding, overflow: 'hidden' }}>
    {/* Only the header takes surplus height: text stays at the top on a 2x3 stretch.
        A weighted, bounded header also protects the footer on a short launcher cell. */}
    <FlexWidget style={{ width: 'match_parent', height: 0, flex: 1, marginBottom: 8 }}>
      {model.stakeLabel ? <TextWidget text={model.stakeLabel} maxLines={1} truncate="END" style={{ width: 'match_parent', fontFamily: fonts.bodyStrong, fontWeight: '600', fontSize: 10, letterSpacing: 1, color: '#FFFDF8BF', marginBottom: 3 }} /> : null}
      <FlexWidget style={{ width: 'match_parent', height: 0, flex: 1 }}>
        <TextWidget text={model.title} maxLines={2} truncate="END" style={{ width: 'match_parent', height: 'match_parent', textAlign: 'left', fontFamily: fonts.display, fontWeight: '900', fontSize: 22, color: paper }} />
      </FlexWidget>
    </FlexWidget>
    <FlexWidget style={{ width: 'match_parent', flexGap: 4, alignItems: 'flex-start' }}>
      {model.cells.length ? <FlexWidget style={{ flexDirection: 'row', flexGap: dots.gap }}>
        {model.cells.map((cell, index) => <FlexWidget key={index} style={widgetDotStyle(cell, dots.size)} />)}
      </FlexWidget> : null}
      {model.countLine ? <TextWidget text={model.countLine} maxLines={1} truncate="END" style={{ width: 'match_parent', fontFamily: fonts.body, fontWeight: '400', fontSize: 11, color: paper }} /> : null}
      <TextWidget text={model.pill.text} maxLines={1} truncate="END" style={{ fontFamily: fonts.bodyStrong, fontWeight: '600', fontSize: 11, color: model.pill.act ? color.goInk : paper, backgroundColor: model.pill.act ? actionLime : '#FFFFFF33', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 }} />
    </FlexWidget>
  </FlexWidget>
}
