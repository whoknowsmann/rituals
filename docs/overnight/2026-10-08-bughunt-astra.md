# Rituals bug hunt — 2026-10-08

Scope: astra/bughunt-2026-10-08 from 2c909c7; app only; no installs, builds, adb or transactions (one read-only devnet ProtocolConfig read). Astra ran to d7745cf; Opus finished from d2a1968.
Verification: `npm run typecheck` clean; full `npm test` 166 files / 2,807 tests green at 81cfcd9. Each fix's test failed before its change. Nothing was run on a device.

| class | bug | evidence (test or file:line) | severity | fixed (SHA) / not fixed (why) |
| --- | --- | --- | --- | --- |
| C1 | Not a bug: b559780 replaced the F1 design (fd6769a: stamp/skip/settle/End early keep “Nothing was sent. Try again.” while the chain check runs, since the program rejects a duplicate; Create says “Try again.” and every retry keeps its nonce, so the same ritual address) and left the suite red | ritualSubmission.test.ts “keeps a sheet cancelled after signing began unresolved…”; actionRecoveryHooks.test.ts | — | reverted: d2a1968 |
| C1 | Faucet promised unconfirmed credit; a timeout skipped the balance refresh; minimum funding implied any stake fits | devnetFaucet.test.ts uncertain-response cases | medium | fixed: fd4c640 |
| C2/C6 | Detail/receipt re-read accepted older slots; a route change showed the previous week for one render | authoritativeRituals.transition.test.ts | medium | fixed: f57f83a |
| C3 | Detail catch-up settled while disconnected or under another wallet | useCatchup.test.ts “never starts detail catch-up” | high | fixed: 462d4c5 |
| C3 | Faucet result/request survived A→none→B→A; a late A response refreshed the old balance | useDevnetFaucet.test.ts (4 cases) | high | fixed: 51fa962 |
| C3 | Recovery resolved/removed another wallet's journal and showed its notice; creates omitted the owner | usePendingRitualRecovery.test.ts; buildCreateDeps journal tests | high | fixed: bf38f28 (ownerless legacy journals kept, silently) |
| C2/C3 | Settings kept A's list/End early while B loaded; detail/receipt showed A's notes and stamps | walletBoundaries.test.ts | high | fixed: d924fab |
| C3 | Settings master-on restored every wallet's reminders; scheduling ignored a switch during the permission lookup | restore.test.ts; service.test.ts | high | fixed: 3dea993 |
| C3/C7 | Skip and End early checked the wallet before async height/journal reads, then still signed after a switch | soloActionDeps.test.ts; eject.test.ts (4 cases) | high | fixed: 952b7bd |
| C2/C3 | Create carried A's balance into B; a faucet response left the pre-credit low-balance line | walletBoundaries.test.ts; SoloCreateScreen.tsx balance read | medium | fixed: d7745cf |
| C3/C4 | Scheduled reminders kept firing for a disconnected or other wallet; weeks stamped/closed away from the ritual screen kept their nudges | restore.test.ts “A→none→B→A”; service.test.ts “silences one ritual…”; walletBoundaries.test.ts Home pin | high | fixed: 81cfcd9. Runs on Home's own read (focus, resume while Home is open, wallet switch, catch-up), not on a resume into another screen; rescheduling also clears that ritual's delivered alerts from the tray |
| C5 | Create locks less than the chosen total when it does not split into 0.01s (20 over 6 = 3.33 a week, locks 19.98); “Locks X after rounding.” says so | stakeSplit.ts:22; SoloCreateScreen.tsx:454; numbers below | low | not fixed: owner decision pending (create UI untouched) |
| C5 | End early poster mixes bases: “Back to you” is what this eject returns, the destination row is all-time forfeits, so a week already sent shows again though this eject moves nothing to it | ejectQuote.ts:49,57-59; ejectFlow.ts:23-24 | low | not fixed: label semantics, owner call; both amounts match eject_ritual |
| C5 | Audit, no other mismatch: faucet line equals the faucet's constants (50 tSKR, 0.05 SOL); the devnet fee is 0 bps, so “needs” = locked; receipts, “Stake per week”, tile “X of Y back”, finished line and “Back to you” equal what the program moves; formatAtomic is exact (0.005 stays 0.005) | rituals-faucet lib/constants.ts; ProtocolConfig 7LMgBSJm…; lib.rs:269,1383,1681 | — | nothing to fix |
| C6 | Final stamp/receipt drew “Same time next week.”, including 1-week rituals | sayings.test.ts final-week cases | medium | fixed: 1510922 |
| C6 | Audit, rest clean: the last week counts to its close; reminders only inside each week's window (none after the end); a missed last week shows Finished; a later open week makes the tile say “Stamp this week”. Copy nit: a real-speed week 1 alert can read “New week 1. Same ritual.” | weekHero.ts:77-79; planner.ts:75; lines.ts:19 | low | not fixed: copy only |
| C7 | Audit: Try again/HOLD/Settle/Skip re-check the same week on the chain clock (actionReadback.ts); End early re-quotes before signing; Create reuses its nonce; catch-up re-reads before every send. Residual: a failure before the wallet opens (prepare) triggers no re-read, so Try again/Settle repeat on that read until focus or resume | SoloRitualScreen.tsx:104,204-214 | low | not fixed: no demo-path trigger; leaving and returning re-reads |
| C7 | Get test tokens stays on create/Settings until the credit is read; a second tap before the first lands can be paid twice (faucet checks the recipient balance; per-instance lock; IP-throttled) | SoloCreateScreen.tsx:457; SettingsScreen.tsx:57; rituals-faucet api/claim.ts:18 | low | not fixed: faucet-side, valueless devnet |

