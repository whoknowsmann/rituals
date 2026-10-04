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
  /** Stamp inks: deep green for kept/showed-up, warm grey for skipped/missed. Never red. */
  stampInk: '#2F6B2A',
  stampQuiet: '#8C8377',
  /** Paper tone for the missed/skipped state cards. */
  paperMuted: '#EAE3D6',
} as const

export type Palette = { readonly [K in keyof typeof color]: string }

/**
 * Night palette (2026-10-04): warm near-black, same lime. Keys mirror the day
 * palette so every style reads the same token. `onDark` is the text colour on
 * an `fg` background, so it inverts too; `white` stays white (text on posters).
 */
export const darkColor: Palette = {
  bg: '#141210',
  card: '#1E1B17',
  line: '#353029',
  fg: '#F2ECE2',
  muted: '#A69C8E',
  faint: '#7C7366',
  go: '#C8F169',
  goDeep: '#A5D84B',
  goInk: '#1B2606',
  danger: '#FF7B5E',
  dangerSoft: '#3A1D16',
  onDark: '#1D1A16',
  onDarkMuted: '#5C554C',
  white: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.22)',
  glass: 'rgba(255,255,255,0.18)',
  stampInk: '#93D38C',
  stampQuiet: '#9D9486',
  paperMuted: '#26221D',
}

/** Assigned by roster index. A ritual's poster takes its host's colour (index 0). */
export const memberColors = ['#FF7A59', '#2F7BFF', '#9B6BFF', '#16A085', '#F2A516', '#E84393'] as const

export function memberColor(index: number): string {
  const i = Number.isInteger(index) && index >= 0 ? index % memberColors.length : 0
  return memberColors[i]
}

/**
 * One colour per ritual, picked from its address so it never changes. Deep
 * enough for white text on every swatch (Home tiles, ritual poster).
 */
export const ritualPalette = ['#F0623F', '#2F6FE8', '#8657E8', '#13917A', '#D93A84', '#C9711F', '#4E7D2A', '#5A5F73'] as const

export function ritualTint(address: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < address.length; index += 1) {
    hash ^= address.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return ritualPalette[hash % ritualPalette.length]
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
  /** Handwriting only at commitment moments (promise, stamp note). Fraunces italic: already bundled, no new dependency. */
  hand: 'Fraunces_600SemiBold_Italic',
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
