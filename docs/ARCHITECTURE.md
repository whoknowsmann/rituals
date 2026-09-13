# Architecture

## Status

The active product is Rituals. Approved fixture-backed mobile slices cover home, template/create/review, detail, claim, confirmation, and settled/voided receipt previews. The onchain program is approved through activation, cancellation, current events, signed claims, threshold approvals, safe questioning, and conservation-safe settlement. Terminal vault closure and real-wallet flows are not presented as complete.

## Active mobile path

```text
Rituals React Native app
    -> AppNavigator (home, create/review, detail, claim, confirmation, receipt, settings)
    -> RitualsHomeScreen
    -> typed RitualsRepository
        -> deterministic FixtureRitualsRepository
    -> normalized loading / populated / funding / confirmation / completed / empty / error view
```

The home screen intentionally performs no real transaction. It displays explicit fixture/devnet/no-real-value disclosures. `useAuthorization.tsx` contains the Solana devnet Mobile Wallet Adapter identity (`Rituals`) and cached authorization plumbing.

Active modules:

- `src/domain/rituals/` — typed draft, invite, lifecycle, money, settlement, threshold contracts;
- `src/data/rituals/` — repository interface and deterministic fixture implementation;
- `src/features/rituals/home/`, `create/`, and `claims/` — home, form validation, fee math, route safety, attestations, and receipt view models;
- `src/screens/` — Rituals home, template, create, review, detail, claim, confirmation, receipt, and settings screens;
- `src/navigators/` — Rituals home and settings routes;
- `src/utils/` — connection and wallet authorization plumbing;
- `src/components/cluster/` and `top-bar/` — generic active shell components.

Pure domain code does not fetch, render, sign, submit, or mutate wallets. Token math uses checked atomic units represented by `bigint`.

## On-chain boundary

The Anchor workspace and native ProgramTest coverage are separate from the mobile slice. Approved program work covers protocol initialization, creation, exact HOST/SPLIT funding, activation, cancellation, current-event accounts, claims, friend attestations, questioning, and atomic event settlement. Settlement conserves each event pool, routes pending/questioned events to full principal refunds, redistributes only clearly unclaimed allocations, preserves future-event principal, and never pays the protocol. Terminal zero-balance vault closure, devnet deployment, and native MWA signing are not release-proven here.

## Identity and build boundary

Visible app metadata and wallet identity say Rituals. The existing Expo slug, Android package, iOS bundle identifier, and EAS project ID remain unchanged as legacy build identifiers to preserve linkage temporarily. They are not product identity. The wallet URI remains the current private repository URI until a public HTTPS origin exists.

## Release boundary

P0 is devnet and valueless test assets. Metro export proves JavaScript bundling only. Expo Go does not prove native MWA. A standalone Seeker APK, real two-wallet flow, and independent security review remain release gates.

The historical rebuild plan remains in `docs/plans/2026-09-09-rituals-rebuild.md`; Git history is the archive for the retired product implementation.
