/**
 * Crew UI kit. Spec: docs/DESIGN.md. Plain RN primitives on purpose: these are
 * the brand, so they are not Paper components wearing a theme.
 */
import React, { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import { color, memberColor, radius, space, type, themedStyles, useColors } from '../../theme'
import { HoldButton } from './HoldButton'
import { compactWeekMark, isClosedWeekCell, isKeptWeekCell, weekCellAccessibilityLabel, weekCellLabel, weekSummary, weekSummaryShort, type WeekCell } from './weekStripLogic'

export { HoldButton }
export { Confetti } from './Confetti'
export { Stamp } from './Stamp'
export { STAMP_KINDS, stampSpec, type StampKind } from './stampSpec'

export const haptic = {
  light: () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}) },
  success: () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}) },
  warning: () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}) },
}

export function Hero({ children, kicker }: { children: React.ReactNode; kicker?: string }) {
  const s = useS()
  return (
    <View style={s.hero}>
      {kicker ? <Text style={s.heroKicker}>{kicker}</Text> : null}
      <Text style={s.heroText} accessibilityRole="header">{children}</Text>
    </View>
  )
}

export function Section({ title, aside, children }: { title: string; aside?: string; children?: React.ReactNode }) {
  const s = useS()
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>
        {aside ? <Text style={s.sectionAside}>{aside}</Text> : null}
      </View>
      {children}
    </View>
  )
}

export function Poster({ tint, kicker, title, children }: { tint: string; kicker?: string; title: string; children?: React.ReactNode }) {
  const s = useS()
  return (
    <View style={[s.poster, { backgroundColor: tint }]} accessibilityLabel={`${title}${kicker ? `, ${kicker}` : ''}`}>
      <View style={s.posterOrb} />
      {kicker ? <Text style={s.posterKicker}>{kicker}</Text> : null}
      <Text style={s.posterTitle}>{title}</Text>
      {children}
    </View>
  )
}

export function PosterLine({ label, value }: { label: string; value: string }) {
  const s = useS()
  return (
    <View style={s.posterLine}>
      <Text style={s.posterLineLabel}>{label}</Text>
      <Text style={s.posterLineValue}>{value}</Text>
    </View>
  )
}

export { type WeekCell, weekCellLabel, weekSummary, weekSummaryShort } from './weekStripLogic'

/**
 * The punch card. Full: one cell per week (✓ kept, ✕ missed, NOW, numbers to
 * come) with a summary line under it. Compact (Home tiles): small dots + line.
 */
export function WeekStrip({ cells, tint, compact = false, summary = true, summaryLabel, onClosedWeekPress }: { cells: readonly WeekCell[]; tint: string; compact?: boolean; summary?: boolean; summaryLabel?: string; onClosedWeekPress?: (eventIndex: number) => void }) {
  const s = useS()
  const line = summaryLabel ?? (compact ? weekSummaryShort(cells) : weekSummary(cells))
  return (
    <View accessibilityLabel={line}>
      <View style={[s.strip, compact && s.stripCompact]}>
        {cells.map((cell, i) => {
          const kept = isKeptWeekCell(cell)
          if (compact) return <View key={i} accessible accessibilityLabel={weekCellAccessibilityLabel(cell, i)} style={[s.dot, kept && s.dotDone, (cell === 'now' || cell === 'current' || cell === 'skip-pending') && s.dotNow, cell === 'closed' && s.dotClosed, cell === 'missed' && s.dotMissed]}>
            {compactWeekMark(cell) && <Text style={s.dotMark}>{compactWeekMark(cell)}</Text>}
          </View>
          const cellStyle = [s.cell, kept && s.cellDone, (cell === 'now' || cell === 'current') && s.cellNow, (cell === 'missed' || cell === 'closed') && s.cellMissed]
          const label = <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[s.cellText, kept && { color: tint }, (cell === 'now' || cell === 'current') && s.cellNowText]}>{weekCellLabel(cell, i)}</Text>
          return onClosedWeekPress && isClosedWeekCell(cell)
            ? <Pressable key={i} onPress={() => onClosedWeekPress(i)} accessibilityRole="button" accessibilityLabel={`See week ${i + 1} receipt`} hitSlop={{ top: 6, bottom: 6 }} style={({ pressed }) => [...cellStyle, pressed && { opacity: 0.7 }]}>{label}</Pressable>
            : <View key={i} style={cellStyle}>{label}</View>
        })}
      </View>
      {summary && <Text style={[s.stripSummary, compact && s.stripSummaryCompact]} numberOfLines={summaryLabel ? undefined : 1}>{line}</Text>}
    </View>
  )
}

