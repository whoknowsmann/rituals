import type { PublicKey } from '@solana/web3.js'
import type { SoloRitualBundle } from './soloRitualModel'
import { labelSoloDestination } from './soloRitualModel'

export type SoloReceiptState = 'pending' | 'kept' | 'missed' | 'skipped'
export type SoloReceiptModel = Readonly<{
  state: SoloReceiptState
  amount: bigint
  destinationLabel: string | null
  copy: string
  stampKind: 'kept' | 'missed' | null
}>

export function soloReceiptModel(bundle: SoloRitualBundle, me: PublicKey | null, destinationOwner: PublicKey | null = null): SoloReceiptModel {
  const event = bundle.event
  if (!event || (event.account.status !== 'Settled' && event.account.status !== 'Voided')) return Object.freeze({ state: 'pending', amount: bundle.ritual.account.perEventAllocation, destinationLabel: null, copy: 'This week has not closed yet.', stampKind: null })
  if (event.account.status === 'Voided' && event.account.voidReason === 'DeclaredSkip') return Object.freeze({ state: 'skipped', amount: bundle.ritual.account.perEventAllocation, destinationLabel: null, copy: 'skipped', stampKind: null })
  const claim = me ? bundle.claims.find((entry) => entry.member.equals(me))?.account : null
  const missed = event.account.status === 'Settled' && event.account.forfeitedTotal > 0n && claim?.status !== 'Confirmed'
  if (missed) {
    const destinationLabel = labelSoloDestination(bundle.ritual.account.forfeitDestination, undefined, destinationOwner)
    return Object.freeze({ state: 'missed', amount: bundle.ritual.account.perEventAllocation, destinationLabel, copy: `went to ${destinationLabel}`, stampKind: 'missed' })
  }
  return Object.freeze({ state: 'kept', amount: bundle.ritual.account.perEventAllocation, destinationLabel: null, copy: 'back to you', stampKind: 'kept' })
}
