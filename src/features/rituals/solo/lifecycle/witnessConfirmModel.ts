import type { PublicKey } from '@solana/web3.js'
import type { SoloRitualBundle } from './soloRitualModel'
import { shortRosterAddress } from '../../create/roster'

export type WitnessConfirmState = 'pending' | 'confirmed' | 'unavailable'
export type WitnessConfirmModel = Readonly<{
  state: WitnessConfirmState
  authorized: boolean
  name: string
  claimant: PublicKey | null
  requirement: string
  message: string
}>

export function witnessConfirmModel(bundle: SoloRitualBundle, me: PublicKey | null, knownRequirement: string | null): WitnessConfirmModel {
  const account = bundle.ritual.account
  const claimant = account.members[0] ?? null
  const claim = claimant ? bundle.claims.find((entry) => entry.member.equals(claimant))?.account : null
  const authorized = Boolean(me && account.witness && account.witness.equals(me))
  const confirmed = claim?.status === 'Confirmed' || Boolean(bundle.event && (bundle.event.account.confirmedMembersBitmap & 1) !== 0)
  return Object.freeze({
    state: !bundle.event || !claim ? 'unavailable' : confirmed ? 'confirmed' : 'pending',
    authorized,
    name: claimant ? `your friend · ${shortRosterAddress(claimant.toBase58())}` : 'your friend',
    claimant,
    requirement: knownRequirement ?? 'The promise for this week',
    message: authorized ? (confirmed ? 'You confirmed that they showed up.' : 'Confirm whether they showed up.') : 'Only the ritual witness can confirm this check-in.',
  })
}
