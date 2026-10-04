/**
 * Rituals Paper + navigation themes — "Crew" (C2). Spec: docs/DESIGN.md.
 *
 * Paper components (buttons, inputs, segmented buttons, cards) inherit the Crew
 * palette and fonts from here, so screens not yet hand-rebuilt still render in
 * the new look.
 */

import { MD3LightTheme, configureFonts, type MD3Theme } from 'react-native-paper'
import { DefaultTheme as NavigationLightTheme } from '@react-navigation/native'
import { color, fonts, memberColor, memberColors, palette, radius, ritualPalette, ritualTint, space, type } from './tokens'

export { color, fonts, memberColor, memberColors, palette, radius, ritualPalette, ritualTint, space, type }

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

export const ritualsTheme: MD3Theme = {
  ...MD3LightTheme,
  dark: false,
  roundness: radius.md,
  fonts: paperFonts,
  colors: {
    ...MD3LightTheme.colors,
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
    surfaceDisabled: 'rgba(29,26,22,0.08)',
    onSurfaceDisabled: 'rgba(29,26,22,0.38)',
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

export const ritualsNavigationTheme = {
  ...NavigationLightTheme,
  colors: {
    ...NavigationLightTheme.colors,
    primary: color.fg,
    background: color.bg,
    card: color.bg,
    text: color.fg,
    border: color.line,
  },
}
