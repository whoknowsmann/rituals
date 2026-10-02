import type { ProductScope } from '../../productScope'

/**
 * Solo create steps by their original number: 1 = what you promise,
 * 2 = who keeps you honest (+ proof), 3 = stake, destination and approval.
 * Step 2 only exists while one of its choices is offered; with the solo-only
 * scope the flow is two screens (1 → 3).
 */
export type SoloCreateStep = 1 | 2 | 3

export function soloCreateSteps(scope: Pick<ProductScope, 'witness' | 'groupFromCreate' | 'proofChooser'>): readonly SoloCreateStep[] {
  return scope.witness || scope.groupFromCreate || scope.proofChooser
    ? Object.freeze([1, 2, 3] as const)
    : Object.freeze([1, 3] as const)
}

export function nextSoloCreateStep(step: SoloCreateStep, steps: readonly SoloCreateStep[]): SoloCreateStep | null {
  const index = steps.indexOf(step)
  return index >= 0 && index < steps.length - 1 ? steps[index + 1] : null
}

export function previousSoloCreateStep(step: SoloCreateStep, steps: readonly SoloCreateStep[]): SoloCreateStep {
  const index = steps.indexOf(step)
  return index > 0 ? steps[index - 1] : steps[0]
}

/** 1-based position for the "N OF M" progress label. */
export function soloCreateStepPosition(step: SoloCreateStep, steps: readonly SoloCreateStep[]): Readonly<{ position: number; total: number }> {
  const index = steps.indexOf(step)
  return Object.freeze({ position: index >= 0 ? index + 1 : 1, total: steps.length })
}
