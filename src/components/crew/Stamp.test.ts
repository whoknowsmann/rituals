import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fonts } from '../../theme/tokens'
import { STAMP_KINDS, stampSpec } from './stampSpec'

describe('stampSpec (DESIGN rule 4: a miss never gets the success mark)', () => {
  it('has exactly the solo stamp vocabulary', () => {
    expect([...STAMP_KINDS].sort()).toEqual(['kept', 'missed', 'promise', 'showed-up', 'skipped'])
  })
  it('success marks are ink-green; miss/skip are quiet, never red, never "KEPT"', () => {
    for (const kind of ['kept', 'showed-up', 'promise'] as const) expect(stampSpec(kind).tone).toBe('ink')
    for (const kind of ['missed', 'skipped'] as const) {
      const spec = stampSpec(kind)
      expect(spec.tone).toBe('quiet')
      expect(spec.label).not.toMatch(/KEPT/)
    }
    expect(stampSpec('kept').label).toBe('KEPT')
    expect(stampSpec('promise').label).toBe('RITUAL STARTED')
  })
  it('tilts a little, differently per kind (imperfect ink, not wallpaper)', () => {
    const tilts = STAMP_KINDS.map((k) => stampSpec(k).rotateDeg)
    for (const t of tilts) expect(Math.abs(t)).toBeGreaterThan(0)
    for (const t of tilts) expect(Math.abs(t)).toBeLessThanOrEqual(8)
  })
})

describe('Stamp component', () => {
  const source = readFileSync(resolve(__dirname, 'Stamp.tsx'), 'utf8')
  it('animates in (motion confirms) and respects reduced motion', () => {
    expect(source).toContain('Animated.')
    expect(source).toContain('isReduceMotionEnabled')
  })
  it('uses theme tokens and the hand face', () => {
    expect(source).toContain("from '../../theme'")
    expect(source).not.toMatch(/'#[0-9a-fA-F]{3,8}'/)
    expect(source).toContain('fonts.hand')
  })
})

describe('handwriting face', () => {
  it('is a loaded Fraunces italic (no new dependency)', () => {
    expect(fonts.hand).toBe('Fraunces_600SemiBold_Italic')
  })

  it('lets a long section aside wrap instead of running off the screen', () => {
    const kit = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
    const head = kit.match(/sectionHead: \{[^}]*\}/)?.[0] ?? ''
    expect(head).toContain("flexWrap: 'wrap'")
    const title = kit.match(/sectionTitle: \{[^}]*\}/)?.[0] ?? ''
    expect(title).toContain('flexShrink: 1')
  })
})
