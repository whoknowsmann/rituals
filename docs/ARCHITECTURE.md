# Architecture

## Status

The active product is Rituals. The program is **deployed to devnet** and the full
lifecycle has been exercised as real transactions with CLI keypairs. The Create
path is wired end to end from the funding-lobby screen; the remaining visible
screens still read deterministic fixtures. Mobile Wallet Adapter signing from a
physical device is **not yet proven** — see `docs/STATUS.md`.

## Active mobile path

```text
Rituals React Native app
    -> Fixture-backed read path (home, detail, claim, confirmation, receipts)
        -> AppNavigator
        -> RitualsHomeScreen and lifecycle preview screens
        -> typed RitualsRepository
            -> deterministic FixtureRitualsRepository
        -> normalized loading / populated / funding / confirmation / completed / empty / error view
    -> Live transaction path (Create only, today)
        -> RitualRosterScreen        -> authorizes a host wallet via MWA
        -> RitualFundingLobbyScreen  -> submits a real Create transaction
            -> useRitualClient
                -> deployment and cluster gate (config: `deployed`, devnet)
                -> RitualClient (RPC reads, preparation, submission, confirmation/readback)
                -> useMobileWallet MWA transport
```

Home and the lifecycle preview screens still perform no transaction. The roster
authorizes a host wallet; the funding lobby holds the Create state machine and its
CTA is gated on `!ready || !create.canSubmit || create.isBusy` rather than being
hard-disabled. `useAuthorization.tsx` holds the devnet MWA identity (`Rituals`) and
cached authorization plumbing.

Fund, Activate, Claim, Approve, Question, Finalize, Cancel, and Close are
implemented and proven in the typed client and on devnet via
`scripts/smoke-full-lifecycle.ts`, but have no visible screen wiring yet.

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

The devnet deployment is recorded in `deployment/devnet.json` and
`deployment/devnet-mint.json`; addresses are also listed in the README. Deploy
keypairs live in `.keys/` and are gitignored. Validator ledgers and `target/`
artifacts are local and disposable, and intentionally absent from Git. The reviewed IDL snapshot is frozen under `src/data/rituals/idl/` and has been reproduced byte-for-byte from a clean Anchor build. PDA helpers and strict decoders cover ProtocolConfig, Ritual, RitualEvent, and CompletionClaim. All eleven instruction encoders/builders feed opaque prepared actions; the submitter verifies the wallet-returned signature against the exact prepared message, then returns a runtime-opaque submitted-action handle. Only the issuing client can confirm that handle, and duplicate confirmation calls share one authoritative blockheight-confirmation/readback promise. The compatibility `submitAndConfirm` method composes the same primitives. Handles are process-local and cannot be restored from serialized data; reload recovery requires a future separately validated transaction-identity path. `useRitualClient` composes the stack with RPC and MWA only after an authorized devnet deployment is configured. The current configuration is `deployed` against program `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` on devnet, so the facade opens; `assertSupportedRitualsProgram` still fails closed on any other cluster or program identity.

## Identity and build boundary

Visible app metadata and wallet identity say Rituals. The existing Expo slug, Android package, iOS bundle identifier, and EAS project ID remain unchanged as legacy build identifiers to preserve linkage temporarily. They are not product identity. The wallet URI remains the current private repository URI until a public HTTPS origin exists.

## Release boundary

P0 is devnet and valueless test assets. Metro export proves JavaScript bundling only. Expo Go does not prove native MWA. A standalone Seeker APK, real two-wallet flow, and independent security review remain release gates.

The historical rebuild plan remains in `docs/plans/2026-09-09-rituals-rebuild.md`; Git history is the archive for the retired product implementation.
