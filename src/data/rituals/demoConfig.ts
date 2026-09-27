/**
 * Devnet demo fixtures that live on chain but are created by scripts after a
 * deploy (scripts/init-demo-season.ts, scripts/create-demo-cause.ts).
 *
 * `null` means "not created yet": screens must render an honest empty state
 * ("No Season running yet"), never a fake count or placeholder address.
 * Fill these in from the script output after the devnet deploy.
 */
import { PublicKey } from '@solana/web3.js'

export type DemoCause = Readonly<{ label: string; detail: string; tokenAccount: PublicKey | null }>

/** A labelled demo beneficiary. Not a real donation rail; always say "(demo)". */
export const DEMO_CAUSE: DemoCause = Object.freeze({
  label: 'Northside Food Bank (demo)',
  detail: 'Demo beneficiary on devnet. Not a real donation.',
  tokenAccount: null,
})

/** The app-wide demo Season ("October Run Club"). */
export const DEMO_SEASON: Readonly<{ title: string; address: PublicKey | null }> = Object.freeze({
  title: 'October Run Club',
  address: null,
})
