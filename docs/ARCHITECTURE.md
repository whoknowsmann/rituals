# Architecture

## Status

The active product is Rituals. Approved fixture-backed mobile slices cover home, template/create/review, detail, claim, confirmation, and settled/voided receipt previews. The local onchain program is approved through terminal zero-balance vault closure. Real-wallet and public-cluster flows are not presented as complete.

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
- `src/data/rituals/` — repository interface, deterministic fixture implementation, frozen Anchor IDL, canonical PDA helpers, and approved fail-closed account decoders;
- `src/features/rituals/home/`, `create/`, and `claims/` — home, form validation, fee math, route safety, attestations, and receipt view models;
- `src/screens/` — Rituals home, template, create, review, detail, claim, confirmation, receipt, and settings screens;
- `src/navigators/` — Rituals home and settings routes;
- `src/utils/` — connection and wallet authorization plumbing;
- `src/components/cluster/` and `top-bar/` — generic active shell components.

Pure domain code does not fetch, render, sign, submit, or mutate wallets. Token math uses checked atomic units represented by `bigint`.

## On-chain boundary

The Anchor workspace and native ProgramTest coverage are separate from the mobile slice. Approved program work covers protocol initialization, creation, exact HOST/SPLIT funding, activation, cancellation, current-event accounts, claims, friend attestations, questioning, atomic event settlement, and terminal cleanup. Settlement conserves each event pool, routes pending/questioned events to full principal refunds, redistributes only clearly unclaimed allocations, preserves future-event principal, and never pays the protocol.

`funded_fee_total` is historical cumulative activation-fee funding, not an outstanding post-activation liability. Successful activation transfers that exact amount from the fee vault while retaining the value for invariant/readback checks; live fee custody is represented by the actual fee-vault balance. Terminal closure requires coherent Completed or Cancelled state and both actual vault balances to be zero, fails closed on unsolicited dust, and can return token-account rent only to the immutable Ritual creator. Ritual and event receipts remain.

Generated deployment keypairs, validator ledgers, and `target/` artifacts are local and disposable. They are intentionally absent from Git. The reviewed IDL snapshot is frozen under `src/data/rituals/idl/` and has been reproduced byte-for-byte from a clean Anchor build. PDA helpers and strict decoders cover ProtocolConfig, Ritual, RitualEvent, and CompletionClaim. All eleven instruction-data encoders and canonical account-meta builders are approved against Rust vectors; RPC reads and MWA writes remain separate unfinished layers.

## Identity and build boundary

Visible app metadata and wallet identity say Rituals. The existing Expo slug, Android package, iOS bundle identifier, and EAS project ID remain unchanged as legacy build identifiers to preserve linkage temporarily. They are not product identity. The wallet URI remains the current private repository URI until a public HTTPS origin exists.

## Release boundary

P0 is devnet and valueless test assets. Metro export proves JavaScript bundling only. Expo Go does not prove native MWA. A standalone Seeker APK, real two-wallet flow, and independent security review remain release gates.

The historical rebuild plan remains in `docs/plans/2026-09-09-rituals-rebuild.md`; Git history is the archive for the retired product implementation.
