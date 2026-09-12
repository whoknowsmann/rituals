import type { RitualId, RitualStatus, TokenAtomicUnits } from '../../domain/rituals/types'
import type { RitualsHomeSnapshot, RitualsHomeState, RitualsRepository } from './RitualsRepository'

const id = (value: string): RitualId => value as RitualId
const units = (value: bigint): TokenAtomicUnits => value as TokenAtomicUnits
const status = (value: RitualStatus): RitualStatus => value

const active = {
  id: id('ritual-weekly-run'),
  title: 'Saturday morning miles',
  requirement: 'Run or walk 5 km together before Sunday evening.',
  members: { funded: 4, total: 4 },
  stakeAtomicUnits: units(1_250_000_000n),
  tokenDecimals: 6,
  tokenSymbol: 'TEST',
  nextEvent: 'Saturday · 9:00 AM',
  confirmationMode: 'ONE_FRIEND' as const,
  status: status('ACTIVE'),
} as const

const base = {
  mode: 'fixture' as const,
  source: 'devnet' as const,
  disclosure: 'NO REAL VALUE' as const,
}

const snapshots: Readonly<Record<Exclude<RitualsHomeState, 'error'>, RitualsHomeSnapshot>> = Object.freeze({
  populated: Object.freeze({
    ...base,
    state: 'populated',
    activeRitual: active,
    confirmations: { count: 0 },
    funding: { funded: 4, total: 4 },
  }),
  funding: Object.freeze({
    ...base,
    state: 'funding',
    activeRitual: { ...active, status: status('FUNDING'), members: { funded: 2, total: 4 } },
    confirmations: { count: 0 },
    funding: { funded: 2, total: 4 },
  }),
  'pending-confirmation': Object.freeze({
    ...base,
    state: 'pending-confirmation',
    activeRitual: { ...active, nextEvent: 'Claim ready · confirm by Sunday' },
    confirmations: { count: 1 },
    funding: { funded: 4, total: 4 },
  }),
  completed: Object.freeze({
    ...base,
    state: 'completed',
    confirmations: { count: 0 },
    completedReceipt: {
      title: 'February book club',
      amountAtomicUnits: units(2_000_000_000n),
      tokenDecimals: 6,
      tokenSymbol: 'TEST',
    },
  }),
  empty: Object.freeze({ ...base, state: 'empty' }),
})

const clone = (snapshot: RitualsHomeSnapshot): RitualsHomeSnapshot => ({
  ...snapshot,
  activeRitual: snapshot.activeRitual && {
    ...snapshot.activeRitual,
    members: { ...snapshot.activeRitual.members },
  },
  activeRituals: snapshot.activeRituals?.map((ritual) => ({ ...ritual, members: { ...ritual.members } })),
  confirmations: snapshot.confirmations && { ...snapshot.confirmations },
  funding: snapshot.funding && { ...snapshot.funding },
  completedReceipt: snapshot.completedReceipt && { ...snapshot.completedReceipt },
})

export class FixtureRitualsRepository implements RitualsRepository {
  constructor(private readonly state: RitualsHomeState = 'populated') {}

  async getHomeSnapshot(): Promise<RitualsHomeSnapshot> {
    if (this.state === 'error') throw new Error('Fixture repository unavailable')
    return clone(snapshots[this.state])
  }
}
