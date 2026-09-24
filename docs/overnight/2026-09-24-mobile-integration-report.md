# Overnight mobile integration report — 2026-09-24

Branch: `overnight/mobile-integration`

## Status by requested item

| Item | Status | Evidence / scope |
|---|---|---|
| 1. Reload recovery | **DONE + proven on devnet** | Plain pending records are journaled before wallet handoff and after a returned signature. The resolver uses signature status, blockheight expiry, and authoritative `RitualsRpcReader` readback. The devnet smoke created a real Ritual, discarded the submitted handle, recovered from a JSON round-tripped record, and separately classified a never-sent record as expired. |
| 2. Invite / join | **DONE + unit-tested only** | Digest-bound invite creation is gated after confirmed Create readback in the Create dependency builder. Invite links are base64url deep-link payloads, clipboard/share controls are present in the funding lobby, and `JoinRitualScreen` validates the invite against an authoritative RPC Ritual read before showing terms. No phone join/funding run was performed. |
| 3. Fund + Activate | **DONE + unit-tested only** | Added generalized review → wallet → submitted → confirming → confirmed/error machine, synchronous duplicate-tap guard, mounted guard, non-retryable post-submission failures, authoritative reads before preparation, real `prepareFund`/`prepareActivate` client calls, funding bitmap progress, and pending-action journaling. No full app-level Fund/Activate devnet run was performed. |
| 4. Dashboard/detail/claim/confirmation/receipt authoritative reads and actions | **NOT STARTED** | Existing fixture-backed screens remain. They were not changed to avoid leaving a partially wired lifecycle. |
| 5. Error states | **PARTIAL** | Wallet rejection, post-submission uncertainty, duplicate taps, mounted/unmounted safety, and blockheight/expiry classifications are covered in the lifecycle/recovery paths. Full offline/RPC, reconnect/account-change UX and all visible Claim/Approve/Question error surfaces remain. |
| Full lifecycle through the same app orchestrator | **NOT STARTED** | Deliberately not claimed: item 4 was not completed, so the requested post-item-4 orchestrator proof was not run. Existing raw-builder `smoke-full-lifecycle.ts` remains separate evidence. |

## Files changed

- `src/features/rituals/recovery/pendingAction.ts`
- `src/features/rituals/recovery/usePendingRitualRecovery.ts`
- `src/features/rituals/recovery/pendingAction.test.ts`
- `scripts/smoke-reload-recovery.ts`
- `src/features/rituals/invite/inviteCodec.ts` and test
- `src/screens/JoinRitualScreen.tsx`
- `src/features/rituals/lifecycleMachine.ts` and test
- `src/features/rituals/runLifecycleAction.ts`
- `src/features/rituals/useRitualAction.ts`
- `src/features/rituals/buildRitualActionDeps.ts` and test
- `src/screens/RitualActionScreen.tsx`
- Funding lobby and navigator wiring
- Create result/dependency wiring for persisted actions and confirmed invites

## Verification commands and measured results

- `npx tsc --noEmit` — passed.
- `npm test` — **69 test files, 1,920 tests passed**.
- `npx vitest run src/features/rituals/recovery/pendingAction.test.ts` — 5 passed.
- `npx vitest run src/features/rituals/invite/inviteCodec.test.ts` — 3 passed.
- `npx vitest run src/features/rituals/lifecycleMachine.test.ts src/features/rituals/buildRitualActionDeps.test.ts` — 5 passed.
- `npx expo export --platform android --output-dir .verify/expo-export` — passed; Android bundle exported, then `.verify/expo-export` was removed. This proves Metro bundle export only, not APK installation or MWA.
- `npx tsx scripts/smoke-reload-recovery.ts` — passed:
  - Ritual: `DFZ5siDSaUWV2p8PLGsnKyBjKWUCibdjEohyfPU9aDaH`
  - Create signature: `3r8LLKLaGvrMhJMS7yrLb4oCv6MyasGwA1EJu3sGVzav2r1F4XV5gu7vRgVrZq4JKfYEMUqfNjLd3Uv5E6mvbbnf`
  - `forgot handle and recovered confirmed Create from persisted record`
  - `never-sent record classified as expired`

The run emitted the existing `bigint` native-binding fallback warning; tests and the smoke passed using the pure-JS implementation.

Known deployed devnet identities used by the project remain:

- Program: `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p`
- ProtocolConfig: `7LMgBSJmEFKkfYKh2znr6VSxcm5QEHEouNijXDENhMd1`
- TEST mint: `AaHgFh7ussUDor8QfaBCaRz2RHiPNCs7i2yuzdLbt9tc`