C5 create numbers, chosen total → weeks: per-week/locked (tSKR; the devnet fee is 0, so locked is what the wallet sends). 52 weeks cannot be created: the stepper and the program stop at 16 and soloEventCount falls back to 2 (demo) / 4 (real); its figures are what splitTotalStake would give.
- 5: 1 5/5 · 2 2.5/5 · 3 1.66/4.98 · 4 1.25/5 · 5 1/5 · 6 0.83/4.98 · 7 0.71/4.97 · 8 0.62/4.96 · 12 0.41/4.92 · 16 0.31/4.96 · 52 0.09/4.68
- 10: 1 10/10 · 2 5/10 · 3 3.33/9.99 · 4 2.5/10 · 5 2/10 · 6 1.66/9.96 · 7 1.42/9.94 · 8 1.25/10 · 12 0.83/9.96 · 16 0.62/9.92 · 52 0.19/9.88
- 20: 1 20/20 · 2 10/20 · 3 6.66/19.98 · 4 5/20 · 5 4/20 · 6 3.33/19.98 · 7 2.85/19.95 · 8 2.5/20 · 12 1.66/19.92 · 16 1.25/20 · 52 0.38/19.76
- 50: 1 50/50 · 2 25/50 · 3 16.66/49.98 · 4 12.5/50 · 5 10/50 · 6 8.33/49.98 · 7 7.14/49.98 · 8 6.25/50 · 12 4.16/49.92 · 16 3.12/49.92 · 52 0.96/49.92

## device checks for Jack
- d2a1968: stamp, approve in Seed Vault, then press Back on its success sheet. Expect “Nothing was sent. Try again.” for about a second, then YOU SHOWED UP! with no second approval and no popup.
- 81cfcd9: with wallet A, create a 5-week demo ritual at 20 tSKR (Remind me on) and background the app; “Week 2: stamp by …” arrives. On Home, top bar → Disconnect, background: no more alerts for it. Connect A again, open Home, background: the next week's alert arrives.
- 462d4c5/bf38f28: let a week of A's demo ritual close unstamped, then top bar → Disconnect → connect B. Home shows none of A's rituals and nothing settles for A. Reconnect A: Home closes the week by itself and its receipt reads MISSED.
- d7745cf: on an empty wallet, create step 3 shows “You have 0 tSKR” and Get test tokens; tap it. Expect “Sent: 50 tSKR and 0.05 SOL.”, then no “Not enough tSKR” line once the credit is read.
- 1510922: stamp the only week of a 1-week demo ritual. Expect YOU SHOWED UP! without “Same time next week.”; once settled, its receipt reads “20 of 20 tSKR back”.
- fd4c640/51fa962: on an empty wallet, Home → Get test tokens gives “Sent: 50 tSKR and 0.05 SOL.” and Start one. Disconnect and connect another empty wallet: no carried-over line, and Get test tokens is back.

