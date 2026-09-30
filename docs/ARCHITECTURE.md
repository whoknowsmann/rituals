# Architecture

Last reconciled with docs/STATUS.md: 2026-09-30.

## Status

The active product is Rituals, solo first: one person, one promise, a weekly
stake, and a locked destination for a missed week. Group mode ("With friends")
remains as the secondary path. The program
(`2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p`) is **deployed to devnet** with
the solo + Seasons build (slot 504946601). The lifecycle has been exercised as
real transactions with CLI keypairs, including a devnet smoke of a kept week
and a missed week on the solo path. Home, detail, claim, confirmation, and
receipt screens read authoritative chain state. Mobile Wallet Adapter signing
on a physical Seeker is proven for the group Create + stake and Fund + activate
approvals (2026-09-25/26). The solo flow with wallet signatures has **not yet
been run on a device** (the phone test); see `docs/STATUS.md`.

## Active mobile path

```text
Rituals React Native app
    -> Chain-backed read path (home, detail, claim, confirmation, receipts, Season)
        -> AppNavigator
        -> RitualsHomeScreen and lifecycle screens
        -> typed RitualsRepository
            -> authoritative chain reads (known rituals persisted locally;
               fixtures are labeled demo-only)
        -> normalized loading / populated / funding / confirmation / completed / empty / error view
    -> Live transaction path
        -> Solo: create steps -> one approval (create + fund + activate bundled)
        -> Group: RitualRosterScreen (host wallet via MWA) -> RitualFundingLobbyScreen
        -> Lifecycle machine: Fund, Activate, InitializeEvent, Claim, Approve,
           Question, Finalize, DeclareSkip, with pending-action journaling
            -> useRitualClient
                -> deployment and cluster gate (config: `deployed`, devnet)
                -> RitualClient (RPC reads, preparation, submission, confirmation/readback)
                -> useMobileWallet MWA transport
```

Home performs no transaction. In the group path the roster authorizes a host
wallet and the funding lobby holds the Create state machine; its CTA is gated on
`!ready || !create.canSubmit || create.isBusy` rather than being hard-disabled.
`useAuthorization.tsx` holds the devnet MWA identity (`Rituals`) and cached
authorization plumbing. Transient public-RPC read failures (429,
min-context-slot) are retried with bounded backoff; submission is never retried.

Cancel and Close are implemented in the typed client and proven on devnet via
`scripts/smoke-full-lifecycle.ts`, but have no visible screen wiring. The
remaining actions are wired through the lifecycle machine. The suggestion picker
in the template step is deterministic on-device templating, not a model.

Active modules:

- `src/domain/rituals/` — typed draft, invite, lifecycle, money, settlement, threshold contracts;
- `src/data/rituals/` — repository fixtures plus the frozen Anchor IDL, canonical PDA helpers, fail-closed decoders, RPC readers, all-action preparers, submission binding, and authoritative confirmation/readback;
- `src/features/rituals/home/`, `create/`, `claims/`, and `client/` — home, form/roster validation, fee math, route safety, attestations, receipt view models, and the cluster/deployment-gated client hook;
- `src/screens/` — Rituals home, Season, template, create, review, roster, funding lobby, detail, claim, confirmation, receipt, and settings screens;
- `src/navigators/` — Rituals home and settings routes;
- `src/utils/` — connection and wallet authorization plumbing;
- `src/components/cluster/` and `top-bar/` — generic active shell components.

Pure domain code does not fetch, render, sign, submit, or mutate wallets. Token math uses checked atomic units represented by `bigint`.

## On-chain boundary

The Anchor workspace and native ProgramTest coverage are separate from the mobile slice. Approved program work covers protocol initialization, creation, exact HOST/SPLIT funding, activation, cancellation, current-event accounts, claims, friend attestations, questioning, atomic event settlement, terminal cleanup, and the solo and Season instructions below. Settlement conserves each event pool, routes pending/questioned events to full principal refunds, redistributes only clearly unclaimed allocations, preserves future-event principal, and never pays the protocol.

### Solo rituals

