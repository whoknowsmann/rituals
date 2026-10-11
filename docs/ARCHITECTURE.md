# Architecture

Measured state, not plans. For product claims see `docs/submission/FACTS.md`; for
what is proven on the phone and when, `docs/STATUS.md`. Updated 2026-10-11.

## Status

The shipped product is **solo Rituals**: start a ritual → hold to stamp each
week → weeks close by themselves → receipts. The Anchor program is deployed on
**devnet** (`2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p`). The full solo loop
has been run on a Solana Seeker with Seed Vault Wallet through Mobile Wallet
Adapter: one wallet approval creates, funds and activates a ritual; one approval
per stamp; the app's own settle key closes finished weeks with no wallet prompt
(6-week run on 2026-10-09, every settle signed by the settle key, none by the
wallet). The same code path is exercised on devnet by `scripts/smoke-app-solo.ts`.

Group rituals (friends who stake and confirm each other), a non-staking witness
and Seasons are implemented in the program and the client, hidden in the app by
`src/features/rituals/productScope.ts` (`SOLO_ONLY`), and not part of the
submission.

## Mobile path

```text
Rituals React Native app (Expo, TypeScript)
  Home (src/screens/RitualsHomeScreen.tsx)
    -> remembered rituals for the connected wallet, read from chain in one batched call
    -> settles overdue weeks in the foreground (settle key)
  Create (src/screens/solo/*, src/features/rituals/solo/create/)
    -> step 1: name + what counts as a week; step 2: weeks, speed, one total stake, destination
    -> one prepared transaction: CreateSoloRitual + FundMember + ActivateRitual
       + one capped SystemProgram transfer that pre-pays the settle key
  Ritual screen (src/screens/solo/*, src/features/rituals/solo/lifecycle/)
    -> chain-timed countdowns, HOLD TO STAMP (InitializeCurrentEvent + ClaimCompletion, one approval)
    -> settle key opens a missed week and finalizes every closed week (src/features/rituals/solo/settler/)
    -> receipts per week; Finished totals line on the last week
  Settings -> End early (one approval returns everything not missed and closes the vaults),
              reminders, faucet, network and program info
  Faucet button (src/features/rituals/faucet/) -> POST https://faucet.whoknowsman.com/api/claim
```

Every chain action goes through the same layers:

- `src/data/rituals/` — frozen Anchor IDL (`idl/`), PDA helpers, strict fail-closed
  account decoders (ProtocolConfig, Ritual, RitualEvent, CompletionClaim), RPC
  readers with bounded retry on public-RPC 429s, instruction builders, prepared
  actions (every prepared transaction carries compute-budget instructions),
  submission and confirmation/readback.
- `src/features/rituals/` — the lifecycle state machine (`lifecycleMachine.ts`),
  wallet handoff and recovery (`walletHandoff.ts`, `recovery/`: in-flight actions
  are journaled and resolved from chain after a restart), chain time, reminders,
  the faucet client, the solo create/lifecycle view models and the settle key.
- `src/utils/` — Mobile Wallet Adapter transport and authorization cache
  (`useMobileWallet.tsx`, `useAuthorization.tsx`, `walletChoice.ts`). Connect
  offers Seed Vault Wallet only; the association intent is pinned to that
  package by a postinstall patch of the MWA native module
  (`scripts/patch-mwa-wallet-package.mjs`).
- `src/domain/rituals/` — pure contracts and money math (checked atomic units as
  `bigint`); no fetching, rendering, signing or wallet access.

## Signing and the wallet

- The app binds the wallet's signature to the exact bytes the user reviewed. If
  the wallet rewrites the priority fee (Seed Vault Wallet does), the submitter
  verifies the landed transaction instead (`src/data/rituals/walletFeeChange.ts`).
- A lost wallet reply, or a cancel after signing began, is "possibly sent": the
  app checks the chain before showing an error, and a create reuses one nonce
  per screen so a retry cannot make a second ritual.
- The app never sees a seed phrase or private key. Seed Vault Wallet shows the
  requester as Rituals at `https://rituals.whoknowsman.com`.
- The settle key is a keypair generated on the phone, funded inside the user's
  first approval (0.001 SOL + 0.002 SOL per week, 0.033 SOL at most). It can sign
  only the permissionless open and settle instructions; the program moves money
  only where the ritual already says.

## On-chain boundary

The Anchor workspace (`programs/rituals`) and its native ProgramTest suite
(`program-tests/`, 224 tests) are separate from the mobile code. The program
covers protocol config (fees are configurable and set to 0 / 0 / 0 on devnet),
solo and group creation, funding, activation, per-week events, claims, friend
attestations, settlement, declared skips, End early (eject) and vault closure.
Solo settlement returns a kept week's share to the member and sends a missed
week's share to the destination fixed at creation; the pool conserves exactly
and the protocol is never paid.

Deployment records: `deployment/devnet.json`, `deployment/devnet-mint.json`.
Deploy keypairs sit in `.keys/` (gitignored). `scripts/verify-devnet-config.ts`
asserts that the on-chain config matches the client's constants.

## What runs where

- No server of ours except the faucet (`whoknowsmann/rituals-faucet`, Vercel).
  No accounts, no analytics.
- Nothing runs while the app is closed: weeks are settled the next time Home or
  the ritual screen is open. Reminders are phone-local (expo-notifications),
  scheduled from the on-chain schedule.
- On the phone: remembered rituals, stamp notes, the settle key, reminder
  settings, theme and the in-flight journal. Uninstalling removes all of it.

## Build and release

Local EAS builds (`scripts/build-apk-local.sh`, `preview` profile, APK) are the
test builds; the submission APK is the same artifact, published as a GitHub
release with its sha256. Devnet only; tSKR is valueless. Assets with real value
require legal and security review first.
