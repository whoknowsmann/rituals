# Bug hunt 2026-10-07 — branch opus/bughunt-2026-10-07, code at f77b23e

**Skip run (ritual 6tbkhyp…, read-only RPC):** created 15:24:01, week 1 opened 15:24:45 (60 s lead counts from prepare; the approval ate 16 s). "Skip next week" tapped 15:24:20 → DeclareSkip(event 0) landed 15:24:31: the program only skips the *current* week while now < its opens, so it skipped WEEK 1. The app showed nothing new (still "Week 1 opens in …", NOW on the card, HOLD offered). Stamp 15:25:07 → claim Confirmed, YOU SHOWED UP. Settle key 15:25:47 → week 1 **Voided/DeclaredSkip, 10 tSKR refunded** (claim ignored); week 2 missed → 10 tSKR to Northside Food Bank 15:26:50. Money = a kept week 1; the skip was spent on the week he stamped.
**Readback failure (ours):** the event decoder required a DeclaredSkip week to have no claim bits and confirmed count == popcount; the program keeps the claim bits and writes 0. So the settle readback failed (15:25:49 log) and that week could never be read again (punch card `·`, receipt error; were it the last week, Home would drop the ritual as "unreadable"). `getEventBundle(0)` fails before, reads after.
**Fix:** decoder accepts it; button says **Skip week N**; offered only ≥ 60 s before the week opens and never at demo speed (lead 60 s, gap 5 s); a declared skip shows SKIPPED at once (no HOLD, no countdown, never NOW), settles as stake-back, and counts as neutral, not ✓.

| Area | Bug | Sev | Status |
|---|---|---|---|
| Reader | Stamped skip week undecodable → readback fail, lost history/receipt | High | FIXED 3bda788 |
| Skip | Skipped the open-next week, HOLD still offered, stamp voided; ✓ counted as kept | High | FIXED f83d702 |
| Clock | Every wallet return blanked the screen ("Checking the week clock…"), stamp re-thumped | Med | FIXED 4171e4e, f77b23e |
| Ritual screen | Buzz + confetti replayed on resume after a stamp | Med | FIXED b4a6dd9 |
| Settle key | Failure count never reset → later weeks fall to the wallet "Settle this week" | Med | FIXED b4a6dd9 |
| Stamp | Lagging-node read after a confirmed stamp → HOLD again, then MISSED copy until settle | Med (rare) | FIXED 4058944 |
| Faucet | Unconfirmed send → stale "0 tSKR"; "already funded" never re-read | Low | FIXED 976cba7 |
| Docs | README/FACTS/deck/form: "vault rent comes back"; app never calls close_terminal_vaults (vaults_closed=false) | Low | NOT FIXED: settle key could close vaults after the last settle (permissionless, rent → creator) or drop the clause |
| Skip reach | Program rule ⇒ skip only on Real weeks, in the hour before a week opens, after the previous week settled with the app open | Info | NOT FIXED (program); FACTS/README "one declared skip" should say Real weeks |
| Faucet copy | ≥0.03 SOL and 10..needed tSKR: "You already have enough to start." beside "Not enough tSKR" | Low | NOT FIXED: hide the button above the faucet threshold or reword (server policy) |
| Home | Another ritual's missed demo week reads "Closing…" until opened (settles only on its own screen) | Low | NOT FIXED (by design) |
| HOLD at deadline | Approval landing after the deadline: "You can safely try again" + Try again under the closing card | Low | NOT FIXED: reset a retryable claim error once the week is not stampable |

Screen diffs (SoloRitualScreen.tsx, logic only, no layout): skip label; settle card `!model.weekSkipped` ×2; `if (!model) return` in the showed-up effect; `autoFailures` reset per week; stamp re-read effect (+1 import). No change in src/components/crew/.
**Tests:** typecheck clean; `npm test` 2,534 / 145 files green (baseline 2,514 / 144). Probes (read-only, gitignored): `artifacts/probe/read-ritual.ts`, `read-bundles.ts`, `clock-drift.ts` (devnet Clock within ±1.5 s of wall time).
**Device-only:** no blank screen/flash after Seed Vault returns and one celebration per stamp; clock after screen-off/unlock; settle never falls to the wallet over a 4-week demo; d29 ritual now shows week 1 `·` + SKIPPED receipt; Real-weeks skip label/gate in the gap hour.