export function MemberTile({ index, label, ok, size = 42 }: { index: number; label: string; ok?: boolean; size?: number }) {
  const s = useS()
  const initial = (label.trim()[0] ?? '?').toUpperCase()
  return (
    <View style={{ width: size, height: size }}>
      <View style={[s.tile, { width: size, height: size, borderRadius: size * 0.36, backgroundColor: memberColor(index) }]}>
        <Text style={[s.tileText, { fontSize: size * 0.42 }]}>{initial}</Text>
      </View>
      {ok ? <View style={s.tick}><Text style={s.tickText}>✓</Text></View> : null}
    </View>
  )
}

export function Chip({ children, ok, onPress, accessibilityLabel }: { children: React.ReactNode; ok?: boolean; onPress?: () => void; accessibilityLabel?: string }) {
  const s = useS()
  const body = <Text style={s.chipText}>{children}</Text>
  if (!onPress) return <View style={[s.chip, ok && s.chipOk]}>{body}</View>
  return (
    <Pressable onPress={() => { haptic.light(); onPress() }} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [s.chip, ok && s.chipOk, pressed && { transform: [{ scale: 0.95 }] }]}>
      {body}
    </Pressable>
  )
}

/** A row in a feed: member tile + name + what happened + optional chips. */
export function FeedRow({ index, name, action, when, faded, children }: { index: number; name: string; action: string; when?: string; faded?: boolean; children?: React.ReactNode }) {
  const s = useS()
  return (
    <View style={[s.feedRow, faded && { opacity: 0.5 }]}>
      <MemberTile index={index} label={name} />
      <View style={{ flex: 1 }}>
        <Text style={s.feedText}><Text style={s.feedName}>{name}</Text> {action}</Text>
        {when ? <Text style={s.feedWhen}>{when}</Text> : null}
        {children ? <View style={s.chips}>{children}</View> : null}
      </View>
    </View>
  )
}

/** Primary action. `go` = lime, `dark` = ink. Never more than one per screen. `link` = a minor action, quiet text. */
export function ActionButton({ label, onPress, tone = 'go', disabled, loading, accessibilityLabel, style }: { label: string; onPress: () => void; tone?: 'go' | 'dark' | 'quiet' | 'link'; disabled?: boolean; loading?: boolean; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  const s = useS()
  const color = useColors()
  const off = disabled || loading
  const link = tone === 'link'
  return (
    <Pressable
      onPress={() => { if (off) return; haptic.light(); onPress() }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [link ? s.link : s.btn, tone === 'go' && s.btnGo, tone === 'dark' && s.btnDark, tone === 'quiet' && s.btnQuiet, off && { opacity: 0.45 }, pressed && !off && (link ? { opacity: 0.6 } : { transform: [{ scale: 0.97 }] }), style]}
    >
      <Text style={[link ? s.linkText : s.btnText, tone === 'dark' && { color: color.onDark }, tone === 'go' && { color: color.goInk }]}>{label}</Text>
    </Pressable>
  )
}

export function Dock({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  const s = useS()
  return (
    <View style={s.dock}>
      <View style={{ flex: 1 }}>
        <Text style={s.dockTitle}>{title}</Text>
        {body ? <Text style={s.dockBody}>{body}</Text> : null}
      </View>
      {children}
    </View>
  )
}

/** Fade + drop-in for content that just appeared because the user did something. */
export function DropIn({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => { Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }).start() }, [v])
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }] }}>{children}</Animated.View>
}

/** Funding roster in Crew language: tile, name, short address, In / Not in yet. */
export function PeopleList({ people }: { people: readonly { index: number; name: string; short: string; status: string }[] }) {
  const s = useS()
  return (
    <View style={s.people} accessibilityLabel="Who is in">
      {people.map((person, i) => (
        <View key={person.index} style={[s.person, i < people.length - 1 && s.personRule]} accessibilityLabel={`${person.name}, ${person.status}`}>
          <MemberTile index={person.index} label={person.name} ok={person.status === 'In'} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.personName}>{person.name}</Text>
            <Text style={s.personAddress}>{person.short}</Text>
          </View>
          <Text style={s.personStatus}>{person.status}</Text>
        </View>
      ))}
    </View>
  )
}

export function Footnote({ children }: { children: React.ReactNode }) {
  const s = useS()
  return <Text style={s.footnote}>{children}</Text>
}

export function ErrorLine({ children }: { children: React.ReactNode }) {
  const s = useS()
  return <Text style={s.error} accessibilityLiveRegion="polite">{children}</Text>
}

