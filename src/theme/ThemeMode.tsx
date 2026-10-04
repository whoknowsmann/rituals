import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { color, darkColor, type Palette } from './tokens'

/**
 * Day / night (Jack, 2026-10-04): follow the phone's setting; the sun/moon
 * button in the top bar overrides it, and the choice is remembered.
 */
export type ThemeMode = 'system' | 'light' | 'dark'
export type Scheme = 'light' | 'dark'
const STORAGE_KEY = '@rituals/theme-mode/v1'

type SchemeContext = Readonly<{ scheme: Scheme; colors: Palette; mode: ThemeMode; toggle: () => void }>
const Ctx = createContext<SchemeContext>({ scheme: 'light', colors: color, mode: 'system', toggle: () => undefined })

export function resolveScheme(mode: ThemeMode, system: string | null | undefined): Scheme {
  if (mode === 'light' || mode === 'dark') return mode
  return system === 'dark' ? 'dark' : 'light'
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme()
  const [mode, setMode] = useState<ThemeMode>('system')
  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') setMode(saved)
    }).catch(() => undefined)
  }, [])
  const scheme = resolveScheme(mode, system)
  const toggle = useCallback(() => {
    const next: Scheme = scheme === 'dark' ? 'light' : 'dark'
    setMode(next)
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined)
  }, [scheme])
  const value = useMemo(() => ({ scheme, colors: scheme === 'dark' ? darkColor : color, mode, toggle }), [mode, scheme, toggle])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useScheme = (): SchemeContext => useContext(Ctx)
export const useColors = (): Palette => useContext(Ctx).colors

/**
 * Turns a module-level `StyleSheet.create` into a hook that builds the sheet
 * once per scheme. The factory's parameter is named `color` on purpose, so a
 * converted sheet's body stays exactly as it was.
 */
export function themedStyles<T>(factory: (color: Palette) => T): () => T {
  const cache: Partial<Record<Scheme, T>> = {}
  return function useThemedStyles(): T {
    const { scheme, colors } = useContext(Ctx)
    return cache[scheme] ?? (cache[scheme] = factory(colors))
  }
}
