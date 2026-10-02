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
  // Created 2026-09-27 by scripts/create-demo-cause.ts: TEST token account owned
  // by the devnet-only key AZStJSV45Awq4VRzmkoTUpQQvrTVmfDW95p2whpDkv2R.
  tokenAccount: new PublicKey('4adFBqT1x7AyBFF4bd8qVgeSjPbqhnaJVB4x5muMzbT5'),
})

/** The app-wide demo Season ("October Run Club"). */
export const DEMO_SEASON: Readonly<{ title: string; address: PublicKey | null }> = Object.freeze({
  title: 'October Run Club',
  // Deterministic PDA of slug 'october-run-club-d2' (scripts/season-address.ts).
  // Created by scripts/init-demo-season.ts right before a device run; until then
  // home says "No Season running right now." (d1 BjLpWbSx… was used up 2026-10-01.)
  address: new PublicKey('DUiLHsXdck8C5m8Rw5qxBV6KcYSQYxN89C64DrvYNKVx'),
})
