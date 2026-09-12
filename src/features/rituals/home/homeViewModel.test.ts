import { describe, expect, it } from 'vitest'
import { FixtureRitualsRepository } from '../../../data/rituals/FixtureRitualsRepository'
import { buildHomeViewModel } from './homeViewModel'

describe('buildHomeViewModel', () => {
  it('presents the populated home with exact bigint stake formatting', async () => {
    const snapshot = await new FixtureRitualsRepository('populated').getHomeSnapshot()
    const view = buildHomeViewModel(snapshot)

    expect(view.identity.title).toBe('Rituals')
    expect(view.identity.valueProposition).toContain('show up together')
    expect(view.disclosure).toBe('DEVNET · TEST TOKENS · FIXTURE DATA')
    expect(view.activeRituals[0].stakeAtRisk).toBe('1,250.000000 TEST')
    expect(view.activeRituals[0].memberProgress).toBe('4 of 4 members ready')
    expect(view.ctas.fundRitual).toBe(false)
    expect(view.cards.funding).toBe(false)
  })

  it('does not convert atomic units through floating point', () => {
    const snapshot = {
      ...(FIXTURE_REPOSITORY_SNAPSHOT as any),
      activeRitual: { ...(FIXTURE_REPOSITORY_SNAPSHOT as any).activeRitual, stakeAtomicUnits: 900719925474099312345n },
    }
    const view = buildHomeViewModel(snapshot)
    expect(view.activeRituals[0].stakeAtRisk).toBe('900,719,925,474,099.312345 TEST')
  })

  it('presents empty and error states', () => {
    expect(buildHomeViewModel({ state: 'empty', mode: 'fixture', source: 'devnet', disclosure: 'NO REAL VALUE' }).kind).toBe('empty')
    expect(buildHomeViewModel({ state: 'error', mode: 'fixture', source: 'devnet', disclosure: 'NO REAL VALUE', errorMessage: 'Offline fixture error' }).kind).toBe('error')
  })
})

const FIXTURE_REPOSITORY_SNAPSHOT = {
  state: 'populated', mode: 'fixture', source: 'devnet', disclosure: 'NO REAL VALUE',
  activeRitual: { id: 'r', title: 'Test', requirement: 'Test', members: { funded: 1, total: 2 }, stakeAtomicUnits: 1n, tokenDecimals: 6, tokenSymbol: 'TEST', nextEvent: 'Soon', confirmationMode: 'HONOR' },
  confirmations: { count: 0 }, funding: { funded: 1, total: 2 }, completedReceipt: undefined,
}