## Frozen-module changes

Two frozen `src/data/rituals/**` changes were necessary and are covered by updated tests:

1. `RitualClient` now exposes the authorized program identity as a non-enumerable immutable `programId`. The original app-level Create builder was passing the ProtocolConfig PDA as `programId`; the first live app-level smoke attempt reproduced `programId does not match preparer`. The builder now uses the facade's authorized program identity.
2. `PreparedRitualAction` now exposes the exact recent blockhash already bound into the prepared message. Without it, the required pre-handoff pending record could not contain the actual blockhash; the prior attempted fallback would have been unsafe and was not retained.

No Anchor program, IDL, domain protocol logic, or deployed program was changed.

## Known defects / remaining work

- Item 4 remains fixture-backed on dashboard/detail/claim/confirmation/receipt screens; the fixture repository is still the active home-screen source.
- Claim, Approve, Question, InitializeEvent, Finalize visible actions are not wired through the generalized machine.
- The generalized Fund/Activate screen is wired to the real client but has not been proven on devnet through the app-level orchestrator.
- Pending recovery readback currently has a generic `actionObserved` adapter; action-specific expected-state evidence for Fund/Activate should be tightened when the remaining lifecycle screens are wired.
- Offline/RPC outage, reconnect/account change, and complete visible error UX need a dedicated pass.
- Mobile Wallet Adapter signing, Phantom approval, Seeker installation, and physical-device behavior were **not** proven in this session. MWA must not be claimed as verified.

## Commits

- `8b41eea feat: add reload recovery for mobile transactions`
- `0bdd409 feat: add confirmed ritual invites and join terms`
- `ce800aa feat: wire fund and activate mobile actions`

## Second pass

### Requested-item status

| Item | Status | Evidence |
|---|---|---|
| A. App-level Create → Fund(host) → Fund(friend) → Activate | **DONE + proven on devnet** | `npx tsx scripts/smoke-app-lifecycle.ts CD2gkjrNr6cp6asMzYXjPD2uxYkz97Hrmgw7z6c6Z8UJ 4UAbYjikxY1fWj1AkaPLih5hTdzvGgsRwBFCg6AVkmwP` reached authoritative Create/Fund/Fund/Activate readback. The latest A-complete run created Ritual `HCNi7NigPHgzSVzPfgKWzmrtQu3D3RkogLgJXR6h7HXH`, with Create `3bVMdBnex5ThccD8JpKraPxfX4QZznXwXfS4DpXx2UtoNDJXQT193QY39FYzf8aUvdWDotctDzN3FFc4DLeno5Gv`, Fund host `4v3WuZBpwfwEXXbNyRb3Z6cFq5oi9Q7HnZEGxirEefaU2eL6dUGz4wsjKR7N9KSaJZjhgSypHo5pnY2dSKvQ5247`, Fund friend `4Am1Bcoec7Wcgz4Z2kdmavQcyzeaidfLEXU9q6Th9UUnqfnjgqxRhNvcv88jK9whiaXAe8PEUaGvn33FxnZ679T7`, and Activate `5BshiMQQFnwuZ1Vpo85oM3v4wETTfWDVVRAdbGyUPbV9mTVhip9gnWYNuCuH2VQFAejGLUSAVMXngJAL9ZTPXXGa`. The script uses `createCurrentRitualClient`, `buildCreateRitualDeps`, `buildRitualActionDeps`, `runCreateRitual`, `runLifecycleAction`, and reducer state transitions with a local CLI signing transport. It asserted funding bitmap/count/stake/fee, exact host/friend token deltas, Active status, and fee-recipient delta. |
| B. Authoritative home/detail/claim/inbox/receipt reads and visible actions | **DONE + unit-tested only** | Added AsyncStorage-known Ritual records and `loadKnownRitualBundles`; confirmed Create and verified Join persist addresses plus display metadata. Home, detail, claim, confirmation inbox, and settlement receipt now read `getRitualBundle`/`getEventBundle`; InitializeEvent, Claim, Approve, Question, and Finalize use the generalized lifecycle machine with pending-action journaling. Fixture data is labeled demo-only and is not the live dashboard source. Receipt displays principal, bonus, forfeiture, remaining stake, event pool, and next event from authoritative accounts. No physical-device run was performed. |
| C. App-level InitializeEvent → Claim → Approve → Finalize | **PARTIAL** | The same app-level run for Ritual `E3jU254ynCBJnNr5RaCJJ1jDYfCxHvJjytHaUzB5f1A6` submitted and authoritatively confirmed Initialize `2VVSmoA9kM24d2CPAQivJRW2vmcAYagMKRpiVgmWigCk9Vo7szrSFDXxwVf6ByyUXgRiXkPKXLyfrdtGo9aX6Gxg`, Claim `5wb8AHor2qsRZvednJt6m9ui6dXVVkoVCuqqkcsQEWGSqWoZ66M7MauGwUScu2pcUdFKCR6hUqbEGKvoaenYN5Ze`, Approve `2JE9Grtz5yiypCj25SdJcsY8NMZDXU6be4huFK9P2SU6Wzyva9VDZzuPpfq6xV8LoduNATxw9ENZHDmdLdMazbhy`, and Finalize `2FebHxj8AyzEoQM2d4hiuysXwHVQ7MWtxZHM3oLztPN4VcWZtwpeZFfkUHdxhCDNqrxdMMCzPx6gq1PQzCcyqtDA`. Direct authoritative readback showed Settled, pool `2,000,000`, payout `2,000,000`, forfeiture `1,000,000`, refund `0`, remainder `0`, remaining future-event stake `2,000,000`, and fee recipient unchanged. The corrected script was not rerun after three scarce devnet lifecycle attempts: the first stopped on public-RPC confirmation throttling, the second exposed and corrected an over-broad balance assertion, and the third stopped on another public-RPC 429 after the approval transaction was already confirmed on-chain. |
| D. Offline/RPC, reconnect/account change, blockhash expiry | **DONE + unit-tested only** | Read screens show retryable connection copy and retry controls; prepare failures are retryable; post-submission failures remain non-retryable. Added synchronous authorized-account checks before prepare/signing and pre-sign blockheight expiry checks. Added lifecycle tests for blockhash expiry and dependency tests proving no wallet submission after account change or expiry. MWA/Phantom/Seeker behavior remains unproven. |

