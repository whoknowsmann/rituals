/**
 * Rituals Paper theme.
 *
 * Dark-only by design. A staking app reads better dark, it films better in a
 * demo, and supporting one theme well beats supporting two badly with the time
 * available.
 */

import { MD3DarkTheme, type MD3Theme } from 'react-native-paper'
import { DarkTheme as NavigationDarkTheme } from '@react-navigation/native'
import { palette, radius, space, type } from './tokens'

export { palette, radius, space, type }

export const ritualsTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: radius.md,
  colors: {
    ...MD3DarkTheme.colors,
    primary: palette.gold500,
    onPrimary: palette.ink900,
    primaryContainer: palette.goldDim,
    onPrimaryContainer: palette.gold400,

    secondary: palette.green500,
    onSecondary: palette.ink900,
    secondaryContainer: palette.greenDim,
    onSecondaryContainer: palette.green500,

    error: palette.red500,
    onError: palette.ink900,
    errorContainer: palette.redDim,
    onErrorContainer: palette.red500,

    background: palette.ink900,
    onBackground: palette.bone,
    surface: palette.ink800,
    onSurface: palette.bone,
    surfaceVariant: palette.ink700,
    onSurfaceVariant: palette.bone70,
    outline: palette.ink500,
    outlineVariant: palette.ink600,

    elevation: {
      level0: 'transparent',
      level1: palette.ink800,
      level2: palette.ink700,
      level3: palette.ink700,
      level4: palette.ink600,
      level5: palette.ink600,
    },
  },
}

export const ritualsNavigationTheme = {
  ...NavigationDarkTheme,
  colors: {
    ...NavigationDarkTheme.colors,
    primary: palette.gold500,
    background: palette.ink900,
    card: palette.ink900,
    text: palette.bone,
    border: palette.ink700,
  },
}
