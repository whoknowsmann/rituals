import type { PreflightResult } from '../../domain/preflight/types'

export type ResultTone = 'clear' | 'hold' | 'abort'

export interface ResultViewModel {
  readonly title: 'CLEAR FOR TAKEOFF' | 'HOLD POSITION' | 'ABORT SIGNING'
  readonly tone: ResultTone
  readonly confidence: string
  readonly completeness: 'COMPLETE ANALYSIS' | 'INCOMPLETE ANALYSIS'
  readonly summary: string
  readonly action: string
  readonly observations: readonly string[]
  readonly inferredIntent: readonly string[]
  readonly assetChanges: readonly string[]
  readonly authorityChanges: readonly string[]
  readonly programs: readonly string[]
  readonly warnings: readonly string[]
  readonly unsupported: readonly string[]
  readonly simulation: string
  readonly disclaimer: string
}

const verdictPresentation = {
  CLEAR: {
    title: 'CLEAR FOR TAKEOFF',
    tone: 'clear',
  },
  HOLD: {
    title: 'HOLD POSITION',
    tone: 'hold',
  },
  ABORT: {
    title: 'ABORT SIGNING',
    tone: 'abort',
  },
} as const

const actionCopy = {
  PROCEED_WITH_REVIEW: 'Proceed only after reviewing wallet details.',
  VERIFY_INDEPENDENTLY: 'Verify independently before signing.',
  DO_NOT_SIGN: 'Do not sign this transaction.',
} as const

export function buildResultViewModel(result: PreflightResult): ResultViewModel {
  const presentation = verdictPresentation[result.verdict]

  return {
    ...presentation,
    confidence: `${result.confidence} CONFIDENCE`,
    completeness: result.analysisComplete ? 'COMPLETE ANALYSIS' : 'INCOMPLETE ANALYSIS',
    summary: result.summary,
    action: actionCopy[result.recommendedAction],
    observations: result.observations,
    inferredIntent: result.inferredIntent,
    assetChanges: result.assetChanges.map(
      (change) => `${change.amount} ${change.asset}: ${change.from} → ${change.to}`,
    ),
    authorityChanges: result.authorityChanges.map(
      (change) => `${change.kind} on ${change.account} (${change.severity})`,
    ),
    programs: result.programs.map(
      (program) => `${program.name ?? program.programId} · ${program.support}`,
    ),
    warnings: result.warnings,
    unsupported: result.unsupported,
    simulation:
      result.simulation.status === 'FAILED'
        ? `FAILED · ${result.simulation.reason}`
        : result.simulation.status === 'NOT_RUN'
          ? `NOT RUN${result.simulation.reason ? ` · ${result.simulation.reason}` : ''}`
          : 'SUCCEEDED',
    disclaimer: result.disclaimer,
  }
}
