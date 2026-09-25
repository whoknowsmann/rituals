/**
 * Which wallet app answers a Mobile Wallet Adapter session.
 *
 * Stock MWA fires an implicit `solana-wallet:` intent and lets Android pick; on
 * a Seeker that is always the built-in Seed Vault Wallet, so Phantom can never
 * be reached. We pin the association intent to an explicit package instead
 * (see scripts/patch-mwa-wallet-package.mjs for the native side).
 *
 * The list is data, so adding a wallet later (Solflare, Backpack, or a
 * WalletConnect path) is one entry, not a UI rewrite.
 */
export type WalletOption = Readonly<{
  id: string
  label: string
  detail: string
  androidPackage: string
}>

export const WALLET_OPTIONS: readonly WalletOption[] = Object.freeze([
  Object.freeze({
    id: 'seed-vault',
    label: 'Seed Vault Wallet',
    detail: 'Built into Seeker · keys stay in the secure element',
    androidPackage: 'com.solanamobile.wallet',
  }),
  Object.freeze({
    id: 'phantom',
    label: 'Phantom',
    detail: 'Use your Phantom account on this phone',
    androidPackage: 'app.phantom',
  }),
])

export function walletOptionById(id: string): WalletOption | undefined {
  return WALLET_OPTIONS.find((option) => option.id === id)
}

export function walletOptionByPackage(androidPackage: string | undefined | null): WalletOption | undefined {
  if (!androidPackage) return undefined
  return WALLET_OPTIONS.find((option) => option.androidPackage === androidPackage)
}

/**
 * Association config for `transact`. `walletPackage` is our native extension;
 * `undefined` keeps stock behaviour (Android chooses).
 */
export function associationConfigFor(androidPackage: string | undefined | null): { walletPackage?: string } {
  const option = walletOptionByPackage(androidPackage)
  return option ? { walletPackage: option.androidPackage } : {}
}

/**
 * An auth token is issued by one wallet and means nothing to another. Only
 * reuse the cached token when the session goes to the wallet that issued it;
 * otherwise authorize fresh so Phantom is never handed a Seed Vault token.
 */
export function reusableAuthToken<T extends string>(
  cached: Readonly<{ authToken: T; walletPackage?: string | null }> | null | undefined,
  targetPackage: string | undefined | null,
): T | undefined {
  if (!cached) return undefined
  if ((cached.walletPackage ?? null) !== (targetPackage ?? null)) return undefined
  return cached.authToken
}

/** Map a native "no wallet handled the intent" failure to plain copy. */
export function walletNotFound(error: unknown): boolean {
  try {
    if (error && typeof error === 'object') {
      const code = (error as { code?: unknown }).code
      return code === 'ERROR_WALLET_NOT_FOUND'
    }
  } catch { /* hostile error objects */ }
  return false
}
