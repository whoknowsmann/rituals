# Architecture

## Status

The active product is Rituals. Approved fixture-backed mobile slices cover home, template/create/review, connected host/member roster, pre-funding lobby, detail, claim, confirmation, and settled/voided receipt previews. The local onchain program is approved through terminal zero-balance vault closure. Typed transaction plumbing exists below the UI, but real-wallet and public-cluster flows are not presented as complete.

## Active mobile path

```text
Rituals React Native app
    -> Visible fixture-backed path
        -> AppNavigator (home, create/review/roster/funding preview, detail, claim, confirmation, receipt, settings)
        -> RitualsHomeScreen and lifecycle preview screens
        -> typed RitualsRepository
            -> deterministic FixtureRitualsRepository
        -> normalized loading / populated / funding / confirmation / completed / empty / error view
    -> Separate transaction plumbing (not invoked by current Ritual write screens)
        -> useRitualClient
            -> deployment and cluster gate
            -> RitualClient (RPC reads, preparation, submission, confirmation/readback)
            -> useMobileWallet MWA transport
```

The home and lifecycle preview screens intentionally perform no real transaction. The roster can authorize a host wallet, but it only builds a local funding-lobby route. The lobby CTA is disabled even if the client becomes ready until create-transaction UX is wired. `useAuthorization.tsx` contains the Solana devnet Mobile Wallet Adapter identity (`Rituals`) and cached authorization plumbing.

Active modules:

- `src/domain/rituals/` — typed draft, invite, lifecycle, money, settlement, threshold contracts;
- `src/data/rituals/` — repository fixtures plus the frozen Anchor IDL, canonical PDA helpers, fail-closed decoders, RPC readers, all-action preparers, submission binding, and authoritative confirmation/readback;
- `src/features/rituals/home/`, `create/`, `claims/`, and `client/` — home, form/roster validation, fee math, route safety, attestations, receipt view models, and the cluster/deployment-gated client hook;
- `src/screens/` — Rituals home, template, create, review, roster, funding-lobby preview, detail, claim, confirmation, receipt, and settings screens;
- `src/navigators/` — Rituals home and settings routes;
- `src/utils/` — connection and wallet authorization plumbing;
- `src/components/cluster/` and `top-bar/` — generic active shell components.

Pure domain code does not fetch, render, sign, submit, or mutate wallets. Token math uses checked atomic units represented by `bigint`.

## On-chain boundary

The Anchor workspace and native ProgramTest coverage are separate from the mobile slice. Approved program work covers protocol initialization, creation, exact HOST/SPLIT funding, activation, cancellation, current-event accounts, claims, friend attestations, questioning, atomic event settlement, and terminal cleanup. Settlement conserves each event pool, routes pending/questioned events to full principal refunds, redistributes only clearly unclaimed allocations, preserves future-event principal, and never pays the protocol.

`funded_fee_total` is historical cumulative activation-fee funding, not an outstanding post-activation liability. Successful activation transfers that exact amount from the fee vault while retaining the value for invariant/readback checks; live fee custody is represented by the actual fee-vault balance. Terminal closure requires coherent Completed or Cancelled state and both actual vault balances to be zero, fails closed on unsolicited dust, and can return token-account rent only to the immutable Ritual creator. Ritual and event receipts remain.

Generated deployment keypairs, validator ledgers, and `target/` artifacts are local and disposable. They are intentionally absent from Git. The reviewed IDL snapshot is frozen under `src/data/rituals/idl/` and has been reproduced byte-for-byte from a clean Anchor build. PDA helpers and strict decoders cover ProtocolConfig, Ritual, RitualEvent, and CompletionClaim. All eleven instruction encoders/builders feed opaque prepared actions; the submitter verifies the wallet-returned signature against the exact prepared message, confirms by blockheight, and reads the expected state back. `useRitualClient` composes that stack with RPC and MWA only after an authorized devnet deployment is configured. The current configuration is intentionally `not-deployed`.

## Identity and build boundary

Visible app metadata and wallet identity say Rituals. The existing Expo slug, Android package, iOS bundle identifier, and EAS project ID remain unchanged as legacy build identifiers to preserve linkage temporarily. They are not product identity. The wallet URI remains the current private repository URI until a public HTTPS origin exists.

## Release boundary

P0 is devnet and valueless test assets. Metro export proves JavaScript bundling only. Expo Go does not prove native MWA. A standalone Seeker APK, real two-wallet flow, and independent security review remain release gates.

The historical rebuild plan remains in `docs/plans/2026-09-09-rituals-rebuild.md`; Git history is the archive for the retired product implementation.
