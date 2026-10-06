import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COMING_SOON_LINE, SCOPE, SOLO_ONLY, scopeFor } from './productScope'
import { DEMO_SOLO_CADENCE, REAL_SOLO_CADENCE } from '../../domain/rituals/schedule'
import { DEFAULT_SOLO_SPEED, SOLO_SPEEDS, soloCadenceFor } from './solo/create/schedule'

const read = (path: string) => readFileSync(resolve(__dirname, '../../', path), 'utf8')
const home = read('screens/RitualsHomeScreen.tsx')
const create = read('screens/solo/SoloCreateScreen.tsx')
const ritual = read('screens/solo/SoloRitualScreen.tsx')

/** The source line that renders `needle` must also carry `gate`. */
const gatedLine = (source: string, needle: string, gate: string) => {
  const lines = source.split('\n').filter((line) => line.includes(needle))
  expect(lines.length, `expected a line containing ${needle}`).toBeGreaterThan(0)
  for (const line of lines) expect(line, `${needle} must be gated by ${gate}`).toContain(gate)
}

describe('single-blade fold (solo only)', () => {
  it('ships with the solo-only scope switched on, every side surface off', () => {
    expect(SOLO_ONLY).toBe(true)
    expect(Object.values(SCOPE).every((visible) => visible === false)).toBe(true)
    expect(Object.values(scopeFor(false)).every((visible) => visible === true)).toBe(true)
  })

  it('Home offers only "Make a promise": friends, join and Seasons are gated', () => {
    gatedLine(home, 'label="With friends"', 'SCOPE.homeFriends')
    gatedLine(home, 'label="Join with a link"', 'SCOPE.homeJoin')
    gatedLine(home, '<SeasonsSection', 'SCOPE.seasons')
    // No Season read at all when Seasons are hidden.
    expect(home).toMatch(/!SCOPE\.seasons \|\| DEMO_SEASON\.address === null/)
    // Coming soon is plain text, never a button.
    expect(home).toContain('{COMING_SOON_LINE}')
    expect(home).not.toMatch(/label=\{COMING_SOON_LINE\}/)
    expect(COMING_SOON_LINE).toBe('With friends: coming soon.')
  })

  it('Create hides witness, friends, proof chooser and the Season param (the destination choice is shown: Jack, 2026-10-06)', () => {
    gatedLine(create, 'title="+ One witness"', 'SCOPE.witness')
    gatedLine(create, "navigation.navigate('TemplatePicker')", 'SCOPE.groupFromCreate')
    gatedLine(create, '<Section title="Proof, if you want it"', 'SCOPE.proofChooser')
    expect(create).toContain('DEMO_CAUSES.map(')
    expect(create).toContain('title="A wallet you choose"')
    gatedLine(create, 'route.params?.seasonAddress', 'SCOPE.seasons')
    expect(create).toContain('soloCreateSteps(SCOPE)')
    expect(create).toContain('nextSoloCreateStep(')
    expect(create).toContain('previousSoloCreateStep(')
    // New promises keep a note record, so the note line shows at every stamp.
    expect(create).toMatch(/proofMode: SCOPE\.proofChooser \? 'none' : 'note'/)
  })

  it('Create writes a solo cadence chosen by the Demo speed · Real weeks switch (Demo default), never the group demo cadence', () => {
    expect(create).toContain('cadence: soloCadenceFor(speed)')
    expect(create).toContain('useState<SoloSpeed>(DEFAULT_SOLO_SPEED)')
    expect(create).toContain('SOLO_SPEEDS.map(')
    expect(create).not.toContain('cadence: DEMO_CADENCE')
    expect(DEFAULT_SOLO_SPEED).toBe('demo')
    expect(SOLO_SPEEDS.map((option) => option.cadence)).toEqual([DEMO_SOLO_CADENCE, REAL_SOLO_CADENCE])
    expect(soloCadenceFor(DEFAULT_SOLO_SPEED)).toBe(DEMO_SOLO_CADENCE)
  })

  it('Ritual screen hides the witness card and offers the note line at every stamp', () => {
    gatedLine(ritual, 'const canShareWitness', 'SCOPE.witness')
    expect(ritual).toContain('notesOffered(')
    expect(ritual).not.toContain("proofModeRef.current === 'note'")
  })
})
