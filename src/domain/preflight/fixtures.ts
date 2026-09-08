import type { PreflightEvidence } from './types'

export interface PreflightFixture {
  readonly id: string
  readonly label: string
  readonly evidence: PreflightEvidence
}

const basePrograms = [
  { programId: '11111111111111111111111111111111', support: 'SUPPORTED' as const, name: 'System Program' },
]

export const PREFLIGHT_FIXTURES: readonly PreflightFixture[] = [
  {
    id: 'clear-transfer',
    label: 'FIXTURE: supported SOL transfer',
    evidence: {
      evidenceComplete: true,
      programs: basePrograms,
      assetMovements: [{ asset: 'SOL', amount: '1', from: 'FixtureAlice', to: 'FixtureBob' }],
      authorityChanges: [],
      simulation: { status: 'SUCCEEDED', reason: null },
      unresolvedElements: [],
    },
  },
  {
    id: 'unknown-program',
    label: 'FIXTURE: unknown program review',
    evidence: {
      evidenceComplete: true,
      programs: [{ programId: 'FixtureUnknownProgram', support: 'UNKNOWN' }],
      assetMovements: [],
      authorityChanges: [],
      simulation: { status: 'SUCCEEDED', reason: null },
      unresolvedElements: [],
    },
  },
  {
    id: 'authority-loss',
    label: 'FIXTURE: severe authority loss',
    evidence: {
      evidenceComplete: true,
      programs: basePrograms,
      assetMovements: [],
      authorityChanges: [
        { account: 'FixtureAccount', kind: 'AUTHORITY_LOSS', severity: 'SEVERE' },
      ],
      simulation: { status: 'SUCCEEDED', reason: null },
      unresolvedElements: [],
    },
  },
]
