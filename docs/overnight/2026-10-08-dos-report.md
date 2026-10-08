Rituals design batch — 2026-10-08
Branch: astra/dos-2026-10-08; base 33887da; reviewed code HEAD 9eb7a69ad25c1bc39c8a2e5329686393110db8f3.
Continuation baseline (including unfinished 9): npm test failed — 151/153 files passed, 2631 tests passed, 1 failed, 1 suite could not load React Native; fixed the missing native mock and item 6's stale Ended-screen source pin without weakening its behavior check.
1 (5939645): unstamped closed deadline shows MISSED / "That's a week, not a verdict." and the shared next-up clock; settled adds "{amount} went to {destination}." Removed "This week is closing", "The check-in window has closed. It settles in a moment.", "Closing this week…", "This week is ready to settle", and "{destination} gets this week's stake."; kept "Stamping…", SKIPPED, and "Settle this week" fallback.
2 (1060842): lead/gaps preview disabled "HOLD TO STAMP" with "Week N opens in 45s" in the countdown slot; removed separate waiting card; note stays editable; disabled hold cannot act.
3 (39f0580): removed missed/skipped "Back to rituals" button; error-state button and header back remain.
4 (2b7b7f1): "Reminders: on/off", "See week N receipt", "Remove from this phone" use link tone; bordered "Settle this week" and "Try again" remain.
6 (2246a51): kept exact "Demo speed: a week here is 1 minute. Unstamped weeks are missed." only in lead/open unstamped weeks, not stamps, gaps, misses, Finished, or Ended.
8 (5785916): settled MISSED paper remains in missed gap/Finished only, never above the next open HOLD; closed cells still open receipts.
14 (49092c2): removed "This week was declared skipped before it opened."; kept SKIPPED / "Your stake comes back."; "Back to ritual" uses link tone.
15 (b5be40b): removed Network-card "tSKR is a test token with no real value"; kept footnote; "Notification settings" / "View on Explorer" use link tone; "Get test tokens" stays a button.
9 (9eb7a69): native "Set Seed Vault to Devnet" / "Seed Vault Wallet → Settings → Network → Devnet." / single "Done", immediately before the first Seed Vault transaction handoff; shared wrapper covers create, stamp, skip, manual settle, End early; no Phantom/connect popup.
9 persistence: @rituals/devnet-hint/v1 records "shown" after Done; storage errors continue, in-memory acknowledgment prevents repeats, session guard prevents queued approvals; original transaction resumes once; explicit mismatch alert unchanged; unused SEED_VAULT_DEVNET_HINT removed.
Scope: original proposals 5, 7, 9 (Home tile), 10–13 were not part of this batch; owner-approved popup supersedes proposal 9. "Show up, or pay up.", "YOU SHOWED UP!", "HOLD TO STAMP", and hidden-scope pins remain.
Verification after 9: npm run typecheck passed; targeted original-design/wallet regressions: 113 tests / 13 files passed. Final full-suite result follows with A–C below; no installs, builds, adb, devnet scripts, or transactions run.
Phone-only: native popup timing/Done continuation and persistence across relaunch, wallet network switching/approval timing, disabled HOLD/note interaction, ticking deadline→MISSED→settled/gap transitions, and link visual weight need a Seeker walk; unit/source checks are not device proof.
