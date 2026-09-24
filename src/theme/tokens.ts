/**
 * Rituals design tokens.
 *
 * Direction: a commitment device with your own money behind it. Dark-first,
 * high contrast, with gold reserved almost exclusively for value — your stake.
 *
 * Gold rather than the usual Solana purple/green for two reasons: it reads as
 * "your stake" without explanation, and it makes the app visually distinct in a
 * dApp Store full of purple gradients.
 */

export const palette = {
  // Near-black base with a warm tint, so gold sits on it without vibrating.
  ink900: '#0C0A09',
  ink800: '#161311',
  ink700: '#211C19',
  ink600: '#2E2825',
  ink500: '#453D38',

  // Primary: your stake and what you get back.
  gold500: '#F5B841',
  gold400: '#FFC961',
  gold600: '#D9971B',
  goldDim: '#4A3616',

  // Secondary: confirmation, showing up, a claim that held.
  green500: '#4ADE80',
  greenDim: '#14321F',

  // Danger: forfeit, missed, questioned.
  red500: '#F87171',
  redDim: '#3A1A1A',

  // Neutral text
  bone: '#FAF7F2',
  bone70: '#BDB6AC',
  bone50: '#8A837A',

  white: '#FFFFFF',
} as const

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

/**
 * Type scale. Money and headline numbers get tight tracking and heavy weight so
 * the amount at risk reads as the most important thing on screen.
 */
export const type = {
  display: { fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2 },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  money: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -1 },
  moneySm: { fontSize: 17, lineHeight: 21, fontWeight: '700', letterSpacing: -0.4 },
} as const
