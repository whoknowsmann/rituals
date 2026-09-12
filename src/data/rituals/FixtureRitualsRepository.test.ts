import { describe, expect, it } from 'vitest'
import { FixtureRitualsRepository, FIXTURE_SNAPSHOTS } from './FixtureRitualsRepository'

describe('FixtureRitualsRepository', () => {
  it('returns coherent populated devnet fixture data without exposing mutable state', async () => {
    const repository = new FixtureRitualsRepository('populated')
    const first = await repository.getHomeSnapshot()
    const second = await repository.getHomeSnapshot()

    expect(first.mode).toBe('fixture')
    expect(first.source).toBe('devnet')
    expect(first.disclosure).toBe('NO REAL VALUE')
    expect(first.activeRitual?.members.funded).toBeLessThanOrEqual(first.activeRitual?.members.total ?? 0)
    expect(first.activeRitual?.stakeAtomicUnits).toBe(1250000000n)
    expect(second).not.toBe(first)
    expect(second.activeRitual).not.toBe(first.activeRitual)
    expect(FIXTURE_SNAPSHOTS.populated.activeRitual?.stakeAtomicUnits).toBe(1250000000n)
  })

  it.each(['funding', 'pending-confirmation', 'completed', 'empty'] as const)('supports %s state', async (state) => {
    const snapshot = await new FixtureRitualsRepository(state).getHomeSnapshot()
    expect(snapshot.state).toBe(state)
    expect(snapshot.mode).toBe('fixture')
  })

  it('returns a deterministic repository error state', async () => {
    await expect(new FixtureRitualsRepository('error').getHomeSnapshot()).rejects.toThrow('Fixture repository unavailable')
  })
})
