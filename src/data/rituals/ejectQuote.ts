import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import type { RitualAccountView, RitualEventAccountView } from './accounts'
import type { RitualRead, RitualRpcAccountInfo } from './ritualsRpc'

/** What ending a ritual early does with its money, from one chain snapshot. */
export type EjectQuote = Readonly<{
  ritual: RitualRead
  /** The creator's token account that receives everything still in the vaults. */
  creatorDestination: PublicKey
  creatorBalance: bigint
  /** Everything in both vaults that comes back now. */
  backToYou: bigint
  /** Stake of lapsed, unstamped weeks this eject settles to the destination (the instruction's expected_forfeit). */
  pendingForfeit: bigint
  /** All stake the destination gets from this ritual: weeks already missed plus pendingForfeit. */
  destinationTotal: bigint
  /** Lapsed weeks nobody opened: the program creates their receipts. */
  missingReceiptCount: number
  /** Chain time of the snapshot (unix seconds). */
  now: bigint
}>

export type EjectAmounts = Pick<EjectQuote, 'backToYou' | 'pendingForfeit' | 'destinationTotal' | 'missingReceiptCount'>

/** Balance of a classic SPL token account, failing closed on anything else. */
export function classicTokenBalance(raw: RitualRpcAccountInfo | null, mint: PublicKey, owner?: PublicKey): bigint {
  if (!raw || !raw.owner.equals(TOKEN_PROGRAM_ID) || raw.data.length !== AccountLayout.span || raw.executable) throw new Error('not a token account')
  const account = AccountLayout.decode(raw.data)
  if (account.state === 0 || !account.mint.equals(mint) || (owner !== undefined && !account.owner.equals(owner))) throw new Error('token account does not match')
  return account.amount
}

/**
 * Mirrors eject_ritual: settled weeks keep their receipts; each week whose
 * deadline has passed settles now (no stamp and no declared skip: its stake
 * goes to the destination); the first week not yet past its deadline ends
 * the walk, and everything still in the vaults comes back.
 */
export function ejectAmounts(account: RitualAccountView, events: readonly (RitualEventAccountView | null)[], now: bigint, stake: bigint, fee: bigint): EjectAmounts {
  if (account.kind !== 'Solo' || account.status !== 'Active' || events.length !== account.schedule.length || stake < account.fundedStakeTotal || fee < 0n) throw new Error('Ritual cannot be ended early')
  let settledForfeit = 0n
  let pendingForfeit = 0n
  let missingReceiptCount = 0
  for (let index = 0; index < account.schedule.length; index += 1) {
    const event = events[index]
    if (index < account.currentEventIndex) {
      if (!event || (event.status !== 'Settled' && event.status !== 'Voided')) throw new Error('A settled week has no receipt')
      settledForfeit += event.forfeitedTotal
      continue
    }
    if (account.schedule[index].deadline >= now) break
    if (!event) missingReceiptCount += 1
    const skipped = account.skipDeclared && account.skipEventIndex === index
    if (!skipped && (!event || event.claimedMembersBitmap === 0)) pendingForfeit += account.perEventAllocation
  }
  const backToYou = stake + fee - pendingForfeit
  if (backToYou < 0n) throw new Error('Ritual vault is short')
  return Object.freeze({ backToYou, pendingForfeit, destinationTotal: settledForfeit + pendingForfeit, missingReceiptCount })
}

/** The rows the creator saw must still be true before anything is signed. */
export function sameEjectMoney(left: EjectAmounts, right: EjectAmounts): boolean {
  return left.backToYou === right.backToYou && left.pendingForfeit === right.pendingForfeit && left.destinationTotal === right.destinationTotal
}
