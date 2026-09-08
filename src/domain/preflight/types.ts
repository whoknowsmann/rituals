export type Verdict = 'CLEAR' | 'HOLD' | 'ABORT'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type ProgramSupport = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN'
export type SimulationStatus = 'SUCCESS' | 'FAILURE' | 'NOT_RUN'
export type AuthorityChangeKind = 'AUTHORITY_LOSS' | 'AUTHORITY_GAIN' | 'DELEGATE_CHANGE'
export type AuthoritySeverity = 'SEVERE' | 'NON_SEVERE'

export interface ProgramObservation {
  readonly programId: string
  readonly support: ProgramSupport
  readonly name?: string
}

export interface AssetMovement {
  readonly asset: string
  readonly amount: string
  readonly from: string
  readonly to: string
}

export interface AuthorityChange {
  readonly account: string
  readonly kind: AuthorityChangeKind
  readonly severity: AuthoritySeverity
  readonly authority?: string
}

export interface SimulationEvidence {
  readonly status: SimulationStatus
  readonly reason?: string
}

export interface PreflightEvidence {
  readonly evidenceComplete: boolean
  readonly programs: readonly ProgramObservation[]
  readonly assetMovements: readonly AssetMovement[]
  readonly authorityChanges: readonly AuthorityChange[]
  readonly simulation: SimulationEvidence
  readonly unresolvedElements: readonly string[]
}

export interface PreflightResult {
  readonly version: 1
  readonly verdict: Verdict
  readonly confidence: Confidence
  readonly analysisComplete: boolean
  readonly observations: readonly string[]
  readonly inferredIntent: readonly string[]
  readonly assetChanges: readonly AssetMovement[]
  readonly authorityChanges: readonly AuthorityChange[]
  readonly programs: readonly ProgramObservation[]
  readonly warnings: readonly string[]
  readonly unsupported: readonly string[]
  readonly simulation: SimulationEvidence
  readonly recommendedAction: 'PROCEED' | 'REVIEW' | 'DO_NOT_PROCEED'
  readonly disclaimer: string
}
