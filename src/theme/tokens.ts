/**
 * Rituals design tokens — "Crew" (C2). Spec: docs/DESIGN.md.
 *
 * Light, warm, human: a group chat about showing up, not a bank. Friends are
 * the interface; money is a quiet fact, never the headline.
 */

export const color = {
  bg: '#F4EFE6',
  card: '#FFFDF8',
  line: '#E3DBCD',
  fg: '#1D1A16',
  muted: '#7A7166',
  faint: '#A79E91',
  go: '#C8F169',
  goDeep: '#8FBF2A',
  goInk: '#223008',
  danger: '#D6452B',
  dangerSoft: '#F9E1DA',
  onDark: '#F4EFE6',
  onDarkMuted: '#B9B1A4',
  white: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.14)',
  glass: 'rgba(255,255,255,0.28)',
} as const

/** Assigned by roster index. A ritual's poster takes its host's colour (index 0). */
export const memberColors = ['#FF7A59', '#2F7BFF', '#9B6BFF', '#16A085', '#F2A516', '#E84393'] as const

export function memberColor(index: number): string {
  const i = Number.isInteger(index) && index >= 0 ? index % memberColors.length : 0
  return memberColors[i]
}

/**
 * Legacy aliases so screens not yet rebuilt keep compiling while they are
 * migrated. Mapped onto the Crew palette, so they already render in the new
 * look. Remove once every screen uses `color`.
 */
export const palette = {
  ink900: color.bg,
  ink800: color.card,
  ink700: color.card,
  ink600: color.line,
  ink500: color.line,
  gold500: color.fg,
  gold400: color.fg,
  gold600: color.line,
  goldDim: color.card,
  green500: color.goDeep,
  greenDim: color.go,
  red500: color.danger,
  redDim: color.dangerSoft,
  bone: color.fg,
  bone70: color.muted,
  bone50: color.faint,
  white: color.white,
} as const

export const radius = { sm: 10, md: 15, lg: 20, poster: 28, pill: 999 } as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, screen: 18 } as const

export const fonts = {
  display: 'Fraunces_900Black',
  section: 'Fraunces_600SemiBold',
  body: 'Figtree_400Regular',
  bodyStrong: 'Figtree_600SemiBold',
  heavy: 'Figtree_800ExtraBold',
} as const

/** Scale ×1.25: 12 · 13 · 15 · 17 · 21 · 26 · 32 · 38. fontWeight omitted: the face carries it. */
export const type = {
  hero: { fontFamily: fonts.display, fontSize: 38, lineHeight: 40, letterSpacing: -1.2 },
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 35, letterSpacing: -0.9 },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 29, letterSpacing: -0.5 },
  section: { fontFamily: fonts.section, fontSize: 21, lineHeight: 25, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.heavy, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.bodyStrong, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.heavy, fontSize: 12, lineHeight: 15, letterSpacing: 1.5, textTransform: 'uppercase' },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 17 },
  money: { fontFamily: fonts.heavy, fontSize: 26, lineHeight: 30, letterSpacing: -0.6 },
  moneySm: { fontFamily: fonts.heavy, fontSize: 17, lineHeight: 21, letterSpacing: -0.2 },
} as const
