# Timeout-fix review: ccf1d10 + 4dbd530 (feat/solo-screens), 2026-10-08

Read-only review by Hermes. I read both diffs and the code around them, the MWA React Native module (`node_modules/@solana-mobile/mobile-wallet-adapter-protocol`: `android/.../SolanaMobileWalletAdapterModule.kt` and `src/__forks__/react-native/transact.ts`) and `artifacts/logs/d34-run1-2026-10-08.log`. vitest on the 13 touched and adjacent test files: 206/206 pass. `tsc --noEmit`: clean. `src/` was unmodified (= 4dbd530) during the runs. Eight scratch probes outside the repo (not committed; scratch is pruned after 24 h) reproduce F2, F3, F4, F5, F10 and the decline case.

**Verdict: keep it, but it isn't finished.** It fixes d34 as observed. A timeout after sign_and_send is now uncertain. The screen reads the chain straight away and ends at Done. If the action didn't land, it waits for proven expiry, then shows a true "Nothing was sent" with Try again only while the week is open. No retry or duplicate send is offered in between. It does not close the bug class. F1 is the same Seed Vault hold followed by a Back press, and F2 covers other lost responses. Before calling it done: fix F2 and F3 (both small), settle F1 with one phone test, and re-run d34 on a build that contains this fix. No such build exists yet; all device evidence predates the fix.

**Correction to the brief.** The 10:46:40 "Simulation failed" (log L8881-8888) was not Try again re-sending a claim. The MWA session closed at L8604 and no new one opened, and the old Try again only reset state. The failing instruction is `InitializeCurrentEvent`, sent by the app's settle key through `sendRawTransaction`. That is auto-settle acting on a stale read after the week closed. This fix does not touch it (F9).

