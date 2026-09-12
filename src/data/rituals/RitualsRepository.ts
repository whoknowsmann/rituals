import type { Cluster } from '../../domain/rituals/types'

export type RitualsHomeState = 'populated' | 'funding' | 'pending-confirmation' | 'completed' | 'empty' | 'error'

export interface HomeRitualSnapshot {
  readonly id: string
  readonly title: string
  readonly requirement: string
  readonly members: { readonly funded: number; readonly total: number }
  readonly stakeAtomicUnits: bigint
  readonly tokenDecimals: number
  readonly tokenSymbol: string
  readonly nextEvent: string
  readonly confirmationMode: string
}

export interface RitualsHomeSnapshot {
  readonly state: RitualsHomeState
  readonly mode: 'fixture'
  readonly source: Cluster
  readonly disclosure: 'NO REAL VALUE'
  readonly activeRitual?: HomeRitualSnapshot
  readonly confirmations?: { readonly count: number }
  readonly funding?: { readonly funded: number; readonly total: number }
  readonly completedReceipt?: { readonly title: string; readonly amountAtomicUnits: bigint; readonly tokenDecimals: number; readonly tokenSymbol: string }
  readonly errorMessage?: string
}

export interface RitualsRepository {
  getHomeSnapshot(): Promise<RitualsHomeSnapshot>
}