## Independent review (astra → opus)
Scope: every commit 2c909c7..17a8e2f against the review brief. Astra wrote bd55932–f417ebe and stopped mid-item; Opus finished. `npm run typecheck` clean; full `npm test` 168 files / 2,852 tests green at 17a8e2f. Each fix's test failed first. Nothing was run on a device.
Verdict: merge at this commit. Run device checks A–C below on the next build before recording; A covers a create that hung on this branch until 5d84dd8 (feat/solo-screens never had the bug).

| commit | issue | severity | fixed SHA / why not |
| --- | --- | --- | --- |
| bf38f28 | Create journals gained the creator and week 0, so readPendingAction threw for one with no signature: a create that landed after Back on Seed Vault's success sheet, or after a wallet timeout, stayed unknown forever (Create stuck on “Try again.” or “Checking whether it went through…”; Home kept “still checking”). The hook tests mocked reconcile, so they passed | high | 5d84dd8 |
| 73d5fdf | Try again re-signed the first attempt's exact bytes. Seed Vault reports every decline as a cancel, so decline → change the stake → Lock it in signed the old stake; and once that blockhash lapsed (~60 s) every retry failed before the wallet until expiry was proven, ~150 blocks later | high | 20ef107: back to F1 (fresh prepare, same nonce and ritual address); keeps its reset guard and all-kinds tests. The C1 row above now says nonce |
| uncommitted WIP | termsLocked plus leaving Create on a wallet change: patched 73d5fdf's side effects with input locks and new navigation on the demo path | — | dropped; copy in scratch hunt-review-wip.patch |
| 9d28fd0 | The reminder plan ran before Home's first read, so a connected wallet's alerts were cancelled at every launch, and none came back if that read failed | medium | 17a8e2f; a disconnect still silences without the RPC |
| bd55932, be7f6b5, e598dac, f417ebe; 462d4c5…81cfcd9 | Re-checked: correct. d2a1968 is a clean revert; rule (3) holds for every action kind. The source pins left are screen wiring (no renderer installed) | — | — |
| fd4c640 | An unconfirmed faucet send reads “Checking whether it went through…” and nothing re-checks it (only on a faucet confirm timeout) | low | not fixed: copy, rare |
| Create, A→none→B | A's unresolved “Try again.” stays; B's Lock it in makes B's own ritual; if A's lands, B sees “not ready to show yet”. No wrong-wallet signing: the fee payer must be the connected account | low | not fixed: needs a screen change on the demo path |
| F1 limit | A retry that fails before its journal (RPC at prepare) stops the screen's check until the next attempt reaches the wallet; Home recovery still resolves it. The hidden group lobby draws a nonce per prepare | low | not fixed: SOLO_ONLY hides the lobby |

Device checks, add ahead of the list above:
- A (5d84dd8): Lock it in, approve in Seed Vault, then press Back on its success sheet. Expect “Try again.” for about a second, then the ritual screen opens by itself; Home lists it once, with no “still checking” line.
- B (20ef107): 4-week demo ritual at 20 tSKR, Lock it in, decline in Seed Vault (OK the “Network mismatch?” popup if it shows), tap 10, Lock it in. Seed Vault asks again; approve. The ritual reads Stake per week 2.5 tSKR, not 5.
- C (17a8e2f): with Remind me on and a week ahead, force-stop Rituals, turn on airplane mode, open it (Home cannot read), then leave it. The next “Week N: stamp by …” still arrives.
