2026-10-08 catch-up report
Issue 1: 6e481ec9ef682aef563f69b6050ef4a9d4222c79
Schedule/confirmed claims immediately show expired outcomes and the latest open/finished state; one quiet catch-up range replaces the week-by-week walk.
Home uses ritualsForWallet; Home/detail share sequential catch-up, current-bundle readback, balance checks, ref/cross-screen locks, three-failure fallback, and foreground/unmount/send guards.
Initialize + finalize share one transaction: lib.rs 669–717, 927–977, 2270–2291 permit the same newly initialized event PDA and initialized_at == now; no intervening slot is required. Finalized readback remains mandatory.
Issue 2: 0bd3534357b253f6f9873bdca9e567457de813f0
Completed heroes and final receipts reuse tileMoney totals/formatting, omit the sent clause at zero, and keep the final missed saying absent; non-final weekly lines are unchanged.
Money text uses settled reads only, never projected cells; the demo warning and pinned phrases are unchanged.
Tests: npm run typecheck passed; catch-up/preparation focused run 557 passed; completion/history/UI focused run 45 passed.
Full npm test ran once: 2,771 passed, one stale facade-method allowlist failed; corrected in Issue 1, then its entire file passed 10/10. No second full sweep.
No installs, APK/Gradle/adb runs, devnet transactions, or edits to programs/, .keys, or docs/STATUS.md.
Device still required: six one-minute demo weeks; stamp week 1, press Android Home, receive weeks 2–6 reminders, reopen after every deadline.
Confirm immediate Finished with K,M,M,M,M,M and one closing range, atomic-send/confirmation latency, and totals after settlement; repeat by returning to Rituals Home without opening the ritual.
