# eject_ritual review, 2026-10-07

**Verdict: SHIP.** No code defect found in program, client or UI; four test gaps closed. Reviewed `opus/eject-2026-10-07` at 3844a09; review commits f8a6dbe (native tests), 5eee5b0 (TS tests), this report. Nothing deployed, sent or signed; `lib.rs` and the built `.so` untouched (sha256 d5625b8c…2803, 770,648 B).

| Area | Finding | Sev | Status |
|---|---|---|---|
| Program | Creator-only signer; ritual and vault PDAs by seeds + stored bump + address, vault mint and authority; creator account owner + mint; forfeit destination = locked address + mint, never the creator account (same as or stricter than finalize); tokens go only to those two; checked math, exact conservation; Active + solo only; double eject blocked; vaults closed, rent to the creator; errors 6076–6079 appended; the only layout change is the appended `Ended` variant (1-byte enum, sizes unchanged); the lib.rs and IDL diffs remove 0 lines | — | OK |
| Program | Walk matches finalize: lapsed = deadline < now, and claims close at the deadline, so a miss is final then. Unclaimed and not skipped → destination; pending/questioned → void (back); kept or skipped → back; a forfeit that grew after the quote fails `EjectQuoteChanged` | — | OK |
| Tests | Nothing proved the other instructions reject an Ended ritual | Med | FIXED f8a6dbe: all 9 rejected, watched accounts byte-identical |
| Tests | No witness coverage (Pending, Questioned, Confirmed claims) | Med | FIXED f8a6dbe: never forfeits; lapsed pending/questioned → Voided UnresolvedClaims, approved → kept; an open pending week is left untouched and the witness is locked out |
| Tests | Completed ritual and stamped last week untested | Low | FIXED f8a6dbe |
| Client | Discriminator = sha256("global:eject_ritual")[0..8] = IDL; frozen IDL = generated; account order = `EjectRitual` + unsettled event PDAs (Rust↔TS manifest pinned); shared preparer/submitter/confirmer, and the fee-rewrite rebuild is kind-aware; journal knows `eject`; readback = Ended, vaults gone, creator ≥ before + back; every event reader passes `endedAt`; reminders cleared | — | OK |
| Client | Quote↔program parity shown on only 6 scenarios | Med | FIXED 5eee5b0: 15-row table on the native scenarios (expected_forfeit, back to you, receipts) |
| UI | Hidden in Settings; money → Continue → typed name → one approval; fresh chain re-quote before signing ("Amounts changed."); decline → "Nothing was sent."; an uncertain landing polls the chain; Ended has no HOLD, countdown, skip or reminders, and receipts stay reachable; no banned words | — | OK |
| Program | Forfeit destination required even when nothing is forfeited: a closed destination blocks eject, as it already blocks finalize. Anyone can re-create an ATA; a closed non-ATA cause account could not be re-created | Low | NOT FIXED: brief says "exactly like finalize"; Jack's call |
| Client | The creator's tSKR ATA must exist (quote and program); a closed one blocks End early until re-created | Low | NOT FIXED: extension |
| Smoke | Proves Ended, vaults gone, creator + back to you, destination untouched, week 1 KEPT. Never exercises on devnet: a forfeit, a missing-week receipt, expected_forfeit > 0 | Med | NOT FIXED: would extend the script; see check 3 |
| Merge | Base b09ceaa; feat/solo-screens is 16 commits ahead. Conflicts: soloHistory.ts, SoloRitualScreen.tsx. accounts.ts auto-merges a region both sides changed (checked: both changes kept) | Med | Parent: check 4 |

**Tests.** Native `cargo test --locked`: 224 passed / 0 failed / 1 ignored (was 220); log `program-tests/native-tests-eject-review.log`. SBF compute re-measured on the built .so: 16-receipt worst case 217,998, before week 1 46,455, demo 59,845. All under the 400,000 limit; figures vary run to run with PDA bumps. TS: typecheck clean; `npm test` 2,554 / 146 files (was 2,538).

**Parent, during the upgrade and smoke.**
1. Upgrade only from this .so (sha256 d5625b8c…2803; fits the 855,304 B ProgramData), then dump and compare, then run `scripts/verify-devnet-config.ts`.
2. Run the smoke twice: default, then `--settle-week-1`.
3. Prove one forfeit on devnet. Make a new 3-week demo ritual and leave week 1 unstamped. In week 2, End early from Settings without opening the ritual screen (otherwise the settle key closes week 1 first). Rows: Back to you = 2 weeks, destination = 1 week. After: destination +1 week exactly, creator +2 weeks, a 139 B program-owned week-1 receipt with forfeited = 1 week, Ended, vaults gone.
4. Merge. In soloHistory.ts keep all three type fields (`completedAt`, `skipDeclared`, `skipEventIndex`). In SoloRitualScreen.tsx put `ended ? 'Ended' :` before the `titleWeekIndex` title, add `&& !ended` to the missed-paper line, and add `|| model.state === 'ended'` to renderState's completed return. Then re-run typecheck and `npm test`.
5. Demo on a fresh APK only: d27 and older drop an Ended ritual from Home.
