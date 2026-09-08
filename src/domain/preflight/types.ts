export type Verdict = 'CLEAR' | 'HOLD' | 'ABORT'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type ProgramSupport = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN'
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

export type SimulationEvidence =
  | { readonly status: 'SUCCEEDED'; readonly reason: null }
  | { readonly status: 'FAILED'; readonly reason: string }
  | { readonly status: 'NOT_RUN'; readonly reason: string | null }

export interface PreflightEvidence {
  readonly evidenceComplete: boolean
  readonly programs: readonly ProgramObservation[]
  readonly assetMovements: readonly AssetMovement[]
  readonly authorityChanges: readonly AuthorityChange[]
  readonly simulation: SimulationEvidence
  readonly unresolvedElements: readonly string[]
}

export interface PreflightResult {
  readonly schemaVersion: '1.0'
  readonly verdict: Verdict
  readonly confidence: Confidence
  readonly analysisComplete: boolean
  readonly summary: string
  readonly observations: readonly string[]
  readonly inferredIntent: readonly string[]
  readonly assetChanges: readonly AssetMovement[]
  readonly authorityChanges: readonly AuthorityChange[]
  readonly programs: readonly ProgramObservation[]
  readonly warnings: readonly string[]
  readonly unsupported: readonly string[]
  readonly simulation: SimulationEvidence
  readonly recommendedAction:
    | 'PROCEED_WITH_REVIEW'
    | 'VERIFY_INDEPENDENTLY'
    | 'DO_NOT_SIGN'
  readonly disclaimer: string
}
