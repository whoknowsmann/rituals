import type {
  PreflightEvidence,
  PreflightResult,
} from './types'

export const PRECHECK_DISCLAIMER =
  'Preflight analyzes normalized evidence and does not guarantee transaction safety.'

export function analyze(evidence: PreflightEvidence): PreflightResult {
  const unsupported = evidence.programs
    .filter((program) => program.support !== 'SUPPORTED')
    .map((program) => program.programId)
  const severeAuthorityLoss = evidence.authorityChanges.some(
    (change) => change.kind === 'AUTHORITY_LOSS' && change.severity === 'SEVERE',
  )
  const simulationSucceeded = evidence.simulation.status === 'SUCCESS'
  const analysisComplete =
    evidence.evidenceComplete &&
    unsupported.length === 0 &&
    evidence.unresolvedElements.length === 0 &&
    simulationSucceeded

  const verdict = severeAuthorityLoss
    ? 'ABORT'
    : analysisComplete
      ? 'CLEAR'
      : 'HOLD'
  const confidence = verdict === 'CLEAR' ? 'HIGH' : verdict === 'HOLD' ? 'MEDIUM' : 'HIGH'
  const warnings = [
    ...evidence.unresolvedElements.map(() => 'UNRESOLVED_EVIDENCE'),
    ...unsupported.map(() => 'UNSUPPORTED_OR_UNKNOWN_PROGRAM'),
    ...(evidence.simulation.status === 'FAILURE' ? ['SIMULATION_FAILED'] : []),
    ...(evidence.simulation.status === 'NOT_RUN' ? ['SIMULATION_NOT_RUN'] : []),
    ...(severeAuthorityLoss ? ['SEVERE_AUTHORITY_LOSS'] : []),
  ]

  return {
    version: 1,
    verdict,
    confidence,
    analysisComplete,
    observations: [
      ...evidence.assetMovements.map(() => 'ASSET_MOVEMENT'),
      ...evidence.authorityChanges.map(() => 'AUTHORITY_CHANGE'),
    ],
    inferredIntent: evidence.assetMovements.length > 0 ? ['TRANSFER'] : [],
    assetChanges: [...evidence.assetMovements],
    authorityChanges: [...evidence.authorityChanges],
    programs: [...evidence.programs],
    warnings,
    unsupported: [...unsupported, ...evidence.unresolvedElements],
    simulation: { ...evidence.simulation },
    recommendedAction:
      verdict === 'CLEAR' ? 'PROCEED' : verdict === 'HOLD' ? 'REVIEW' : 'DO_NOT_PROCEED',
    disclaimer: PRECHECK_DISCLAIMER,
  }
}
