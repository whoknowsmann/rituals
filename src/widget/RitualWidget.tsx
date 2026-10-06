/**
 * Clarity test: a stranger glancing at the 2x2 widget for two seconds can answer
 * (1) which ritual, (2) what to do now, (3) by when, (4) what's at stake,
 * (5) that it's Rituals.
 */
import React from 'react'
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import { color, fonts, radius } from '../theme/tokens'
import type { WidgetModel } from './widgetModel'
import { stampFaceSvg } from './stampFace'
import { punchCardSvg } from './punchCard'

const padding = 8

/** Reserve readable copy first; the stamp uses the remaining square budget. */
export function widgetLayout(width: number, height: number, empty = false, weeks = 6) {
  const innerWidth = Math.max(1, width - padding * 2)
  const innerHeight = Math.max(1, height - padding * 2)
  const horizontal = width >= 240 && width >= height * 1.5
  const compact = height < 140
  const brandHeight = compact ? 10 : 14
  const titleHeight = empty ? 0 : compact ? 16 : 24
  const lineHeight = empty ? 26 : compact ? 32 : 44
  const dotsHeight = empty ? 0 : weeks > 8 ? 24 : 12
  const textHeight = brandHeight + titleHeight + lineHeight + dotsHeight
  const faceSize = Math.max(1, Math.floor(horizontal ? Math.min(innerHeight, innerWidth * 0.43) : Math.min(innerWidth, innerHeight - textHeight)))
  const textWidth = horizontal ? innerWidth - faceSize - 12 : innerWidth
  return { horizontal, faceSize, brandHeight, titleHeight, lineHeight, dotsHeight, textHeight, textWidth, innerWidth, innerHeight }
}

/** Snapshot only. Tap opens Rituals; never signs or submits from the widget. */
export function RitualWidget({ model, width = 160, height = 160 }: { model: WidgetModel; width?: number; height?: number }) {
  const empty = model.state === 'empty'
  const layout = widgetLayout(width, height, empty, model.dots.length)
  const textColor = empty ? color.fg : color.card
  const textAlign = layout.horizontal ? 'left' : 'center'
  // AndroidSVG 1.4 has text/textPath support, but a tiny rasterized rim legend
  // isn't device-verified. Use shape-only ink ticks and explicit native branding.
  const brand = <TextWidget text="RITUALS" maxLines={1} style={{ width: 'match_parent', height: layout.brandHeight, textAlign, fontFamily: fonts.bodyStrong, fontWeight: '600', fontSize: height < 140 ? 7 : 9, letterSpacing: 1.2, color: textColor }} />
  const name = !empty ? <TextWidget text={model.title || 'Your ritual'} maxLines={1} truncate="END" style={{ width: 'match_parent', height: layout.titleHeight, textAlign, fontFamily: fonts.display, fontWeight: '900', fontSize: height < 140 ? 12 : 18, color: textColor }} /> : null
  // One bounded action block, not a fourth stake label. Only names ellipsize;
  // action/amount copy fits as a whole so a clipped number cannot change a stake.
  const action = <TextWidget text={model.line} maxLines={3} style={{ width: 'match_parent', height: layout.lineHeight, textAlign, fontFamily: fonts.bodyStrong, fontWeight: '600', fontSize: layout.horizontal ? 14 : width < 140 ? 10 : 12, adjustsFontSizeToFit: true, color: model.state === 'stamped' ? '#C8F560' : textColor }} />
  const dots = !empty ? <SvgWidget svg={punchCardSvg(model.dots)} style={{ width: Math.min(layout.textWidth, Math.min(8, model.dots.length) * 12), height: layout.dotsHeight }} /> : null
  const stamp = <SvgWidget svg={stampFaceSvg(model.face, model.ink, model.seal)} style={{ width: layout.faceSize, height: layout.faceSize }} />
  return <FlexWidget clickAction="OPEN_APP" style={{ width: 'match_parent', height: 'match_parent', flexDirection: layout.horizontal ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: model.tint as `#${string}`, borderRadius: radius.lg, padding, overflow: 'hidden' }}>
    {!layout.horizontal ? brand : null}
    {!layout.horizontal ? name : null}
    {stamp}
    {layout.horizontal ? <FlexWidget style={{ width: 0, flex: 1, marginLeft: 12, height: 'match_parent', justifyContent: 'center', alignItems: 'flex-start' }}>
      {brand}{name}{action}{dots}
    </FlexWidget> : null}
    {!layout.horizontal ? action : null}
    {!layout.horizontal ? dots : null}
  </FlexWidget>
}
