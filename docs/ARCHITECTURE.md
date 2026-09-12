# Architecture

## Status boundary

This file distinguishes **current implemented code** from the **approved Rituals target**. Pure Rituals domain contracts, the production ProtocolConfig initializer, Task12A classic SPL mint validation, and exact HOST- and SPLIT-mode member funding are implemented. Activation, cancellation, mobile UI, and the remaining Rituals instructions remain target work.

## Current implementation

```text
harmless normalized/serialized transaction input
    -> pure TypeScript decoder and analyzer
    -> versioned Preflight result
    -> tested presentation view model
    -> React Native Preflight screen
```

Current code includes:

- `src/domain/preflight/` — CLEAR/HOLD/ABORT analysis and fixtures;
- `src/domain/solana/decodeTransaction.ts` — legacy/v0 decoding;
- `src/domain/preflight/reviewIdentity.ts` — SHA-256 reviewed-byte identity;
- `src/components/preflight/` — presentation model;
- `src/screens/PreflightScreen.tsx` — active screen;
- `src/utils/useAuthorization.tsx` and `useMobileWallet.tsx` — devnet MWA plumbing;
- EAS/Android and CI configuration.

A signed development APK was previously installed and launched on Seeker, but the Rituals flow does not exist in it.

## Approved Rituals target

```text
Rituals React Native screens
    -> pure draft / threshold / fee / settlement contracts
    -> typed Rituals repository interface
        -> deterministic fixture repository
        -> Solana program repository
            -> prepared action + plain-language summary
            -> MWA signing
            -> Solana RPC
            -> Rituals program
                -> immutable ritual PDA
                -> member/event/claim state
                -> program-controlled SPL vault
                -> separate activation-fee destination
    -> confirmed account readback
    -> normalized UI state
```

P0 has no mandatory backend. Program accounts are authoritative. A versioned invitation carries bounded human-readable metadata, and its canonical rule digest must match the ritual account before the app presents it as verified.

### Approved future doors

- Solo rituals are a P1 candidate, not P0. Keep the vocabulary and adapters able to represent self-attestation, but require a precommitted, non-platform, policy/custody-safe destination for missed tranches before supporting valuable solo funds.
- Public/app-wide challenge templates are exploratory P2 only. Preserve extensibility through schema versioning and narrow adapters; do not add P0 discovery, feeds, leaderboards, stranger betting, sponsor pools, or speculative public-market fields.

## Target mobile modules

```text
src/domain/rituals/
    types.ts
    threshold.ts
    money.ts
    settlement.ts
    lifecycle.ts
    draft.ts
    invite.ts

src/data/rituals/
    RitualsRepository.ts
    FixtureRitualsRepository.ts
    SolanaRitualsRepository.ts
    programIds.ts
    pdas.ts
    accounts.ts
    instructions.ts
    idl/rituals.json

src/features/rituals/
    create/
    claims/
    invites/
    reminders/

src/screens/
    RitualsHomeScreen.tsx
    TemplatePickerScreen.tsx
    CreateRitualScreen.tsx
    ReviewRitualScreen.tsx
    JoinRitualScreen.tsx
    FundingScreen.tsx
    RitualDetailScreen.tsx
    ClaimCompletionScreen.tsx
    ConfirmationInboxScreen.tsx
    SettlementReceiptScreen.tsx
```

Pure domain code performs no fetching, rendering, signing, submission, or wallet mutation. Money uses token atomic units represented by `bigint`.

## Validated compatibility boundary

The quarantined `spikes/001-anchor-mwa-compatibility/` spike is **VALIDATED** for the feasibility question, not for Rituals production behavior. Anchor `0.31.1` built and ran a minimal local-validator instruction with account readback after pinning Rust-1.84-compatible transitive crates. The spike also verified that the existing Expo bundle can carry the web3.js client path.

Production mobile should use a thin typed `@solana/web3.js` client generated or maintained from a frozen Anchor IDL. Do not add `@coral-xyz/anchor` to the mobile app based on this spike. Native MWA signing for Rituals was not exercised and remains unvalidated; the spike only tested the existing Expo bundle and web3.js instruction path.

## Onchain target

An Anchor `0.31.1` program is the validated preferred implementation for the onchain target. Production SBF compilation and native ProgramTest are deliberately split into separate Cargo workspaces and lockfiles: the root lock is Rust-1.84/SBF-compatible, while `program-tests/Cargo.lock` is host-only and carries Solana `2.3.1`'s modern dependency graph.