### Commands and measured results

- `npx tsc --noEmit` — passed.
- `npx vitest run src/features/rituals/create/createJourney.test.ts src/features/rituals/create/buildCreateDeps.test.ts src/features/rituals/create/runCreateRitual.test.ts src/features/rituals/lifecycleMachine.test.ts src/features/rituals/buildRitualActionDeps.test.ts src/screens/RitualsHomeScreen.test.ts` — 6 files, 55 tests passed.
- `npm test` — 69 files, 1,925 tests passed.
- `npx tsx scripts/smoke-app-lifecycle.ts CD2gkjrNr6cp6asMzYXjPD2uxYkz97Hrmgw7z6c6Z8UJ 4UAbYjikxY1fWj1AkaPLih5hTdzvGgsRwBFCg6AVkmwP` — A reached verified Create/Fund/Fund/Activate in the final run; C transactions also reached chain confirmation in the preceding run, but the command exited nonzero as documented above because public devnet confirmation throttling and the pre-fix settlement assertion prevented a clean end-to-end exit.
- `npx expo export --platform android --output-dir .verify/expo-export` — pending final gate; `.verify/expo-export` will be removed after export.
- Devnet emitted the existing `bigint` native-binding fallback warning; all proof and tests used the pure-JS implementation.

### Files changed

- `scripts/smoke-app-lifecycle.ts`
- `src/features/rituals/authoritativeRituals.ts`
- `src/features/rituals/buildRitualActionDeps.ts` and test
- `src/features/rituals/lifecycleMachine.ts`/test and `runLifecycleAction.ts`
- `src/features/rituals/create/buildCreateDeps.ts`/test, `createMachine.ts`, `runCreateRitual.ts`, and `createJourney.test.ts`
- `src/navigators/AppNavigator.tsx`
- `src/screens/RitualsHomeScreen.tsx`, `RitualDetailScreen.tsx`, `ClaimCompletionScreen.tsx`, `ConfirmationInboxScreen.tsx`, `SettlementReceiptScreen.tsx`, `RitualActionScreen.tsx`, `RitualFundingLobbyScreen.tsx`, `JoinRitualScreen.tsx`

### Frozen-module changes and known defects

No `programs/`, `program-tests/`, `src/data/rituals/`, or `src/domain/rituals/` files were changed in the second pass. No redeploy was performed. Known limitations: the corrected full smoke command lacks a clean final rerun because of the public devnet 429 budget; local metadata supplies title/requirement because the on-chain Ritual account stores only the digest; no device wallet, MWA, Phantom, Seeker install, or reconnect behavior was proven.
