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
  // Created 2026-09-27 by scripts/create-demo-cause.ts: tSKR token account owned
  // by the devnet-only key AZStJSV45Awq4VRzmkoTUpQQvrTVmfDW95p2whpDkv2R.
  tokenAccount: new PublicKey('4adFBqT1x7AyBFF4bd8qVgeSjPbqhnaJVB4x5muMzbT5'),
})

/**
 * The demo causes a ritual can send missed weeks to (Jack, 2026-10-06: the
 * user must visibly choose; one grey line read as if Rituals decided). Each is
 * a labelled devnet stand-in: a token account owned by a devnet-only key. The
 * first is the default. Created 2026-10-06 with `spl-token create-account`
 * (fee payer: the devnet deployer); owners' keys in .keys/ (gitignored).
 */
export const DEMO_CAUSES: readonly DemoCause[] = Object.freeze([
  DEMO_CAUSE,
  Object.freeze({
    label: 'City Animal Shelter (demo)',
    detail: 'Demo beneficiary on devnet. Not a real donation.',
    // owner 3DEPb3tHzFfmGb2MRXyQ4q4rTe1geNiMGvYYeg6mwcFe (.keys/rituals-demo-cause-shelter-owner.json)
    tokenAccount: new PublicKey('7axVhUouRPmMkUDELbSakXEAQitRMkZ1xLwXPaJCNkzQ'),
  }),
  Object.freeze({
    label: 'Public Library Fund (demo)',
    detail: 'Demo beneficiary on devnet. Not a real donation.',
    // owner 2giunx4KyDbLK9VCfzPKyPBY8h7Hu4zVLDJvpoWPwXQu (.keys/rituals-demo-cause-library-owner.json)
    tokenAccount: new PublicKey('Bg6uNu6tzKUxUgNWB2tjiQU9K9zB8ycunECiP1MG3cZ5'),
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
