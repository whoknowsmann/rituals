import type { PublicKey } from '@solana/web3.js'
import type { SoloRitualBundle, SoloRitualModel } from './soloRitualModel'
import type { LifecycleState } from '../../lifecycleMachine'

/** A confirmed stamp belongs to one week, not every later HOLD on this screen. */
export function confirmedStampAdvanced(state: LifecycleState, target: SoloActionTarget | null, bundle: SoloRitualBundle | null | undefined): boolean {
  return state.status === 'confirmed' && target?.kind === 'claim' && Boolean(bundle
    && bundle.ritual.address.toBase58() === target.ritualAddress
    && bundle.ritual.account.currentEventIndex > target.eventIndex)
}

/**
 * A stamp the chain confirmed (its readback was verified) that the screen's
 * own re-read does not show yet: that read came from an RPC node a slot
 * behind. Nothing else re-reads before the week closes, so the screen would
 * offer HOLD again, then show the kept week as closing unstamped and MISSED
 * until the settle key failed and re-read.
 */
export function confirmedStampNotYetRead(state: LifecycleState, target: SoloActionTarget | null, model: Pick<SoloRitualModel, 'eventIndex' | 'claimStatus'> | null): boolean {
  return state.status === 'confirmed' && target?.kind === 'claim' && model !== null && target.eventIndex === model.eventIndex && model.claimStatus === 'none'
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
