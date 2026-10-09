# Rituals bug hunt — 2026-10-08

Scope: astra/bughunt-2026-10-08 from 2c909c7; app only; no installs, builds or transactions.
Status: audit in progress. Each fix requires an observed failing regression test before the code change.

| class | bug | evidence (test or file:line) | severity | fixed (SHA) / not fixed (why) |
| --- | --- | --- | --- | --- |
| C1 | Cancel-after-signing still said “Nothing was sent” for stamp/settle/End early | lifecycleMachine.test.ts unresolved cases; actionRecoveryHooks.test.ts; eject.test.ts wiring | high | fixed: b559780 |
| C1 | Faucet promises unconfirmed credit; timeout misses balance refresh; minimum funding implies any stake fits | devnetFaucet.test.ts uncertain-response regressions | medium | fixed: fd4c640 |
| C2/C6 | Detail/receipt re-read accepts older slots; route changes show the previous week for one render | authoritativeRituals.transition.test.ts: route identity + slot regressions | medium | fixed: f57f83a |
| C3 | Detail catch-up settles while disconnected/another wallet is connected | useCatchup.test.ts: never starts detail catch-up (both failed before fix) | high | fixed: 462d4c5 |
| C3 | Faucet result/request survives A→none→B→A; late A response refreshes old balance | useDevnetFaucet.test.ts: 4 regressions failed before fix | high | fixed: 51fa962 |
| C3 | Recovery resolves/removes another wallet's journal and shows its notice; creates omit owner | usePendingRitualRecovery.test.ts; both buildCreateDeps journal tests | high | fixed: bf38f28; ownerless legacy journals retained silently |
| C2/C3 | Settings keeps A's list/end flow while B loads; detail/receipt show A's notes and stamps | walletBoundaries.test.ts source guards (RN device check pending) | high | fixed: d924fab |
| C3/C4 | Reminder ownership/restore audit | audit in progress | high | not fixed: investigating |
| C4 | Resume, reminders and clock audit pending | — | — | not fixed: investigating |
| C5 | Money audit pending; create amount UI excluded | — | — | not fixed: owner decision pending on create |
| C6 | Final stamp/receipt still draws “Same time next week.”, including 1-week rituals | sayings.test.ts: final-week regressions failed for 1/2/16 | medium | fixed: pending commit |
| C7 | Retry precondition audit pending | — | — | not fixed: investigating |

Verification: pending targeted regressions, typecheck and full test suite.

## device checks for Jack
- Pending findings; no device actions run during this hunt.
