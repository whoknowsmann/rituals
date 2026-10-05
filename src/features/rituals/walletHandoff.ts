/**
 * Wallet handoff copy (B3, found on the Seeker 2026-09-26).
 *
 * Mobile Wallet Adapter leaves Rituals and opens the wallet app. Without a
 * warning, people read the wallet's screen as part of Rituals, get lost, and
 * swipe Rituals away — which kills the MWA session mid-approval. So: say which
 * app opens before the tap, and say it again while the wallet is up.
 */
import { walletOptionByPackage } from '../../utils/walletChoice'

type Copy = Readonly<{ title: string; body: string; tone: 'neutral' | 'progress' | 'success' | 'warning' }>

export function walletDisplayName(walletPackage: string | null | undefined): string {
  return walletOptionByPackage(walletPackage)?.label ?? 'your wallet'
}

/** One line shown next to the button, before anything is tapped. */
export function walletHandoffNote(walletPackage: string | null | undefined): string {
  // The prepared transaction expires ~60 s after it is built (blockhash).
  return `Opens ${walletDisplayName(walletPackage)}. Approve within a minute.`
}

/** Replaces the generic awaiting-wallet copy; every other state passes through. */
export function withWalletHandoff(copy: Copy, status: string, walletPackage: string | null | undefined): Copy {
  if (status !== 'awaiting-wallet') return copy
  const name = walletDisplayName(walletPackage)
  return Object.freeze({
    title: `Opening ${name}…`,
    body: `Approve in ${name} within a minute. Don't swipe Rituals away.`,
    tone: 'progress',
  })
}
