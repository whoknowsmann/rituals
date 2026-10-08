Branch: opus/home-2026-10-08; implementation SHA: 1268fcb8c2184ba38f1df01f721ceb52cdfcbb6a (base 5b5e2cd).
Baseline before edits: npm test — 148 files / 2,584 tests passed.
Final: npm run typecheck passed; full npm test run once after implementation — 151 files / 2,614 tests passed; git diff --check passed.
1 — 4214f4b: Completed/Ended under “Finished · N”, collapsed initially; session-only toggle + chevron; expanded tiles at 0.82 opacity. Stamp-needed active tiles first; “+ New ritual” remains last in the active grid.
1 tests: homeSections (5), Home screen (9); finished-only Home retains “Start a ritual?” / “Start one” above Finished, including without chain time.
2 — 2e13002: “{back} of {total} tSKR back”; unread/incomplete outcomes show “{total} tSKR”. Exact formatAtomic values; settled kept + refunded skips; Ended includes the eject refund, excludes forfeits. Accessibility uses the same money line.
2 tests: tileMoney (8), soloHistory (5): loading, zero, stamped-but-unsettled, skips, misses, Ended, decimals, actual receipt bytes and mismatches. Kept the money line; removed “1 of 4 kept”; retained stamped closing-time text.
3 — 9bf1338: compact kept = white dot; missed = white ✕ at 0.8 opacity; upcoming = hollow; current = stronger ring; skipped = hollow with −; unknown closed = existing neutral mark.
3 tests: weekStripLogic (8), soloHistory (5); per-cell labels include “Week 2 missed” / “Week 6 skipped”. Existing large ✓/✕ punch card rendering unchanged.
4 — 1268fcb: Home and Settings share <=100-key getMultipleAccountsInfoAndContext batches; existing decoders, canonical checks, minimum slots and retry/backoff retained. Settings failures offer “Try again”.
4 tests: batchedRitualBundles (9), authoritativeRituals (12), Settings (5); related eight-file suite passed (94 tests). Fake connection: ten Ended bundles = one call; ten active bundles = two calls (discovery + full snapshots); chunk boundaries and advancing weeks covered.
Skipped: no requested item. Hidden group tiles stay total-only: no solo return outcomes to infer from. No decoder rewrite or progressive-loading fallback needed.
Phone-only checks: glyph/opacity contrast in both themes, money-line wrapping, collapse/session behaviour, TalkBack navigation, and actual Home/Settings loading time with the remembered list. No phone latency claim.
No installs, APK builds, prebuild/gradle, adb, devnet scripts or transactions run. programs/, .keys and docs/STATUS.md unchanged; pre-existing untracked node_modules symlink left untouched.
