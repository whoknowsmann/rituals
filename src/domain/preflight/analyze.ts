import type {
  PreflightEvidence,
  PreflightResult,
} from './types'

export const PRECHECK_DISCLAIMER =
  'Preflight is a safety aid, not a guarantee.'

export function analyze(evidence: PreflightEvidence): PreflightResult {
  const unsupported = evidence.programs
    .filter((program) => program.support !== 'SUPPORTED')
    .map((program) => program.programId)
  const severeAuthorityLoss = evidence.authorityChanges.some(
    (change) => change.kind === 'AUTHORITY_LOSS' && change.severity === 'SEVERE',
  )
  const simulationSucceeded = evidence.simulation.status === 'SUCCEEDED'
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
  const summary =
    verdict === 'CLEAR'
      ? 'No supported high-risk behavior was detected in the available evidence.'
      : verdict === 'HOLD'
        ? 'Analysis is incomplete or contains unsupported behavior. Verify independently.'
        : 'Severe authority loss was detected. Do not sign.'
  const warnings = [...new Set([
    ...evidence.unresolvedElements.map(() => 'UNRESOLVED_EVIDENCE'),
    ...unsupported.map(() => 'UNSUPPORTED_OR_UNKNOWN_PROGRAM'),
    ...(evidence.simulation.status === 'FAILED' ? ['SIMULATION_FAILED'] : []),
    ...(evidence.simulation.status === 'NOT_RUN' ? ['SIMULATION_NOT_RUN'] : []),
    ...(severeAuthorityLoss ? ['SEVERE_AUTHORITY_LOSS'] : []),
  ])]

  return {
    schemaVersion: '1.0',
    verdict,
    confidence,
    analysisComplete,
    summary,
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
      verdict === 'CLEAR'
        ? 'PROCEED_WITH_REVIEW'
        : verdict === 'HOLD'
          ? 'VERIFY_INDEPENDENTLY'
          : 'DO_NOT_SIGN',
    disclaimer: PRECHECK_DISCLAIMER,
  }
}
