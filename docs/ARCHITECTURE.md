# Architecture

## Status

The active product is Rituals. The visible home is a fixture-backed, approved Rituals slice. Activation is implemented and approved. Cancellation is implemented but in review, not approved or complete. The remaining on-chain claim, confirmation, settlement, and real-wallet flows are not presented as complete.

## Active mobile path

```text
Rituals React Native app
    -> AppNavigator (RitualsHome, Settings)
    -> RitualsHomeScreen
    -> typed RitualsRepository
        -> deterministic FixtureRitualsRepository
    -> normalized loading / populated / funding / confirmation / completed / empty / error view
```

The home screen intentionally performs no real transaction. It displays explicit fixture/devnet/no-real-value disclosures. `useAuthorization.tsx` contains the Solana devnet Mobile Wallet Adapter identity (`Rituals`) and cached authorization plumbing.

Active modules:

- `src/domain/rituals/` — typed draft, invite, lifecycle, money, settlement, threshold contracts;
- `src/data/rituals/` — repository interface and deterministic fixture implementation;
- `src/features/rituals/home/` — home view model and safe error handling;
- `src/screens/RitualsHomeScreen.tsx` and `SettingsScreen.tsx`;
- `src/navigators/` — Rituals home and settings routes;
- `src/utils/` — connection and wallet authorization plumbing;
- `src/components/cluster/` and `top-bar/` — generic active shell components.

Pure domain code does not fetch, render, sign, submit, or mutate wallets. Token math uses checked atomic units represented by `bigint`.

## On-chain boundary

The Anchor workspace and native ProgramTest coverage are separate from the mobile slice. Existing approved program work covers protocol initialization, ritual creation, exact HOST/SPLIT funding, activation, and safe pre-activation cancellation with tracked refunds. Claims, approvals, complete settlement, devnet deployment, and native MWA signing are not release-proven here. Do not treat local placeholder program IDs, generated IDLs, or fixtures as production identities.

## Identity and build boundary

Visible app metadata and wallet identity say Rituals. The existing Expo slug, Android package, iOS bundle identifier, and EAS project ID remain unchanged as legacy build identifiers to preserve linkage temporarily. They are not product identity. The wallet URI remains the current private repository URI until a public HTTPS origin exists.

## Release boundary

P0 is devnet and valueless test assets. Metro export proves JavaScript bundling only. Expo Go does not prove native MWA. A standalone Seeker APK, real two-wallet flow, and independent security review remain release gates.

The historical rebuild plan remains in `docs/plans/2026-09-09-rituals-rebuild.md`; Git history is the archive for the retired product implementation.
