import type { RitualId, RitualStatus, TokenAtomicUnits } from '../../domain/rituals/types'
import type { RitualsHomeSnapshot, RitualsHomeState, RitualsRepository } from './RitualsRepository'
import { getClaimFixture } from '../../features/rituals/claims/fixtures'

const units = (value: bigint): TokenAtomicUnits => value as TokenAtomicUnits
const activeFixture = getClaimFixture('ritual-weekly-run', 0)!
const active = {
  id: activeFixture.ritualId,
  title: activeFixture.detail.title,
  requirement: activeFixture.detail.requirement,
  members: { funded: 4, total: 4 },
  stakeAtomicUnits: units(activeFixture.detail.stakeAtomicUnits),
  tokenDecimals: activeFixture.detail.tokenDecimals,
  tokenSymbol: activeFixture.detail.tokenSymbol,
  nextEvent: activeFixture.detail.nextClaimWindow,
  confirmationMode: activeFixture.detail.confirmationMode,
  status: 'ACTIVE' as RitualStatus,
} as const
const base = { mode: 'fixture' as const, source: 'devnet' as const, disclosure: 'NO REAL VALUE' as const }
const bookClub = getClaimFixture('ritual-book-club', 0)!
const snapshots: Readonly<Record<Exclude<RitualsHomeState, 'error'>, RitualsHomeSnapshot>> = Object.freeze({
  populated: Object.freeze({ ...base, state: 'populated', activeRitual: active, confirmations: { count: 0 }, funding: { funded: 4, total: 4 } }),
  funding: Object.freeze({ ...base, state: 'funding', activeRitual: { ...active, status: 'FUNDING' as RitualStatus, members: { funded: 2, total: 4 } }, confirmations: { count: 0 }, funding: { funded: 2, total: 4 } }),
  'pending-confirmation': Object.freeze({ ...base, state: 'pending-confirmation', activeRitual: { ...active, nextEvent: 'Claim ready · confirm by Sunday' }, confirmations: { count: 1 }, funding: { funded: 4, total: 4 } }),
  completed: Object.freeze({ ...base, state: 'completed', confirmations: { count: 0 }, completedReceipt: { ritualId: bookClub.ritualId, eventIndex: bookClub.eventIndex, title: bookClub.detail.title, amountAtomicUnits: units(2_000_000_000n), tokenDecimals: bookClub.receipt.tokenDecimals, tokenSymbol: bookClub.receipt.tokenSymbol } }),
  empty: Object.freeze({ ...base, state: 'empty' }),
})
const clone = (snapshot: RitualsHomeSnapshot): RitualsHomeSnapshot => ({ ...snapshot, activeRitual: snapshot.activeRitual && { ...snapshot.activeRitual, members: { ...snapshot.activeRitual.members } }, activeRituals: snapshot.activeRituals?.map((ritual) => ({ ...ritual, members: { ...ritual.members } })), confirmations: snapshot.confirmations && { ...snapshot.confirmations }, funding: snapshot.funding && { ...snapshot.funding }, completedReceipt: snapshot.completedReceipt && { ...snapshot.completedReceipt } })
export class FixtureRitualsRepository implements RitualsRepository {
  constructor(private readonly state: RitualsHomeState = 'populated') {}
  async getHomeSnapshot(): Promise<RitualsHomeSnapshot> { if (this.state === 'error') throw new Error('Fixture repository unavailable'); return clone(snapshots[this.state]) }
}
