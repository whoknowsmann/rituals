import { describe, expect, it } from 'vitest'
import type { RitualsHomeState } from './RitualsRepository'
import { FixtureRitualsRepository } from './FixtureRitualsRepository'

const states = ['populated', 'funding', 'pending-confirmation', 'completed', 'empty'] as const satisfies readonly Exclude<RitualsHomeState, 'error'>[]

describe('FixtureRitualsRepository', () => {
  it('returns the canonical populated devnet fixture', async () => {
    const snapshot = await new FixtureRitualsRepository('populated').getHomeSnapshot()

    expect(snapshot).toMatchObject({
      state: 'populated',
      mode: 'fixture',
      source: 'devnet',
      disclosure: 'NO REAL VALUE',
      activeRitual: {
        status: 'ACTIVE',
        members: { funded: 4, total: 4 },
        tokenDecimals: 6,
        tokenSymbol: 'tSKR',
        confirmationMode: 'ONE_FRIEND',
      },
      confirmations: { count: 0 },
      funding: { funded: 4, total: 4 },
    })
    expect(snapshot.activeRitual?.id).toBe('ritual-weekly-run')
    expect(snapshot.activeRitual?.stakeAtomicUnits).toBe(1_250_000_000n)
  })

  it('returns the funding fixture with matching progress and status', async () => {
    const snapshot = await new FixtureRitualsRepository('funding').getHomeSnapshot()

    expect(snapshot.state).toBe('funding')
    expect(snapshot.activeRitual?.status).toBe('FUNDING')
    expect(snapshot.activeRitual?.members).toEqual({ funded: 2, total: 4 })
    expect(snapshot.funding).toEqual({ funded: 2, total: 4 })
  })

  it('returns the pending confirmation fixture with an active fully funded ritual', async () => {
    const snapshot = await new FixtureRitualsRepository('pending-confirmation').getHomeSnapshot()

    expect(snapshot.state).toBe('pending-confirmation')
    expect(snapshot.activeRitual?.status).toBe('ACTIVE')
    expect(snapshot.activeRitual?.members).toEqual({ funded: 4, total: 4 })
    expect(snapshot.confirmations).toEqual({ count: 1 })
  })

  it('returns the completed fixture with only its exact receipt', async () => {
    const snapshot = await new FixtureRitualsRepository('completed').getHomeSnapshot()

    expect(snapshot.state).toBe('completed')
    expect(snapshot.activeRitual).toBeUndefined()
    expect(snapshot.completedReceipt).toEqual({
      ritualId: 'ritual-book-club',
      eventIndex: 0,
      title: 'February book club',
      amountAtomicUnits: 1_500_000_000n,
      tokenDecimals: 6,
      tokenSymbol: 'tSKR',
    })
  })

  it('returns the empty fixture without an active ritual or receipt', async () => {
    const snapshot = await new FixtureRitualsRepository('empty').getHomeSnapshot()

    expect(snapshot.state).toBe('empty')
    expect(snapshot.activeRitual).toBeUndefined()
    expect(snapshot.completedReceipt).toBeUndefined()
    expect(snapshot.confirmations).toBeUndefined()
    expect(snapshot.funding).toBeUndefined()
  })

  it.each(states)('keeps %s fixture values coherent', async (state) => {
    const snapshot = await new FixtureRitualsRepository(state).getHomeSnapshot()

    if (snapshot.funding) expect(snapshot.funding.funded).toBeLessThanOrEqual(snapshot.funding.total)
    if (snapshot.activeRitual) expect(snapshot.activeRitual.members.funded).toBeLessThanOrEqual(snapshot.activeRitual.members.total)
    if (snapshot.activeRitual && snapshot.funding) {
      expect(snapshot.activeRitual.members.funded).toBe(snapshot.funding.funded)
      expect(snapshot.activeRitual.members.total).toBe(snapshot.funding.total)
    }
  })

  it('returns detached nested snapshots', async () => {
    const repository = new FixtureRitualsRepository('populated')
    const first = await repository.getHomeSnapshot()
    const second = await repository.getHomeSnapshot()

    const mutableClone: {
      activeRitual: { members: { funded: number } }
      funding: { funded: number }
    } = {
      activeRitual: { members: { funded: first.activeRitual?.members.funded ?? 0 } },
      funding: { funded: first.funding?.funded ?? 0 },
    }
    mutableClone.activeRitual.members.funded = 0
    mutableClone.funding.funded = 0

    expect(first).not.toBe(second)
    expect(first.activeRitual).not.toBe(second.activeRitual)
    expect(first.activeRitual?.members).not.toBe(second.activeRitual?.members)
    expect(second.activeRitual?.members.funded).toBe(4)
    expect(second.funding?.funded).toBe(4)
  })

  it('rejects with the deterministic fixture error', async () => {
    await expect(new FixtureRitualsRepository('error').getHomeSnapshot()).rejects.toThrow('Fixture repository unavailable')
  })
})
