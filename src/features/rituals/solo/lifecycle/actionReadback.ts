import type { PublicKey } from '@solana/web3.js'
import type { SoloRitualBundle } from './soloRitualModel'
import type { LifecycleState } from '../../lifecycleMachine'

/** A confirmed stamp belongs to one week, not every later HOLD on this screen. */
export function confirmedStampAdvanced(state: LifecycleState, target: SoloActionTarget | null, bundle: SoloRitualBundle | null | undefined): boolean {
  return state.status === 'confirmed' && target?.kind === 'claim' && Boolean(bundle
    && bundle.ritual.address.toBase58() === target.ritualAddress
    && bundle.ritual.account.currentEventIndex > target.eventIndex)
}

export type SoloActionTarget = Readonly<{
  kind: 'claim' | 'skip' | 'initialize-event' | 'finalize'
  ritualAddress: string
  eventIndex: number
  actor: PublicKey
}>

/** Evidence for the exact action attempted, not just any change in screen state. */
export function soloActionLanded(bundle: SoloRitualBundle | null | undefined, target: SoloActionTarget | null): boolean {
  if (!bundle || !target || bundle.ritual.address.toBase58() !== target.ritualAddress) return false
  const account = bundle.ritual.account
  if (account.kind !== 'Solo' || !account.creator.equals(target.actor)) return false
  if (target.kind === 'skip') return account.skipDeclared && account.skipEventIndex === target.eventIndex
  const indexed = [bundle, ...(bundle.history ?? [])].find((read) => read.event?.account.eventIndex === target.eventIndex)
  if (target.kind === 'claim') return Boolean(indexed?.claims.some((claim) => claim.member.equals(target.actor) && claim.account?.status === 'Confirmed'))
  if (target.kind === 'initialize-event') return Boolean(indexed?.event) || account.currentEventIndex > target.eventIndex
  return account.currentEventIndex > target.eventIndex && account.settledEventCount > target.eventIndex
}
