import type {
  Cluster,
  EventIndex,
  ConfirmationMode,
  RitualId,
  RitualStatus,
  TokenAtomicUnits,
} from '../../domain/rituals/types'

export type RitualsHomeState =
  | 'populated'
  | 'funding'
  | 'pending-confirmation'
  | 'completed'
  | 'empty'
  | 'error'

export interface HomeRitualSnapshot {
  readonly id: RitualId
  readonly title: string
  readonly requirement: string
  readonly members: { readonly funded: number; readonly total: number }
  readonly stakeAtomicUnits: TokenAtomicUnits
  readonly tokenDecimals: number
  readonly tokenSymbol: string
  readonly nextEvent: string
  readonly confirmationMode: ConfirmationMode
  readonly status: RitualStatus
}

export interface RitualsHomeSnapshot {
  readonly state: RitualsHomeState
  readonly mode: 'fixture'
  readonly source: Cluster
  readonly disclosure: 'NO REAL VALUE'
  readonly activeRitual?: HomeRitualSnapshot
  readonly activeRituals?: readonly HomeRitualSnapshot[]
  readonly confirmations?: { readonly count: number }
  readonly funding?: { readonly funded: number; readonly total: number }
  readonly completedReceipt?: {
    readonly ritualId: RitualId
    readonly eventIndex: EventIndex
    readonly title: string
    readonly amountAtomicUnits: TokenAtomicUnits
    readonly tokenDecimals: number
    readonly tokenSymbol: string
  }
  readonly errorMessage?: string
}

export interface RitualsRepository {
  getHomeSnapshot(): Promise<RitualsHomeSnapshot>
}
