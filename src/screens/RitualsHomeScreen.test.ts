import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'RitualsHomeScreen.tsx'), 'utf8')

describe('RitualsHomeScreen safety and accessibility structure', () => {
  it('renders fixture disclosure while loading and after errors', () => {
    expect(source).toContain('view.disclosure')
    expect(source).toContain('accessibilityLiveRegion="polite"')
  })

  it('offers a retry action wired to the repository loader', () => {
    expect(source).toContain('const load = useCallback')
    expect(source).toContain('onPress={load}')
    expect(source).toContain('Try again')
  })

  it('uses stable ritual ids and named design tokens, never raw hex', () => {
    expect(source).toContain('key={ritual.id}')
    expect(source).toContain('makeStyles(theme)')
    // Colours must come from the shared palette so the theme stays the single
    // source of truth. Raw hex in a screen is how a design system rots.
    expect(source).toContain("from '../theme'")
    expect(source).toContain('palette.')
    expect(source).not.toMatch(/color:\s*'#[0-9a-fA-F]{3,8}'/)
    expect(source).not.toMatch(/backgroundColor:\s*'#[0-9a-fA-F]{3,8}'/)
  })

  it('does not expose repository error text', () => {
    expect(source).toContain('safeErrorMessage(error)')
    expect(source).not.toContain('error instanceof Error ? error.message')
  })
})
