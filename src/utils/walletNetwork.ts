/** The requested MWA chain, shared by authorization and the pre-send check. */
export const CHAIN_IDENTIFIER = 'solana:devnet'

export function walletReportsNetworkMismatch(chains: readonly string[] | undefined): boolean {
  return Boolean(chains?.length && !chains.includes(CHAIN_IDENTIFIER))
}

export class WalletNetworkMismatchError extends Error {
  readonly category = 'network-mismatch'
  constructor() { super('wallet account does not support the requested network'); this.name = 'WalletNetworkMismatchError' }
}

export function assertWalletNetwork(chains: readonly string[] | undefined): void {
  if (walletReportsNetworkMismatch(chains)) throw new WalletNetworkMismatchError()
}