const useS = themedStyles((color) => StyleSheet.create({
  people: { backgroundColor: color.card, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, paddingHorizontal: space.lg },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  personRule: { borderBottomWidth: 1, borderBottomColor: color.line },
  personName: { ...type.heading, color: color.fg },
  personAddress: { ...type.caption, color: color.faint, marginTop: 1 },
  personStatus: { ...type.caption, fontFamily: type.bodyStrong.fontFamily, color: color.muted },
  hero: { marginTop: space.sm, marginBottom: space.lg, gap: space.xs },
  heroKicker: { ...type.label, color: color.muted },
  heroText: { ...type.display, color: color.fg },
  section: { marginTop: space.xl },
  sectionHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: space.md, rowGap: 2, marginBottom: space.sm, paddingHorizontal: 2 },
  sectionTitle: { ...type.section, color: color.fg, flexShrink: 1 },
  sectionAside: { ...type.caption, fontFamily: type.bodyStrong.fontFamily, color: color.muted },

  poster: { borderRadius: radius.poster, padding: space.xl, overflow: 'hidden' },
  posterOrb: { position: 'absolute', right: -70, top: -70, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.14)' },
  posterKicker: { ...type.label, color: color.white, opacity: 0.9 },
  posterTitle: { ...type.hero, color: color.white, marginTop: space.sm, marginBottom: space.lg, maxWidth: '88%' },
  posterLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space.md },
  posterLineLabel: { ...type.caption, fontFamily: type.bodyStrong.fontFamily, color: color.white, opacity: 0.92 },
  posterLineValue: { ...type.moneySm, color: color.white },

  strip: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, height: 34, borderRadius: 12, backgroundColor: color.scrim, alignItems: 'center', justifyContent: 'center' },
  cellDone: { backgroundColor: color.white },
  cellNow: { backgroundColor: color.glass, borderWidth: 2, borderColor: color.white },
  cellNowText: { letterSpacing: 0 },
  cellMissed: { backgroundColor: 'rgba(0,0,0,0.28)' },
  cellText: { ...type.caption, fontFamily: type.heading.fontFamily, color: color.white },
  stripCompact: { gap: 5, flexWrap: 'wrap' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: color.white, borderColor: color.white },
  dotNow: { backgroundColor: 'transparent', borderColor: color.white, borderWidth: 2.5 },
  dotClosed: { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: 'transparent' },
  dotMissed: { borderWidth: 0 },
  dotMark: { fontFamily: type.bodyStrong.fontFamily, fontSize: 11, lineHeight: 12, includeFontPadding: false, color: color.white, opacity: 0.8 },
  stripSummary: { ...type.caption, fontFamily: type.bodyStrong.fontFamily, color: color.white, opacity: 0.95, marginTop: space.sm },
  stripSummaryCompact: { marginTop: space.xs },

  tile: { alignItems: 'center', justifyContent: 'center' },
  tileText: { fontFamily: type.heading.fontFamily, color: color.white },
  tick: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: color.go, borderWidth: 2, borderColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  tickText: { fontSize: 10, fontFamily: type.heading.fontFamily, color: color.goInk },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
  chip: { backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 11 },
  chipOk: { backgroundColor: color.go, borderColor: color.goDeep },
  chipText: { ...type.caption, fontFamily: type.bodyStrong.fontFamily, color: color.fg },

  feedRow: { flexDirection: 'row', gap: space.md, paddingVertical: 14, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: color.line },
  feedText: { ...type.body, color: color.fg },
  feedName: { fontFamily: type.heading.fontFamily },
  feedWhen: { ...type.caption, color: color.muted, marginTop: 2 },

  btn: { borderRadius: radius.lg, paddingVertical: 17, paddingHorizontal: space.xl, alignItems: 'center', justifyContent: 'center' },
  btnGo: { backgroundColor: color.go, borderWidth: 1, borderColor: color.goDeep },
  btnDark: { backgroundColor: color.fg },
  btnQuiet: { backgroundColor: color.card, borderWidth: 1, borderColor: color.line },
  btnText: { ...type.heading, color: color.fg },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { ...type.bodyStrong, color: color.muted, textDecorationLine: 'underline' },

  dock: { position: 'absolute', left: 12, right: 12, bottom: 14, backgroundColor: color.fg, borderRadius: radius.poster, paddingVertical: 14, paddingLeft: space.xl, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 14, elevation: 12, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  dockTitle: { ...type.heading, color: color.onDark },
  dockBody: { ...type.caption, color: color.onDarkMuted, marginTop: 2 },

  hold: { width: 74, height: 74, alignItems: 'center', justifyContent: 'center' },
  holdCore: { width: 56, height: 56, borderRadius: 28, backgroundColor: color.go, alignItems: 'center', justifyContent: 'center' },
  holdText: { ...type.caption, fontFamily: type.heading.fontFamily, color: color.fg, textAlign: 'center' },

  footnote: { ...type.caption, color: color.faint, textAlign: 'center', marginTop: space.xl },
  error: { ...type.body, color: color.danger, marginTop: space.sm },
}))
