# Rituals (rebuild planned; repository currently contains Preflight)

Rituals is a Solana Mobile accountability app for private groups:

> Put your money where your mouth is.

A member signs that they completed a recurring commitment. The ritual's immutable policy requires a configured number of other funded members to co-sign. Once that threshold is reached, a purpose-built Solana program settles the event's escrow tranche under rules accepted before funding.

## Honest repository status

The active repository implementation is still the verified **Preflight** Android prototype. The Rituals product, protocol, architecture, and rebuild sequence are documented, but no Rituals React Native screen or Solana escrow program has landed yet.

Implemented and previously verified:

- Expo/React Native Android application shell;
- Mobile Wallet Adapter dependencies and authorization plumbing;
- deterministic Solana legacy/v0 transaction decoding;
- exact reviewed-byte fingerprinting;
- Preflight CLEAR/HOLD/ABORT fixture/domain/UI slice;
- 31 tests at the last recorded baseline;
- TypeScript and Expo Doctor passing;
- Android bundle export;
- private GitHub CI;
- signed development APK built, installed, and launched on a physical Solana Seeker.

Planned Rituals P0:

- private groups of two to six funded members;
- equal stake split into one tranche per recurring event;
- Honor, one-friend, majority, and unanimous confirmation thresholds;
- MWA-signed create, fund, claim, confirm/question, and settle actions;
- program-controlled SPL-token escrow;
- complete forfeiture redistribution to confirmed members;
- disclosed activation fee independent of success/failure;
- devnet and valueless test token only;
- signed standalone Seeker APK and two-wallet acceptance run.

Do not interpret design documents or HTML sketches as implemented mobile behavior.

## Approved future doors (not implemented)

- **Solo rituals — P1 candidate:** self-attestation may return completed event tranches, but any missed-tranche destination must be precommitted, non-platform, and policy/custody-safe before valuable funds are supported. P0 remains two to six funded members.
- **Public/app-wide challenge templates — exploratory P2:** preserve versioned schemas and narrow adapters for a possible later mode. P0 has no discovery, feed, leaderboards, stranger betting, or sponsor pools.

## Why this is multisig-like, not a shared multisig wallet

A conventional multisig authorizes arbitrary transactions from one treasury. Rituals uses threshold signatures to authorize only a specific completion-claim state transition. Confirmers cannot choose recipients, alter amounts, or withdraw future tranches. The program executes the fixed payout formula.

Consumer wording:

> You sign that you did it. Your friends co-sign. The contract handles the rest.

## Current stack

- Expo `~52.0.49`
- React Native `0.76`
- TypeScript
- React Navigation
- React Native Paper
- TanStack Query
- `@solana/web3.js` 1.x
- SPL Token
- Solana Mobile Wallet Adapter
- Vitest
- EAS Android builds

The compatibility spike is complete: Anchor `0.31.1` is feasible for the onchain program when its Rust-1.84-compatible transitive crates are pinned. Production mobile should use a thin typed `@solana/web3.js` client generated from a frozen IDL. Actual Rituals native MWA signing, token escrow, devnet deployment, and two-wallet flow remain unvalidated. Any missing global toolchain installation still requires explicit approval.

## Local verification

```bash
npm ci
npm test
npm run typecheck
npm run doctor
rm -rf .verify/expo-export
npx expo export --platform android --output-dir .verify/expo-export
rm -rf .verify/expo-export
```

The bundle export proves Metro can create Android JavaScript output. It is not an APK, native-module test, MWA test, or device acceptance test.

Expo Go cannot exercise the required native MWA package. Use a custom development/standalone Android build with an MWA-compatible wallet.

## Product safety boundary

- Never request or store a seed phrase/private key.
- Every ordinary wallet action uses MWA.
- P0 uses devnet and valueless test assets.
- A signature proves who attested; it does not prove the real-world activity.
- Pending or questioned claims cannot silently become forfeitures.
- Rituals takes no percentage of forfeitures.
- Mainnet stablecoins are gated on applicable-law/publisher-policy review, dispute/liveness hardening, independent program review, privacy controls, and production operations.

## Documentation

- `docs/plans/2026-09-09-rituals-rebuild.md` — executable rebuild plan and acceptance gates
- `docs/ARCHITECTURE.md` — current implementation versus target architecture
- `docs/IMPLEMENTATION_PLAN.md` — implementation-plan index and historical boundary
- `docs/DEVELOPMENT.md` — verified commands, device/build workflow, and TDD rules
- `docs/SECURITY.md` — present and target trust boundaries
- `docs/ROADMAP.md` — completed, active, and deferred milestones

Product and hackathon decisions are maintained in Jack's Hub Obsidian vault under `Projects/Preflight`; the dashboard note is `Rituals - Project Home.md`. The directory retains its historical name for now so existing links are not broken.

## Repository visibility

This repository is private. Do not push credentials, wallets, seed phrases, deployment-authority files, Android keystores, EAS tokens, `.env` files, RPC secrets, or valuable test material.
