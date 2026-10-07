Verdict: ship with fixes; demo nudges are best-effort reminders, not dependable 45-second alarms.
MEDIUM — FIXED 63635a2: cancel pending AND delivered alerts; reconcile expired/advanced/completed weeks; confirmed skip clears its captured target without another RPC read.
HIGH — FIXED cc9f5db: late demo copy no longer claims “is open”; it states the full UTC stamp deadline, and create warns about late delivery. README updated.
LOW — FIXED 7a56f6e: new demo nudges suppress foreground alert/sound; Real-weeks handler behavior is retained.
MEDIUM — NOT FIXED: background Android delivery can follow close/finish; Expo 0.29.14 has no delivery-time local expiry gate. Channel/trigger tweaks cannot fix precision; no exact-alarm permissions added.
MEDIUM — NOT FIXED: kill mid-enqueue/native failures can leave incomplete sets; automatic repair needs a persisted scheduling journal. Normal JS restart does not recreate/duplicate the native queue.
LOW — NOT FIXED: wallet switching retains old-wallet alerts by existing phone-scoped design; removing a ritual clears only its own prefix.
LOW — NOT FIXED: cold Home-only foreground Real alerts have no handler until create/ritual mounts; pre-existing initialization scope preserved. Old untagged requests retain the old policy.
LOW — NOT FIXED: FACTS.md still says Real-only; outside requested edit scope, and demo device proof remains pending. Feature README/report describe this branch accurately.
PASS: future-only, capped 16 weeks; Real open/day/hour (coincident times deduplicated); demo one open-stage id per eligible week; stamped/skipped exclusions persist.
PASS: demo :<zero-based-week>:open matches cancellation; confirmed-create guard, mount/remount behavior, serialized operations and exact ritual prefixes prevent ordinary duplicates.
PASS: default-on toggle for both speeds; prompt only after confirmed create/readback, once; denial/missing native do not reject actions; slow permission DROPS elapsed openings, never postpones them.
PASS: deterministic authored copy, <=60 Unicode code points, FACTS “Words” restrictions checked, no mocking; user-entered titles are retained rather than censored.
Tap: inspected source launches/resumes app (cold Home); no notification navigation/deep-link handler. Native no-crash behavior still needs device proof.
Tests: npm run typecheck PASS; full npm test ONCE: 2,453 tests / 140 files PASS (provided baseline 2,420 / 138); reminder subset 93 / 7 PASS. Native/hook tests use mocks.
Prior device proof (user-provided): Real weeks scheduled 3 alarms, opening delivered on time, cleared on stamp; not re-run here and not evidence for demo timing.
Device-only: actual late/Doze delivery, queue+tray cleanup on stamp/skip/removal/expiry, foreground suppression, slow/denied permission, warm/cold taps, reboot survival and old-binary fallback.
Constraints respected: no installs/build/prebuild/Gradle/adb/devnet runs; docs/STATUS.md, programs/, .keys and the node_modules symlink unchanged. Branch: fix/reminders-final.
