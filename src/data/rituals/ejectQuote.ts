import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import type { RitualAccountView, RitualEventAccountView } from './accounts'
import type { RitualRead, RitualRpcAccountInfo } from './ritualsRpc'

export type EjectQuote = Readonly<{
  ritual: RitualRead
  creatorDestination: PublicKey
  creatorBalance: bigint
  backToYou: bigint
  pendingForfeit: bigint
  totalForfeited: bigint
  missingReceiptCount: number
}>

export function classicTokenBalance(raw: RitualRpcAccountInfo | null, mint: PublicKey, owner?: PublicKey): bigint {
  if (!raw || !raw.owner.equals(TOKEN_PROGRAM_ID) || raw.data.length !== AccountLayout.span || raw.executable) throw new Error('Invalid token account')
  const a = AccountLayout.decode(raw.data)
  if (a.state === 0 || !a.mint.equals(mint) || (owner && !a.owner.equals(owner))) throw new Error('Invalid token destination')
  return a.amount
}

/** Mirrors derive_solo_event_settlement_plan: skip and any claim return to creator. */
export function ejectAmounts(a: RitualAccountView, events: readonly (RitualEventAccountView | null)[], now: bigint, stake: bigint, fee: bigint) {
  if (a.kind !== 'Solo' || a.status !== 'Active' || events.length !== a.schedule.length || stake < a.fundedStakeTotal || fee < 0n) throw new Error('Ritual cannot be ended')
  let pendingForfeit = 0n
  let totalForfeited = 0n
  let missingReceiptCount = 0
  a.schedule.forEach((window, index) => {
    const event = events[index]
    if (index < a.currentEventIndex) {
      if (!event || !['Settled', 'Voided'].includes(event.status)) throw new Error('Missing settled receipt')
      totalForfeited += event.forfeitedTotal
    } else if (window.deadline < now) {
      if (!event) missingReceiptCount += 1
      if ((!a.skipDeclared || a.skipEventIndex !== index) && (!event || event.claimedMembersBitmap === 0)) pendingForfeit += a.perEventAllocation
    }
  })
  const backToYou = stake + fee - pendingForfeit
  if (backToYou < 0n || backToYou > 0xffffffffffffffffn) throw new Error('Invalid refund')
  return Object.freeze({ backToYou, pendingForfeit, totalForfeited: totalForfeited + pendingForfeit, missingReceiptCount })
}
