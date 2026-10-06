Rituals UX batch — 2026-10-06
Branch: fix/ux-batch; tested UX SHA: 52f56debd97344147df1b1ffb9c5f99f0d1ba71b (report committed separately).

1. Clock/create (de51199): “Week 2 opens in 32s”, “32s left”, “2 days left”, “5 h left”, “HOLD TO STAMP”. Countdown uses the existing ticking chain clock and stored windows; real-week day/time labels remain. Confirmed create readback now navigation.replace’s directly to the ritual; “Lock it in” stays.
   Tested: countdown ticks, inclusive deadline and post-deadline boundaries, stamped/completed suppression, real-week units, create replacement wiring, unchanged 1.4 s hold logic.
2. Dead ends (6612c75): reused WalletChoiceButtons in Create’s second visible step and Settings; “Set your wallet to Devnet.” / “Connection not completed. Try again.” Faucet retry remains after every response while short/unknown; balance re-reads after a send and on screen focus. Busy buttons retain “Sending…” / “Locking in…” / “Working…”.
   Closed punch-card cells open their indexed receipt, including unknown-outcome closed cells; “Back to ritual” uses goBack. Tested: chooser/focus/retry wiring, faucet response mapping, closed-cell eligibility and indexed navigation, busy-label rendering source.
3. Finished/receipts (7bc8b07): “Stake per week”; “{amount} went to {destination}.”; one “{amount} back to you” line. Removed “Every week is settled.” and duplicate receipt headings/rows; preserved the existing finished-state demo-line suppression, MISSED and “That's a week, not a verdict.”
   Typed wallet owner is persisted per ritual in AsyncStorage, preserved through recovery, and checked against the locked ATA. Older rituals resolve the token account’s owner via a read-only RPC; unknown owner falls back to “the wallet you chose”, never the ATA.
   Tested: persistence/recovery isolation, ATA match/mismatch, parsed owner/mint/program validation, malformed/offline fallback, receipt models and screen copy pins.
4. Create (2f2eebf): “TOTAL STAKE”, “Go for a run”, “Locks {amount} after rounding.”; selected-wallet helper “Needs a tSKR account; Get test tokens creates one.” Blank/invalid fields render no error row until typing or a lock attempt; errors include “Paste a wallet address” and “That wallet has no tSKR account yet.”
   Tested: validation rules, interaction/submit gating source, no empty error row or duplicate address error, total-stake split/rounding, one-approval create regression checks.
5. Home/Settings (52f56de): removed “With friends: coming soon.” and the duplicate Settings hero; Get test tokens is first. Stamped Home tiles retain “Stamped” and replace the pending kept count with “Week closes {time}”, then “Closing…”.
   Tested: chain-based closing boundary and real-week dates, unstamped suppression, summary/accessibility wiring, Settings order, scope and tagline pins.

Verification: npm run typecheck passed; full npm test run ONCE — 2,420 tests / 138 files passed (provided baseline: 2,385 / 137). git diff --check passed.
Skipped: optional “Locked in.” arrival stamp/line; the separate stop was dropped rather than adding narration. Broader review redesign/video work was outside the five listed items.
Device-only confirmation: countdown/HOLD fit at device font sizes, wallet chooser and approval-return navigation, real faucet recovery/balance refresh, tapping both receipts, owner display on existing rituals, and unchanged haptics/fill/confetti.
Scope: no installs, APK/build/prebuild/gradle/adb, transaction-sending scripts, program/.keys/STATUS edits, timing/settlement/faucet-service/reminder/widget changes. “Show up, or pay up.” and “YOU SHOWED UP!” unchanged.
Working tree: tracked files clean before report; original untracked node_modules symlink retained untouched.
