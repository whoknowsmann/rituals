import { describe, expect, it } from 'vitest'
import { analyze } from './analyze'
import { PREFLIGHT_FIXTURES } from './fixtures'
import type { PreflightEvidence } from './types'

const benignTransfer: PreflightEvidence = {
  evidenceComplete: true,
  programs: [
    { programId: '11111111111111111111111111111111', support: 'SUPPORTED', name: 'System Program' },
  ],
  assetMovements: [
    { asset: 'SOL', amount: '1', from: 'Alice', to: 'Bob' },
  ],
  authorityChanges: [],
  simulation: { status: 'SUCCEEDED', reason: null },
  unresolvedElements: [],
}

describe('analyze', () => {
  it('clears a fully supported benign transfer after successful simulation', () => {
    const result = analyze(benignTransfer)

    expect(result.verdict).toBe('CLEAR')
    expect(result.confidence).toBe('HIGH')
    expect(result.analysisComplete).toBe(true)
    expect(result.assetChanges).toEqual(benignTransfer.assetMovements)
  })

  it('holds when required evidence is incomplete', () => {
    const result = analyze({ ...benignTransfer, evidenceComplete: false })

    expect(result.verdict).toBe('HOLD')
    expect(result.analysisComplete).toBe(false)
  })

  it('aborts on severe authority loss and recommends not proceeding', () => {
    const result = analyze({
      ...benignTransfer,
      authorityChanges: [
        { account: 'Alice', kind: 'AUTHORITY_LOSS', severity: 'SEVERE' },
      ],
    })

    expect(result.verdict).toBe('ABORT')
    expect(result.recommendedAction).toBe('DO_NOT_SIGN')
    expect(result.warnings).toContain('SEVERE_AUTHORITY_LOSS')
  })

  it('holds on an unknown program without severe evidence', () => {
    const result = analyze({
      ...benignTransfer,
      programs: [{ programId: 'unknown-program', support: 'UNKNOWN' }],
    })

    expect(result.verdict).toBe('HOLD')
    expect(result.verdict).not.toBe('ABORT')
  })

  it('holds with incomplete analysis when simulation fails', () => {
    const result = analyze({
      ...benignTransfer,
      simulation: { status: 'FAILED', reason: 'account not found' },
    })

    expect(result.verdict).toBe('HOLD')
    expect(result.analysisComplete).toBe(false)
    expect(result.simulation.reason).toBe('account not found')
    expect(result.warnings).toContain('SIMULATION_FAILED')
  })

  it('uses conservative deterministic summaries for each verdict', () => {
    const clear = analyze(benignTransfer)
    const hold = analyze({ ...benignTransfer, evidenceComplete: false })
    const abort = analyze({
      ...benignTransfer,
      authorityChanges: [
        { account: 'Alice', kind: 'AUTHORITY_LOSS', severity: 'SEVERE' },
      ],
    })

    expect(clear.summary).toBe(
      'No supported high-risk behavior was detected in the available evidence.',
    )
    expect(hold.summary).toBe(
      'Analysis is incomplete or contains unsupported behavior. Verify independently.',
    )
    expect(abort.summary).toBe('Severe authority loss was detected. Do not sign.')
  })

  it('emits the documented versioned result contract', () => {
    const result = analyze(benignTransfer)

    expect(result).toMatchObject({
      schemaVersion: '1.0',
      simulation: { status: 'SUCCEEDED', reason: null },
      recommendedAction: 'PROCEED_WITH_REVIEW',
      disclaimer: 'Preflight is a safety aid, not a guarantee.',
    })
    expect(result).not.toHaveProperty('version')
  })

  it('keeps observations and inferred intent as separate deterministic fields', () => {
    const result = analyze(benignTransfer)

    expect(result.observations).toContain('ASSET_MOVEMENT')
    expect(result.inferredIntent).toEqual(['TRANSFER'])
    expect(result.observations).not.toBe(result.inferredIntent)
    expect(result.disclaimer).toBe(
      'Preflight is a safety aid, not a guarantee.',
    )
  })

  it('exposes harmless fixtures with explicit fixture labels', () => {
    expect(PREFLIGHT_FIXTURES.length).toBeGreaterThanOrEqual(3)
    expect(PREFLIGHT_FIXTURES.every((fixture) => fixture.label.includes('FIXTURE'))).toBe(true)
  })

  it('holds when required evidence contains an unsupported program', () => {
    const result = analyze({
      ...benignTransfer,
      programs: [{ programId: 'unknown-program', support: 'UNSUPPORTED' }],
    })

    expect(result.verdict).toBe('HOLD')
    expect(result.analysisComplete).toBe(false)
    expect(result.unsupported).toContain('unknown-program')
  })
})
