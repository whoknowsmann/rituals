import { DEMO_CADENCE, type RitualCadence } from '../../src/domain/rituals/schedule'

/**
 * Demo-cadence windows, overridable for the on-device run. A Season ritual takes
 * its windows from the Season account on chain, so widening the check-in window
 * needs no app rebuild. Phantom on a Seeker took ~70 s of a 90 s window.
 */
export function demoCadenceFrom(overrides: Readonly<{ periodSeconds?: number; claimWindowSeconds?: number; graceSeconds?: number }>): RitualCadence {
  const claimWindowSeconds = overrides.claimWindowSeconds ?? DEMO_CADENCE.claimWindowSeconds
  const resolutionGraceSeconds = overrides.graceSeconds ?? DEMO_CADENCE.resolutionGraceSeconds
  const periodSeconds = overrides.periodSeconds ?? Math.max(DEMO_CADENCE.periodSeconds, claimWindowSeconds + resolutionGraceSeconds + 30)
  if (!Number.isInteger(claimWindowSeconds) || claimWindowSeconds < 30 || claimWindowSeconds > 3600) throw new Error('--claim-window-seconds must be an integer between 30 and 3600')
  if (!Number.isInteger(resolutionGraceSeconds) || resolutionGraceSeconds < 30 || resolutionGraceSeconds > 3600) throw new Error('--grace-seconds must be an integer between 30 and 3600')
  if (!Number.isInteger(periodSeconds) || periodSeconds <= claimWindowSeconds + resolutionGraceSeconds) throw new Error('--period-seconds must be greater than the claim window plus grace')
  const unchanged = claimWindowSeconds === DEMO_CADENCE.claimWindowSeconds
    && resolutionGraceSeconds === DEMO_CADENCE.resolutionGraceSeconds
    && periodSeconds === DEMO_CADENCE.periodSeconds
  return unchanged
    ? DEMO_CADENCE
    : Object.freeze({ ...DEMO_CADENCE, periodSeconds, claimWindowSeconds, resolutionGraceSeconds, label: `Demo (accelerated, ${claimWindowSeconds}s check-in)` })
}
