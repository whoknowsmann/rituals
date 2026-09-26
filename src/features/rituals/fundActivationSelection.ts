import { PublicKey } from '@solana/web3.js'
import type { RitualAccountView } from '../../data/rituals/accounts'

type FundActivationSelectionAccount = Pick<RitualAccountView, 'status' | 'members' | 'fundedMembersBitmap' | 'fundedMemberCount' | 'schedule'>

const popcount = (value: number): number => {
  let count = 0
  for (let bits = value; bits !== 0; bits &= bits - 1) count += 1
  return count
}

/**
 * Decide whether the current member funding can safely be bundled with activation.
 * The account and clock are read before preparation; vault balances are checked by
 * the caller because they are separate token accounts.
 */
export function canBundleFundAndActivate(account: FundActivationSelectionAccount, member: PublicKey, unixTimestamp: number): boolean {
  if (account.status !== 'Funding' || !(member instanceof PublicKey) || !Number.isSafeInteger(unixTimestamp)) return false
  const memberCount = account.members.length
  if (memberCount < 2 || memberCount > 6 || account.schedule.length === 0) return false
  const mask = (1 << memberCount) - 1
  const bitmap = account.fundedMembersBitmap
  if (!Number.isInteger(bitmap) || bitmap < 0 || bitmap > 255 || (bitmap & ~mask) !== 0 || account.fundedMemberCount !== popcount(bitmap)) return false
  const index = account.members.findIndex((candidate) => candidate.equals(member))
  if (index < 0) return false
  const bit = 1 << index
  if ((bitmap & bit) !== 0 || (bitmap | bit) !== mask) return false
  const opens = account.schedule[0]?.opens
  return typeof opens === 'bigint' && BigInt(unixTimestamp) < opens
}
