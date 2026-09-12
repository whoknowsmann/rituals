import type { RitualsHomeSnapshot, RitualsHomeState, RitualsRepository } from './RitualsRepository'

const activeRitual = {
  id: 'ritual-weekly-run',
  title: 'Saturday morning miles',
  requirement: 'Run or walk 5 km together before Sunday evening.',
  members: { funded: 3, total: 4 },
  stakeAtomicUnits: 1_250_000_000n,
  tokenDecimals: 6,
  tokenSymbol: 'TEST',
  nextEvent: 'Saturday · 9:00 AM',
  confirmationMode: 'ONE_FRIEND',
} as const

const base = {
  mode: 'fixture' as const,
  source: 'devnet' as const,
  disclosure: 'NO REAL VALUE' as const,
}

export const FIXTURE_SNAPSHOTS: Readonly<Record<Exclude<RitualsHomeState, 'error'>, RitualsHomeSnapshot>> = {
  populated: { ...base, state: 'populated', activeRitual, confirmations: { count: 1 }, funding: { funded: 2, total: 4 }, completedReceipt: { title: 'February book club', amountAtomicUnits: 2_000_000_000n, tokenDecimals: 6, tokenSymbol: 'TEST' } },
  funding: { ...base, state: 'funding', activeRitual: { ...activeRitual, members: { funded: 2, total: 4 } }, confirmations: { count: 0 }, funding: { funded: 2, total: 4 } },
  'pending-confirmation': { ...base, state: 'pending-confirmation', activeRitual: { ...activeRitual, members: { funded: 4, total: 4 }, nextEvent: 'Claim ready · confirm by Sunday' }, confirmations: { count: 1 }, funding: { funded: 4, total: 4 } },
  completed: { ...base, state: 'completed', confirmations: { count: 0 }, completedReceipt: { title: 'February book club', amountAtomicUnits: 2_000_000_000n, tokenDecimals: 6, tokenSymbol: 'TEST' } },
  empty: { ...base, state: 'empty' },
}

function cloneSnapshot(snapshot: RitualsHomeSnapshot): RitualsHomeSnapshot {
  return {
    ...snapshot,
    activeRitual: snapshot.activeRitual && { ...snapshot.activeRitual, members: { ...snapshot.activeRitual.members } },
    confirmations: snapshot.confirmations && { ...snapshot.confirmations },
    funding: snapshot.funding && { ...snapshot.funding },
    completedReceipt: snapshot.completedReceipt && { ...snapshot.completedReceipt },
  }
}

export class FixtureRitualsRepository implements RitualsRepository {
  constructor(private readonly state: RitualsHomeState = 'populated') {}

  async getHomeSnapshot(): Promise<RitualsHomeSnapshot> {
    if (this.state === 'error') throw new Error('Fixture repository unavailable')
    return cloneSnapshot(FIXTURE_SNAPSHOTS[this.state])
  }
}
