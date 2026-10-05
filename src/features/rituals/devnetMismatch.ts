import { needsDevnetSwitchHint } from '../../utils/walletChoice'

/**
 * Seed Vault Wallet signs on whichever network its own settings name and shows
 * "Network mismatch" when it is on Mainnet. The app cannot see that reason:
 * the request just comes back declined or failed. So the hint is a one-time
 * popup after a failed wallet step with Seed Vault, not a note that sits on
 * every screen and gets ignored (Jack, 2026-10-05). Nothing is sent either way.
 */
export const DEVNET_MISMATCH_TITLE = 'Nothing was sent'
export const DEVNET_MISMATCH_BODY = 'If Seed Vault Wallet said "Network mismatch", open it, go to Settings and switch the network to Devnet. Then try again.'

export function shouldWarnDevnetMismatch(status: string, category: string | null | undefined, walletPackage: string | null | undefined): boolean {
  if (status !== 'error') return false
  if (!needsDevnetSwitchHint(walletPackage)) return false
  // Failures before the wallet was ever opened (no connection, bad draft) have nothing to do with its network.
  return category !== 'preparation' && category !== 'confirmation'
}
