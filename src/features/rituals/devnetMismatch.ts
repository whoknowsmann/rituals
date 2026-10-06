/** Only explicit authorize account chains can establish a mismatch. */
export const DEVNET_MISMATCH_TITLE = 'Switch to Devnet'
export const DEVNET_MISMATCH_BODY = 'Nothing was sent. Open Seed Vault Wallet, go to Settings and switch the network to Devnet. Then try again.'

export function shouldWarnDevnetMismatch(status: string, category: string | null | undefined, _walletPackage?: string | null): boolean {
  return status === 'error' && category === 'network-mismatch'
}