- `create_solo_ritual` creates a `RitualKind::Solo` ritual with one member (the creator), an optional `witness`, a `forfeit_destination` token account (same mint as the stake), and an optional `season`. The client bundles create + fund + activate into one wallet approval.
- The forfeit destination is locked at creation. Its token-account owner may not be the creator, and may not be the witness when one is set. The protocol fee recipient is separate and never receives a forfeit.
- `declare_skip(event_index)` is solo-only, creator-only, allowed once per ritual, only for the current event and only before that event's window opens. A declared-skip week settles as Voided (reason `DeclaredSkip`) and refunds that week's slice.
- Solo settlement (`derive_solo_event_settlement_plan`): a confirmed claim returns the week's slice to the creator; no claim sends exactly one week's allocation to the locked forfeit destination; questioned or unresolved claims void the week and refund it.
- With no witness the creator's own claim is the check-in (honor, "Just me"). With a witness, the witness confirms through the existing approve/question instructions.

### Seasons

A Season is an app-wide shared schedule, a PDA at `["season", id]` created by `initialize_season` (authority-signed). It holds the shared schedule, `participant_count: u32`, and `checked_in_count: [u32; 16]` (one counter per week). `participant_count` increases by one when a ritual that references the Season is activated. `checked_in_count[event_index]` increases by one in the instruction that makes a claim Confirmed, and only then. A Season ritual must carry the Season's exact schedule. Stakes and destinations stay per ritual; nothing is pooled. The counters are proven on a local test validator; their first devnet proof is part of the phone test. [PENDING PHONE TEST: devnet Season counter proof]

A voided week (questioned, unanswered, or declared skip) can render incorrectly in the app (receipt shows KEPT, ritual screen offers Settle, week strip shows a check for a skip). This is display-only; see "Known gaps" in `docs/STATUS.md`.

### Custody and settlement details

`funded_fee_total` is historical cumulative activation-fee funding, not an outstanding post-activation liability. Successful activation transfers that exact amount from the fee vault while retaining the value for invariant/readback checks; live fee custody is represented by the actual fee-vault balance. Terminal closure requires coherent Completed or Cancelled state and both actual vault balances to be zero, fails closed on unsolicited dust, and can return token-account rent only to the immutable Ritual creator. Ritual and event receipts remain.

The devnet deployment (program `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p`, solo + Seasons build at slot 504946601) is recorded in `deployment/devnet.json` and
`deployment/devnet-mint.json`; addresses are also listed in the README. Deploy
keypairs live in `.keys/` and are gitignored. Validator ledgers and `target/`
artifacts are local and disposable, and intentionally absent from Git. The reviewed IDL snapshot is frozen under `src/data/rituals/idl/` and has been reproduced byte-for-byte from a clean Anchor build. PDA helpers and strict decoders cover ProtocolConfig, Ritual, RitualEvent, and CompletionClaim. The instruction encoders/builders (including the solo create bundle and `declare-skip`) feed opaque prepared actions; the submitter verifies the wallet-returned signature against the exact prepared message, then returns a runtime-opaque submitted-action handle. Only the issuing client can confirm that handle, and duplicate confirmation calls share one authoritative blockheight-confirmation/readback promise. The compatibility `submitAndConfirm` method composes the same primitives. Handles are process-local and cannot be restored from serialized data; reload recovery requires a future separately validated transaction-identity path. `useRitualClient` composes the stack with RPC and MWA only after an authorized devnet deployment is configured. The current configuration is `deployed` against program `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` on devnet, so the facade opens; `assertSupportedRitualsProgram` still fails closed on any other cluster or program identity.

## Identity and build boundary

Visible app metadata and wallet identity say Rituals. The existing Expo slug, Android package, iOS bundle identifier, and EAS project ID remain unchanged as legacy build identifiers to preserve linkage temporarily. They are not product identity. The wallet URI remains the current private repository URI until a public HTTPS origin exists.

## Release boundary

P0 is devnet and valueless test assets. Metro export proves JavaScript bundling only. Expo Go does not prove native MWA. A release APK, the solo phone test with wallet signatures, a real two-wallet group flow, and independent security review remain release gates. [PENDING PHONE TEST: solo signature / screenshot]

The historical rebuild plan remains in `docs/plans/2026-09-09-rituals-rebuild.md`; Git history is the archive for the retired product implementation.
