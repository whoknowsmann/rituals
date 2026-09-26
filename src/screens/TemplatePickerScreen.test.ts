import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Source-level guards for the Suggest screen, in the same style as the other
 * screen tests (no RN renderer in this suite). Each guards a defect Jack saw on
 * the Seeker on 2026-09-26.
 */
const source = readFileSync('src/screens/TemplatePickerScreen.tsx', 'utf8')

describe('TemplatePickerScreen', () => {
  it('always responds to Suggest, even when the text has not changed', () => {
    // The old button only set `submitted`; same text → same state → nothing
    // happened. Every Suggest must bump a round that re-keys the cards.
    expect(source).toContain('setRound((r) => r + 1)')
    expect(source).toMatch(/key=\{`\$\{round\}/)
  })

  it('brings results into view instead of leaving them under the keyboard', () => {
    expect(source).toContain('Keyboard.dismiss()')
    expect(source).toContain('scrollTo(')
  })

  it('suggests while typing', () => {
    expect(source).toContain('LIVE_DEBOUNCE_MS')
  })

  it('keeps example chips quiet: Crew chips, sentence case, no Paper lime chips', () => {
    expect(source).not.toContain("from 'react-native-paper'")
    expect(source).toContain("from '../components/crew'")
    const examples = source.match(/const EXAMPLES = \[([^\]]+)\]/)?.[1] ?? ''
    const items = [...examples.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) expect(item[0]).toBe(item[0].toUpperCase())
  })

  it('has no narration under the title (DESIGN.md rule 3)', () => {
    expect(source).not.toContain('we will shape it into a ritual')
  })

  it('uses named design tokens, never raw hex', () => {
    expect(source).not.toMatch(/'#[0-9a-fA-F]{3,8}'/)
  })
})
