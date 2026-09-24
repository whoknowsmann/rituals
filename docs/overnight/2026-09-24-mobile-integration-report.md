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
