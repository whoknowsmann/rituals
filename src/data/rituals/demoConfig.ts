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

/**
 * Where every demo cause sends a missed week on devnet (Jack, 2026-10-11): the
 * faucet's own tSKR account (`https://faucet.whoknowsman.com`, hot wallet
 * FDjXc5KeLbWf9UaMr3y6uUe5ZQDqJYctWuMW7CdnRK8q). A missed stake goes back into
 * the pool that funds the next judge's test tokens instead of sitting in an
 * anonymous account. Before 2026-10-11 each cause had its own devnet-only
 * token account (4adFBqT1…, 7axVhUou…, Bg6uNu6t…; owners' keys in .keys/).
 */
export const DEMO_CAUSE_TOKEN_ACCOUNT = new PublicKey('2JTKtgKaGE6DaGmsNGsRd8oipsw9UQB1Cdu6f9D25HtY')

/** A labelled demo beneficiary. Not a real donation rail; always say "(demo)". */
export const DEMO_CAUSE: DemoCause = Object.freeze({
  label: 'Northside Food Bank (demo)',
  detail: 'Demo beneficiary on devnet. Not a real donation.',
  tokenAccount: DEMO_CAUSE_TOKEN_ACCOUNT,
})

/**
 * The demo causes a ritual can send missed weeks to (Jack, 2026-10-06: the
 * user must visibly choose; one grey line read as if Rituals decided). Each is
 * a labelled devnet stand-in; on devnet they all pay into the faucet (above).
 * The first is the default.
 */
export const DEMO_CAUSES: readonly DemoCause[] = Object.freeze([
  DEMO_CAUSE,
  Object.freeze({
    label: 'City Animal Shelter (demo)',
    detail: 'Demo beneficiary on devnet. Not a real donation.',
    tokenAccount: DEMO_CAUSE_TOKEN_ACCOUNT,
  }),
  Object.freeze({
    label: 'Public Library Fund (demo)',
    detail: 'Demo beneficiary on devnet. Not a real donation.',
    tokenAccount: DEMO_CAUSE_TOKEN_ACCOUNT,
  }),
])

/** The app-wide demo Season ("October Run Club"). */
export const DEMO_SEASON: Readonly<{ title: string; address: PublicKey | null }> = Object.freeze({
  title: 'October Run Club',
  // Deterministic PDA of slug 'october-run-club-d2' (scripts/season-address.ts).
  // Created by scripts/init-demo-season.ts right before a device run; until then
  // home says "No Season running right now." (d1 BjLpWbSx… was used up 2026-10-01.)
  address: new PublicKey('DUiLHsXdck8C5m8Rw5qxBV6KcYSQYxN89C64DrvYNKVx'),
})
