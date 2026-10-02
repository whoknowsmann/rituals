import { describe, expect, it } from 'vitest'
import { soloCreateStepPosition, soloCreateSteps, nextSoloCreateStep, previousSoloCreateStep } from './steps'
import { scopeFor } from '../../productScope'

describe('solo create steps', () => {
  it('is two screens (promise → stake) when the solo-only scope hides step 2', () => {
    const steps = soloCreateSteps(scopeFor(true))
    expect(steps).toEqual([1, 3])
    expect(nextSoloCreateStep(1, steps)).toBe(3)
    expect(nextSoloCreateStep(3, steps)).toBeNull()
    expect(previousSoloCreateStep(3, steps)).toBe(1)
    expect(previousSoloCreateStep(1, steps)).toBe(1)
    expect(soloCreateStepPosition(1, steps)).toEqual({ position: 1, total: 2 })
    expect(soloCreateStepPosition(3, steps)).toEqual({ position: 2, total: 2 })
  })

  it('keeps all three steps when any step-2 choice is offered', () => {
    expect(soloCreateSteps(scopeFor(false))).toEqual([1, 2, 3])
    expect(soloCreateSteps({ witness: false, groupFromCreate: false, proofChooser: true })).toEqual([1, 2, 3])
    const steps = soloCreateSteps(scopeFor(false))
    expect(nextSoloCreateStep(1, steps)).toBe(2)
    expect(previousSoloCreateStep(3, steps)).toBe(2)
    expect(soloCreateStepPosition(3, steps)).toEqual({ position: 3, total: 3 })
  })
})
