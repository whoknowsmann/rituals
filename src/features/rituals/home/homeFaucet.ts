import { parseTokenAmount } from '../create/decimal'
import type { FaucetResult } from '../faucet/devnetFaucet'
import { DEFAULT_STAKE_TOTAL } from '../solo/create/schedule'

const defaultStakeAtomic = parseTokenAmount(DEFAULT_STAKE_TOTAL)

/** One extra Home state; unknown balance and a sent request never hold up create. */
export function homePrimaryAction(input: Readonly<{
  connected: boolean
  hasActiveRituals: boolean
  testBalance: bigint | null
  faucetResult: FaucetResult | null
}>): 'start' | 'faucet' {
  if (!input.connected || input.hasActiveRituals || input.testBalance === null || input.faucetResult?.kind === 'sent') return 'start'
  return input.testBalance >= 0n && input.testBalance < defaultStakeAtomic ? 'faucet' : 'start'
}