| Path | Behaviour now | Correct? | Severity | Suggested fix |
|---|---|---|---|---|
| D1 Decline: Seed Vault `CancellationException` after sign_and_send (log L1966) | "Not sent · Nothing was sent. Try again."; HOLD / Lock it in enabled again | Yes, if it really was a decline (see F1) | — | — |
| D2 Mismatch sheet [Close] (also `CancellationException`) | Same as D1. Try again hits the same sheet until the wallet is on Devnet | Truthful | Low | None; Seed Vault's sheet names both networks |
| D3 Timeout before authorize (association, 10 s) | `submission`: "Nothing was sent to the network. You can safely try again." | Yes (`signAndSendInvoked` false; session test) | — | — |
| D4 Timeout on authorize (90 s), or "after authorize, before sign_and_send" | Same copy. Nothing is awaited between authorize returning and `onSignAndSend()` (useMobileWallet L60-74), so the second case can't happen on its own | Yes | — | — |
| D5 Timeout after sign_and_send, landed (d34) | "Confirmation incomplete…", then the reconcile read → READBACK_OBSERVED → `recovered` "Done". HOLD off, no Try again, no second send | Yes | — | — |
| D6 Timeout after sign_and_send, not landed | Uncertain until block height passes lastValid and the readback shows nothing, then "Nothing was sent… safely try again". Try again only while the window is open | Yes (edge case: F5) | — | — |
| D7 Stale auth token | Token cleared; "Nothing was sent…" | Yes | — | — |
| D8 App killed mid-wallet (backgrounded = D3-D6 once the result arrives) | The unsigned journal write is awaited before the wallet opens: create (buildSoloCreateDeps L177-182), stamp/settle (buildRitualActionDeps L110-113), skip, eject. Home's resolver reports went through or still checking, and drops expired records silently | Yes, but screens don't read the journal on remount, so Lock it in can be pressed again while the first attempt can still land | Low | Gate Lock it in on an unresolved create record for this wallet |
| F1 `CancellationException` after broadcast | The RN module closes the session on any wallet `RESULT_CANCELED` (Module.kt L88-98) and rejects the pending call (L164-166). That is how declines arrive. d34 shows Seed Vault holding its answer ≥80 s after broadcast. Back on that sheet ⇒ "Nothing was sent. Try again." for a landed tx. Create makes a new nonce per attempt (L145) ⇒ second ritual and second stake. Stamp: the re-read on resume usually flips it to Done; if not, the duplicate fails simulation | No (unverified on device) | High (create) / Med (stamp) | Phone test: approve, then press Back on Seed Vault's success sheet. After a post-invoke decline, keep the journal and reconcile in the background; createMachine L131 must accept retryable errors, as lifecycle L36 does. Reuse the create nonce until the old attempt is proven expired |
| F2 Post-invoke failure that isn't a timeout: EUNSPECIFIED IOException / session closed, or `transact`'s `finally endSession()` rejecting after a signature came back | `submitted:false`, or a raw error ⇒ "Nothing was sent to the network" (probes P5a, P5b) | No | Med | useMobileWallet (inner L75, outer L101-106): after invoke, only an explicit wallet answer (JSON_RPC_ERROR, decline, stale auth) means not sent; everything else ⇒ `submitted:true` |
| F3 Landed but failed on chain (`status.err`, signature known) | A `failed` resolution is never dispatched (reconcilePendingAction.ts L35). The loop polls every 3 s forever on "Do not retry", and HOLD / Lock it in stay disabled until remount (probe P1) | No | Med | Dispatch a retryable "It didn't go through" (still gated on the window) and stop polling |
| F4 Decline, then `endSession` times out | Upgraded to uncertain; clears at expiry (probe P5d) | Conservative | Low | — |
| F5 Unsigned expiry (the d34 case) | Marked expired as soon as height > lastValid, with no margin and no readback-slot check (pendingAction.ts L137). The signed path has both (+150 blocks, readback slot ≥ status slot). A lagging node's not-found ⇒ "Nothing was sent" (probe P3); on Create that means a duplicate | Mostly | Low-Med | Require a readback slot ≥ a slot read after the height (`getEpochInfo`), or add `EXPIRY_MARGIN_BLOCKS` |
| F6 Reconcile loop bounds | Every 3 s while mounted, with no backoff or cap. An RPC outage stays uncertain (correct); expiry ends the loop | OK | Low | Back off; after a cap, hand off to Home's 15 s resolver |
| F7 Skip, settle fallback | Readbacks for declare-skip / initialize-event / finalize. Recovered → reset and re-read; expired → Try again only if the action is still available | Yes | — | — |
| F8 End early | No reconcile; `ejectDeps` is unchanged. EndEarly polls `readRitual` 4×3 s. If the eject never shows: "may have gone through", button disabled, Cancel only. It never reaches "Nothing was sent" | Partly | Low | Give `buildEjectDeps` the same `reconcile`; `readPendingAction` already reads `eject` |
| F9 Auto-settle vs. an uncertain or recovered stamp | Runs on a stale read (the real 10:46:40 failure). Preflight rejects it, but it uses up 1 of 3 auto tries | Benign; untouched by this fix | Low | Hold auto-settle while any action is uncertain or the stamp hasn't been read back |
| F10 Unsigned approve/question/fund/activate records (have actor + eventIndex but no readback; readPendingAction L20 throws) | Never expire, so Home says "still checking" forever. This undoes 43c3b83 (probe P2). Hidden by SOLO_ONLY | Regression | Low | Keep the L+150 expiry for kinds with no action-specific readback |
| F11 Create copy while uncertain | `readbackError` "Your ritual was sent, but it is not ready to show yet" (SoloCreateScreen L311) appears next to "may already have gone through" | Overstates | Low | "Checking whether it went through…" |
| Q3 Try again (stamp/skip/settle) | `soloActionCanRetry` = retryable && !landed && still available by chain time (1 s tick, 15 s resync). Stale retryable errors reset when the window closes. Never offered while uncertain; kept for a real decline inside the window | Yes | — | It still shows for a decline whose stamp landed but hasn't been read yet (F1) |
| 4dbd530 Balance/faucet help | Shown only when `canSubmitCreate` (idle, retryable error, proven expiry); hidden in flight, while uncertain and when done | Yes | — | — |
| Docs `STATUS.md` L42-44 | Still says the "timeouts as submitted" WIP was rejected | Stale | Low | Record the d34 evidence and the reversal |

**Tests (Q4).** Proven:
- phase-aware classification, including the exact d34 error shape
- the copy in both machines
- d34 at the deps level: no signature and landed → recovered with no second send; not landed → retry only after expiry; an outage stays uncertain
- the hooks start reconciliation without a tap and stop on unmount
- the chain-time retry rules
- the balance-help states

Not proven: the screen wiring (the SoloRitualScreen and SoloCreateScreen tests only check the source text with `toContain`) and anything on the device.

Missing tests:
1. A behavioural SoloRitualScreen run of d34: stale read → timeout → Done, HOLD off, no Try again, no auto-settle.
2. F3 `failed`.
3. F1, the policy for `CancellationException` after invoke.
4. F2, an IOException or `endSession` failure after a signature came back.
5. F5, create expiry with a lagging not-found.
6. F8, End early timing out.
7. F10, expiry of an approve record.

Device checks after a rebuild:
- (a) Approve and leave Seed Vault's sheet up for more than 90 s.
- (b) Approve, then press Back on the sheet.

Each time, compare the on-screen copy with the chain.

Probes: `~/.hermes/cache/scratch/probe{,2}/*.probe.test.ts`, run with `node node_modules/vitest/vitest.mjs run --dir <dir>`.
