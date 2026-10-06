Branch: feat/reminders. Verified code SHA: 261b2f513bcbacf5f93efb493ccdad1babd03dc9 (this report is a subsequent documentation commit).
Files: src/features/rituals/reminders/{planner,lines,storage,scheduler,service,native,runtime,useReminders}.ts; planner/lines/storage/service/wiring tests; module README.md.
Integration files: app.json, src/features/rituals/authoritativeRituals.ts, src/screens/solo/{SoloCreateScreen,SoloRitualScreen}.tsx.
Implemented: future-only chain-derived local reminders, deterministic short copy, Real-only default-on switch, one permission request, per-ritual storage, stamp/skip/removal cancellation.
Verification: 62 targeted tests passed; full npm test run once: 2,341 tests across 134 files passed; tsc --noEmit and git diff --check clean.
Unit-proven: timestamps/caps/Demo/past exclusion, copy length/banned words/determinism, storage round trip, mocked date triggers/permissions/cancellation/races/rollback, and source wiring pins.
Device-only, NOT proven here: native linkage, Android permission UI/channel, actual foreground/background delivery, reboot/Doze behavior, TalkBack and rendered layout.
Seeker 1: Parent uses a disposable TEST-wallet profile and a rebuilt native binary containing the plugin; preserve the user's existing app data. No OTA-only native upgrade.
Seeker 2: New ritual → Next → Demo: no switch. Real weeks: “Remind me each week” defaults on; toggle it with TalkBack. Selecting speed never prompts.
Seeker 3: Create two Real weeks at 5 TEST with reminders on; approve, then allow Android permission after confirmation. Background before week one's on-chain opening; check the ritual-titled alert.
Seeker 4: In a temporary read-only debug action, await expo-notifications.getAllScheduledNotificationsAsync() and AsyncStorage.getItem('@rituals/reminders/v1'); inspect actual values, then remove the instrumentation.
Seeker 5: Filter rituals:reminders:v1:<address>:; verify at most six pending requests at opens/deadline−86400/deadline−3600 (Android milliseconds; omit past times).
Seeker 6: Stamp week one and confirm; :0: disappears, :1: stays. Restart/reopen: :0: stays absent. Declaring a skip clears its skipEventIndex, not the advanced next week.
Seeker 7: Switch test wallets to expose “Remove from this phone”; remove the active test ritual. Its prefix/preference disappear, other rituals remain, and the chain is unchanged.
Seeker 8: Separate clean profile: deny permission, create again and restart—no re-prompt/crash. Demo and Real/off create add no requests. An old binary missing the module must log, not crash.
Seeker 9: Leave an unstamped Real ritual through the day/hour deadlines, including reboot/Doze; verify actual delivery and no resolution notification. Queue inspection alone is not delivery proof.
Detailed device procedure and architecture: src/features/rituals/reminders/README.md. No packages installed, APK/EAS/device/devnet actions run, or protected paths modified.
Limits: Android alarms are best effort; no exact-alarm permission added. No existing-ritual opt-in migration, cross-device background sync, tap deep-link, or automatic repair after interrupted scheduling.
Limits: granting permission later does not rebuild denied sets; foreground handler initializes on create/ritual screens, not a cold Home-only visit.
Hour-to-ship cut: if native permission/delivery cannot be verified, omit this entire feature via its isolated integration points; do not cut cancellation or permission safeguards. Clear native sets before removing an already-shipped integration.
Open question 1: Is best-effort Android timing acceptable for submission, with no exact-alarm permission request?
Open question 2: Should post-create reminder controls/retry and notification tap routing be a follow-up?
