/**
 * Rituals Paper + navigation themes — "Crew" (C2). Spec: docs/DESIGN.md.
 *
 * Paper components (buttons, inputs, segmented buttons, cards) inherit the Crew
 * palette and fonts from here, so screens not yet hand-rebuilt still render in
 * the new look.
 */

import { MD3DarkTheme, MD3LightTheme, configureFonts, type MD3Theme } from 'react-native-paper'
import { DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationLightTheme } from '@react-navigation/native'
import { color, darkColor, fonts, memberColor, memberColors, palette, radius, ritualPalette, ritualTint, space, type, type Palette } from './tokens'

export { color, darkColor, fonts, memberColor, memberColors, palette, radius, ritualPalette, ritualTint, space, type, type Palette }
export { ThemeModeProvider, themedStyles, useColors, useScheme } from './ThemeMode'

const face = (fontFamily: string) => ({ fontFamily })

const paperFonts = configureFonts({
  config: {
    displayLarge: face(fonts.display),
    displayMedium: face(fonts.display),
    displaySmall: face(fonts.display),
    headlineLarge: face(fonts.display),
    headlineMedium: { ...face(fonts.display), letterSpacing: -0.5 },
    headlineSmall: face(fonts.section),
    titleLarge: face(fonts.heavy),
    titleMedium: face(fonts.heavy),
    titleSmall: face(fonts.bodyStrong),
    labelLarge: face(fonts.heavy),
    labelMedium: face(fonts.bodyStrong),
    labelSmall: face(fonts.bodyStrong),
    bodyLarge: face(fonts.body),
    bodyMedium: face(fonts.body),
    bodySmall: face(fonts.body),
  },
})

export function makePaperTheme(color: Palette, dark: boolean): MD3Theme {
  const base = dark ? MD3DarkTheme : MD3LightTheme
  return {
  ...base,
  dark,
  roundness: radius.md,
  fonts: paperFonts,
  colors: {
    ...base.colors,
    primary: color.fg,
    onPrimary: color.onDark,
    primaryContainer: color.go,
    onPrimaryContainer: color.goInk,

    secondary: color.goDeep,
    onSecondary: color.fg,
    secondaryContainer: color.go,
    onSecondaryContainer: color.goInk,

    tertiary: memberColors[0],
    onTertiary: color.white,

    error: color.danger,
    onError: color.white,
    errorContainer: color.dangerSoft,
    onErrorContainer: color.danger,

    background: color.bg,
    onBackground: color.fg,
    surface: color.card,
    onSurface: color.fg,
    surfaceVariant: color.card,
    onSurfaceVariant: color.muted,
    surfaceDisabled: dark ? 'rgba(242,236,226,0.10)' : 'rgba(29,26,22,0.08)',
    onSurfaceDisabled: dark ? 'rgba(242,236,226,0.38)' : 'rgba(29,26,22,0.38)',
    outline: color.line,
    outlineVariant: color.line,
    inverseSurface: color.fg,
    inverseOnSurface: color.onDark,

    elevation: {
      level0: 'transparent',
      level1: color.card,
      level2: color.card,
      level3: color.card,
      level4: color.card,
      level5: color.card,
    },
  },
  }
}

export function makeNavigationTheme(color: Palette, dark: boolean) {
  const base = dark ? NavigationDarkTheme : NavigationLightTheme
  return {
    ...base,
    dark,
    colors: {
      ...base.colors,
      primary: color.fg,
      background: color.bg,
      card: color.bg,
      text: color.fg,
      border: color.line,
    },
  }
}

/** Day themes, kept for screens outside the solo app (still light-only). */
export const ritualsTheme: MD3Theme = makePaperTheme(color, false)
export const ritualsNavigationTheme = makeNavigationTheme(color, false)
export const ritualsDarkTheme: MD3Theme = makePaperTheme(darkColor, true)
export const ritualsDarkNavigationTheme = makeNavigationTheme(darkColor, true)