The production workspace implements `initialize_protocol_config`, `create_ritual`, and `fund_member`. The `FundMember` instruction supports HOST and SPLIT: it finds the signer in ordered member state, rejects duplicate bitmap bits, validates the existing bitmap/count/stake/fee accounting invariants, computes the next bitmap with bitwise OR, bounds next totals by the group pool and locked fee, transfers exact stake and the deterministic fee share with classic `transfer_checked`, and updates bitmap/count/liability totals only after CPIs. SPLIT uses `base = locked_fee / N`, with one additional atomic unit for each index below `locked_fee % N`; the fee escrow is not revenue until activation. Both stored vault addresses and their `stake-vault`/`fee-vault` PDAs (including stored bumps), mint, and Ritual token authority are enforced. Raw vault balances are not used as funding state, so unsolicited dust remains outside tracked liabilities. The native harness contains 52 test functions (the 2–6/remainder matrix is one looped test), including byte-for-byte rejection snapshots and exercised errors 6021-6027 plus Anchor `ConstraintSeeds` 2006. The fixed ID `8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB` is a **LOCAL TEST PLACEHOLDER**, not a deployable identity; no deployment keypair is retained.

Core records:

- `ProtocolConfig` PDA — allowed devnet mint, fee recipient/config, caps, pause flag;
- `Ritual` PDA — creator, rule digest, members/cap, mint, event allocation/count, threshold, timing, locked fee, lifecycle;
- member slots or `MemberRecord` PDAs — selected after account-size measurement;
- event/claim data — participant status and approval bitmap;
- program-controlled SPL vault PDA.

Core instructions:

- initialize config;
- create ritual;
- join ritual;
- fund member;
- activate ritual;
- claim completion;
- approve claim;
- question claim;
- void/finalize event;
- cancel unfunded ritual;
- close completed zero-balance ritual.

The creation-time fee is immutable: `group_pool = member_total_stake * member_count`, `fee_raw = floor(group_pool * fee_basis_points / 10_000)`, then the checked `u128` result is converted to `u64` and clamped to the configured minimum/maximum. `per_event_allocation = member_total_stake / event_count` remains per member; no token movement occurs during creation.

Create validates each schedule's internal nonnegative timestamps and strict ordering, but it does not require the first event to be future-relative to the current clock. This is a deferred safety rule: activation must reject or resolve an unusable elapsed schedule before funds lock; create does not implement that check.

Native ProgramTest proves this boundary under simulated direct replacement of the exact ProtocolConfig account: a created Ritual retains its full account state and locked quote while a later Ritual uses the replacement fee fields. The same harness proves that a paused configuration rejects creation with `ProtocolPaused` before the Ritual PDA exists.

The admin cannot approve claims, rewrite active rules, choose payout recipients, or withdraw active ritual escrow.

## Threshold contract

`X` counts additional signatures beyond the claimant:

- Honor: `0`;
- One friend: `1`;
- Majority: `floor((N - 1) / 2) + 1`;
- Unanimous: `N - 1`.

The program rejects self-approval, duplicate approval, nonmembers, and cross-ritual/event/claim replay.

This is threshold authorization over a state machine, not a generalized wallet multisig.

## Settlement contract

For one event:

```text
forfeited = per_event_allocation * clearly_unclaimed_count
base return = per_event_allocation for each confirmed member
bonus = forfeited divided among confirmed members
```

All math uses checked token atomic units. Division remainder is distributed one atomic unit at a time in deterministic member-index order. Rituals receives none of the forfeiture.

Future-event allocations remain locked. An event with no confirmed member, or with pending/questioned claims at the final P0 resolution point, follows the safe void/roll-forward path rather than confiscating funds.

The activation fee is quoted and transferred separately. Initial hypothesis: 200 bps, 0.50 minimum, 5.00 maximum per group.

## Signing and readback

Every write:

1. validate cluster, program, account owner, mint, decimals, and current state;
2. build one prepared action;
3. show exact token outflow, platform fee, threshold effect, network, and devnet label;
4. request authorization/signing through MWA;
5. confirm transaction;
6. fetch the exact target account and balances;
7. mark success only from observed resulting state.

Reuse reviewed-byte identity where practical. Any change to blockhash, instruction, accounts, or bytes invalidates the prior summary.

## Privacy

Onchain:

- wallet addresses;
- rule digest;
- minimum schedule/rule parameters;
- claims, approvals, statuses;
- escrow and settlement values.

Offchain/local P0:

- bounded title and requirement text;
- invite display metadata;
- local reminder settings.

Not collected in P0:

- precise location;
- photos or clips;
- voice notes;
- contacts;
- in-app chat;
- private evidence.

A wallet signature proves attestation, not physical-world truth.

## Environment and release boundary

- P0: devnet and a valueless SPL test token.
- Expo Go: unsupported for native MWA.
- Metro export: bundle smoke test only.
- Development APK: native/MWA development test, possibly Metro-dependent.
- Standalone signed APK on Seeker: release acceptance artifact.
- Mainnet: explicitly out of scope until legal, publisher-policy, security-review, privacy, and operational gates pass.

## Detailed execution

See `docs/plans/2026-09-09-rituals-rebuild.md` for task-level paths, RED/GREEN tests, commands, commits, device acceptance, and rollback rules.
