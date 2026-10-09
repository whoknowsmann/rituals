# Rituals bug hunt — 2026-10-08

Scope: astra/bughunt-2026-10-08 from 2c909c7; app only; no installs, builds or transactions.
Status: audit in progress. Each fix requires an observed failing regression test before the code change.

| class | bug | evidence (test or file:line) | severity | fixed (SHA) / not fixed (why) |
| --- | --- | --- | --- | --- |
| C1 | Wallet/faucet/receipt outcome audit pending | — | — | not fixed: investigating |
| C2 | Transition-state audit pending | — | — | not fixed: investigating |
| C3 | Detail catch-up settles while disconnected/another wallet is connected | useCatchup.test.ts: never starts detail catch-up (both failed before fix) | high | fixed: pending commit |
| C3 | Faucet results, recovery, reminders and detail-local data cross wallet boundaries | audit in progress | high | not fixed: investigating |
| C4 | Resume, reminders and clock audit pending | — | — | not fixed: investigating |
| C5 | Money audit pending; create amount UI excluded | — | — | not fixed: owner decision pending on create |
| C6 | First/final-week audit pending | — | — | not fixed: investigating |
| C7 | Retry precondition audit pending | — | — | not fixed: investigating |

Verification: pending targeted regressions, typecheck and full test suite.

## device checks for Jack
- Pending findings; no device actions run during this hunt.
