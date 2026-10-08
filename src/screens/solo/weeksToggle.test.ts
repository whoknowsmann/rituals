import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SOLO_SPEEDS } from '../../features/rituals/solo/create/schedule'

const create = readFileSync(resolve(__dirname, 'SoloCreateScreen.tsx'), 'utf8')
const ritual = readFileSync(resolve(__dirname, 'SoloRitualScreen.tsx'), 'utf8')

/** Demo speed · Real weeks on create, and the demo-speed line on the ritual screen (approved 2026-10-04). */
describe('weeks toggle wiring', () => {
  it('create offers the two speed pills in the weeks card and summarises the schedule from one pure line', () => {
    expect(create).toContain('SOLO_SPEEDS.map(')
    expect(create).toContain('soloScheduleSummary({')
    expect(create).toContain('{scheduleLine}</Text>')
    expect(create).not.toContain('in all · Demo speed')
  })

  it('option labels are not a substring of any heading on the create screen (the device tap driver matches substrings)', () => {
    const headings = [...create.matchAll(/<Hero[^>]*>([^<]*)<\/Hero>|<Section title="([^"]*)"|styles\.label}>([^<{]*)</g)]
      .map((match) => match[1] ?? match[2] ?? match[3] ?? '')
    expect(headings.length).toBeGreaterThan(3)
    for (const option of SOLO_SPEEDS) for (const heading of headings) expect(heading.toLowerCase()).not.toContain(option.label.toLowerCase())
  })

  it('the ritual screen gates the unchanged muted demo-speed line to the lead and open unstamped weeks', () => {
    expect(ritual).toContain('{showDemoSpeedNotice(model, stampPending) && <Text style={s.muted}>{model.demoSpeedNotice} Unstamped weeks are missed.</Text>}')
    expect(create.indexOf("speed === 'demo' && <Text style={styles.quiet}>{DEMO_CLOCK_WARNING}")).toBeLessThan(create.indexOf("label={create.isBusy ? 'Locking in…'"))
    expect(ritual.indexOf('model.demoSpeedNotice')).toBeLessThan(ritual.indexOf('{renderState(model'))
  })
})
