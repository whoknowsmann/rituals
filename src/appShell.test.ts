import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fonts } from './theme/tokens'

const app = readFileSync('App.tsx', 'utf8')
const nav = readFileSync('src/navigators/AppNavigator.tsx', 'utf8')

describe('app shell (Crew)', () => {
  it('loads every font family the theme references before rendering', () => {
    // The theme names these faces; if they are not loaded Android silently
    // falls back to the system font and the Crew type scale is lost.
    expect(app).toMatch(/useFonts\(/)
    for (const face of Object.values(fonts)) {
      expect(app, `App.tsx must load ${face}`).toContain(face)
    }
    expect(app).toMatch(/if \(!fontsLoaded(?: && !fontError)?\) return null/)
  })

  it('uses the light Crew chrome, not the old dark shell', () => {
    expect(app).toContain('<StatusBar style="dark"')
    expect(app).not.toContain('style="light"')
    expect(app).toContain('color.bg')
    expect(nav).toContain('backgroundColor: color.bg')
    expect(nav).not.toContain('palette.ink900')
    // A second, unstyled StatusBar inside the navigator would override the shell's.
    expect(nav).not.toMatch(/<StatusBar\s*\/>/)
  })
})
