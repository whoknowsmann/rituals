import { describe, expect, it } from 'vitest'
import { analyze } from '../../domain/preflight/analyze'
import { PREFLIGHT_FIXTURES } from '../../domain/preflight/fixtures'
import { buildResultViewModel } from './resultViewModel'

function resultFor(id: string) {
  const fixture = PREFLIGHT_FIXTURES.find((candidate) => candidate.id === id)
  if (!fixture) {
    throw new Error(`Missing fixture: ${id}`)
  }
  return buildResultViewModel(analyze(fixture.evidence))
}

describe('buildResultViewModel', () => {
  it('maps each verdict to distinct, restrained cockpit language', () => {
    expect(resultFor('clear-transfer')).toMatchObject({
      title: 'CLEAR FOR TAKEOFF',
      tone: 'clear',
      action: 'Proceed only after reviewing wallet details.',
    })
    expect(resultFor('unknown-program')).toMatchObject({
      title: 'HOLD POSITION',
      tone: 'hold',
      action: 'Verify independently before signing.',
    })
    expect(resultFor('authority-loss')).toMatchObject({
      title: 'ABORT SIGNING',
      tone: 'abort',
      action: 'Do not sign this transaction.',
    })
  })

  it('makes incomplete analysis explicit rather than reassuring', () => {
    const view = resultFor('unknown-program')

    expect(view.completeness).toBe('INCOMPLETE ANALYSIS')
    expect(view.warnings).toContain('UNSUPPORTED_OR_UNKNOWN_PROGRAM')
    expect(view.unsupported).toContain('FixtureUnknownProgram')
  })

  it('formats observed asset movement without calling it inferred intent', () => {
    const view = resultFor('clear-transfer')

    expect(view.assetChanges).toEqual(['1 SOL: FixtureAlice → FixtureBob'])
    expect(view.inferredIntent).toEqual(['TRANSFER'])
    expect(view.observations).toContain('ASSET_MOVEMENT')
  })
})
