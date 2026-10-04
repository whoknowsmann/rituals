# Status

**Read this first at the start of a session.** It is the single source of truth
for where Rituals actually is. Everything here is measured, not inherited.

Last verified: **2026-09-28 ~11:00 CDT** (feat/solo-screens @ 906d577 + docs:
tsc clean, **2,146 tests / 99 files**; solo + Seasons program **deployed** on
devnet slot 504946601; devnet smoke honor 8/8 + miss 9/9; final APK installed
on the Seeker; phone test NOT yet run)
Deadline: **2026-10-09 06:59 UTC** (01:59 CDT) · internal ship target **2026-10-08**

## How to re-verify in one minute

Do this instead of trusting any prose, including this file:

```bash
cd ~/projects/preflight-solo               # active worktree (feat/solo-screens)
git log --oneline -8                       # what actually landed
npm test                                   # real test count
npx tsx scripts/verify-devnet-config.ts    # live chain matches the client
./scripts/check-device.sh                  # Seeker, profiles, wallets
```

If a document disagrees with those four commands, the document is wrong. Fix it.

## START HERE (2026-10-02)

**Plan of record: `docs/plans/single-blade-2026-10-02.md`.** Jack chose solo
only: "put a stake on a weekly promise, stamp it to keep it, miss and it goes to
a cause you chose." Seasons, With friends, witness, Join and person-destination
are hidden from the UI (code and program support kept) and move to "coming soon".

**Fold done 2026-10-02 (9d6a387).** `SOLO_ONLY` in
`src/features/rituals/productScope.ts` hides friends, Join, Seasons, witness,
the person destination and the proof chooser (code kept; pinned by
`productScope.test.ts`). Create is 2 steps. Solo cadence `DEMO_SOLO_CADENCE`:
120 s lead, 300 s check-in, 60 s grace, 390 s period (group keeps
`DEMO_CADENCE`). Note line at every stamp. tsc clean, 2,201 tests / 116 files.
`smoke-app-solo.ts` (now defaults to the shipped cadence) GREEN on devnet:
ritual `A2JUhMiyW8xC3SnGdHAue1mLPoWHmLGsjwo6hYLBrfv`, settle `4HS6Z8of…`.
**d4 (9d6a387) INSTALLED** on the Seeker 10:25:57 (Play Protect: "Don't
send"); walked to the wallet prompt (`artifacts/shots/d4-*`). Build with
`TAG=dN scripts/build-apk-local.sh`.

Next actions, in order:
00000. **2026-10-04 UI pass (Jack's list), d15 (35c5101) on the Seeker:** "ritual"
       everywhere; stamp lines from a basket of sayings (`solo/sayings.ts`,
       stable per week); HOLD without hint text; punch card ✓/✕/NOW/numbers +
       summary line; Home = 2-column tiles, colour per ritual (`ritualTint`),
       status pill, "+ New ritual" tile, kept/missed via one batched read;
       night mode (`theme/ThemeMode.tsx`: follows the phone, sun/moon toggle
       in the top bar, remembered; solo screens + crew components use
       `themedStyles`/`useColors`; group screens stay light-only); finished
       rituals say so. Checked in day + night by screenshot. Cron
       `rituals-make-repo-public` (job cd4e3bd1e174) flips the repo public Wed
       Oct 7 01:59 CDT after a history secrets scan, reports to Telegram.
0000. **2026-10-04 13:05: d9 (88df452) on the Seeker, confirmed by Jack.** Big
      centered hold button (1.4 s fill, ring, quarter ticks, buzz), one Seed
      Vault approval for the stamp (`4xe8aAVa…`), confetti + stamp shown once
      (the double pop came from the screen remounting on every re-read; fixed
      by keeping the last read while re-reading). Seed Vault devnet card shows
      on create. Still open from the list below: Seed Vault menu path for the
      hint, github.com identity, approval expiry, Home strip counting misses.
000. **Phone run 2026-10-03 14:01–14:32 on d7 (b072773) with Seed Vault Wallet
     (account "test" = Da59…8VmV, wallet set to Devnet): the lean journey
     works.** Create `5pvSmzMg…` (1 approval, settle key funded inside it;
     Seed Vault rewrote our priority fee and the app verified the landed tx),
     week 1 lapsed → app closed it alone (MISSED), week 2 lapsed → closed
     alone, week 3 stamped `GvCKwWNg…` (1 approval) → settled alone → KEPT
     receipt with the note. User signatures for the whole run: create + stamp.
     Devnet smokes green: `smoke-app-solo-d5.log` (2 weeks, settle key) and
     `smoke-app-solo-feechange.log` (`--simulate-wallet-fee-change`).
     Fixed today: missed-week decoder + finalize expectation (a222120), settle
     key + note wipe + stale errors (2eba2bb), wallet fee rewrite (39d411d),
     next week's stamp after a missed week (b072773).
     Open items found:
     - Seed Vault Wallet defaults to mainnet: a judge gets "Network mismatch"
       and must switch the wallet to Devnet. Say so in the app (detect the
       error) and in the submission instructions.
     - Seed Vault shows "We don't recognize this domain" for the github.com
       identity: plan item 8 (Pages origin) is now more important.
     - Approvals expire ~60 s after the app builds the tx (blockhash): two
       attempts timed out today while the user was away from the screen.
     - Home week strip counts missed weeks as done ("2 of 4 done", ✓).
     - Log line "wallet.fee-adjusted failed" is a note, not a failure.
     - Untracked `scripts/diag-event-decode.ts`: never run; delete.
00. **2026-10-03 morning (Hermes, Jack at soccer): lean-approvals build, NOT
    yet proven on devnet or the phone.** Commits a222120 + 2eba2bb on
    feat/solo-screens (local; tsc clean, 2,215 tests / 118 files):
    - Bug c root cause: the app decoder rejected a solo missed week (program
      writes Settled + full forfeit, decoder only allowed the group shape) and
      the finalize expectation predicted group `Voided`. Both fixed, RED-first.
    - Settle key (`src/features/rituals/solo/settler/`): one per install,
      pre-paid inside the create approval (one capped SystemProgram transfer,
      `settlerBudgetLamports` = 0.001 + 0.002/week SOL, cap 0.05). The ritual
      screen opens and settles finished weeks with it, no wallet prompt; the
      wallet button stays as a fallback. Demo journey = create + 1 stamp/week.
    - Bug a (note wipe) and bug b (dead Settle) fixed; "Week N opens"; the
      promise name on the card.
    - **Blocked while Jack was away** (approval prompts timed out, not
      retried): the devnet smoke (`smoke-app-solo.ts` now runs 2 weeks: kept,
      then missed, both settled by the settle key, missed week read back via
      the app reader; ~15 min), the d5 build and install. Run those first.
    - Untracked `scripts/diag-event-decode.ts` was never run; delete it.
0. **Phone run 2026-10-02 22:36–22:56 (d4, Account 3, all 5 approvals landed):**
   create `2fzCdUmH…` (ritual not yet looked up), stamp+note `2SenhKnX…`, settle
   `3XSyyTHu…` → KEPT receipt OK; close week 2 `579JaKUy…`, settle week 2
   `3TJeaE7x…` (cause 2→7 TEST, vault 15→10, wallet unchanged). Recording:
   `/sdcard/rituals-run-01..10.mp4` (3-min segments; pull them). Bugs to fix
   before the video, RED test first:
   a. **Note wiped at settle.** SoloRitualScreen shares one `confirmedAction`
      ref across claim/skip/settle; when settle confirms and resets, the stale
      confirmed claim handler re-runs and `saveWeekNote(0, '')` deletes the
      note, so the KEPT receipt shows none. Fix: per-action handled digests +
      never write an empty note over an existing one.
   b. **Settle dead after "may have gone through".** Phantom didn't return
      after the close; bringing Rituals forward left the settle action in a
      non-retryable error, and the re-read "Settle this week" button did
      nothing. Leaving and reopening the screen worked. Fix: reset the action
      after the screen re-reads chain state that moved on.
   c. **Missed week never shown.** After settling week 2 the screen jumps to
      week 3: no missed stamp, W2 not marked, no week 2 receipt link, even
      after a fresh mount. Hypothesis (unverified): `getEventBundle` throws
      for a settled week with no claim account and `useSoloRitualBundle`
      drops it (`.catch(() => null)`). Check the reader first.
   d. Copy: week 1 waiting says "Next week opens…"; Poster title is "Keep the
      promise", not the ritual's name.
   e. **TOP PRIORITY (Jack): approvals must be lean.** Every approval in this
      run cost 4+ steps in Phantom on the Seeker (unlock, often twice →
      approve → Seed Vault approve → unlock again). "This can't be in the
      submission." Levers: (1) test Seed Vault Wallet directly as the demo
      wallet (check devnet support first); (2) fewer signatures: close+settle
      of a missed week in one tx, and settle the previous week inside the next
      stamp, so the user signs only create + one stamp per week; (3) fallback:
      Phantom auto-lock timer and a non-Seed-Vault Phantom account (verify).
      **Measured from logcat** (`artifacts/logs/run-2026-10-02-logcat.txt`):
      Rituals opens the wallet once per action (one `transact`: cached-token
      `authorize` + one `signAndSendTransactions`). Inside that, every approval
      had 5 fingerprint prompts + 2 approve taps (~20 s): Phantom unlock →
      cancelled 1.5 s later by Phantom's own `REQUEST_PERMISSIONS` (permission
      unknown; POST_NOTIFICATIONS is already denied+fixed) → unlock again →
      Phantom approve + fingerprint → Seed Vault approve + fingerprint
      (Account 3 is a Seed Vault key) → Phantom re-locks on return →
      fingerprint. All wallet-side; none comes from our code.
1. ~~Fold, build d4, install, walk.~~ Done.
2. Jack's phone run with screen recording (plan §3 #2). Timeline from tapping
   Approve: week 1 opens ~2 min, stamp window 5 min, settle ~1 min after it
   closes; week 2 opens ~30 s later, let it lapse (~6 min), Close + Settle.
3. Rewrite the submission docs for the single blade (they still lead with
   Seasons, friends and witness).

Verified 2026-10-01 23:30: `feat/solo-screens` @ f7dba9c clean and pushed,
tsc clean, 2,189 tests / 113 files, `smoke-app-solo.ts` green on devnet.

## RESUME HERE — handoff 2026-09-28 ("lets begin rituals")

### Update 2026-10-01 night (Hermes) — phone run found 2 bugs; fixed; plan written

**Read first: `docs/plans/scope-to-place-2026-10-02.md`** (Jack asked for a
focused plan to place; it has the freeze list and the day-by-day to Oct 7).

Phone run 2026-10-01 ~21:00 on d2 (Season d1, 300 s window):
- Approval 1 (create + stake + activate) **landed on chain**
  (`5vXvpDLb…`, ritual `7gKe46R1kjyQJUi2N442h6LTTgzFg8nmd2yQQ6Cq5EAw`, 80 TEST,
  Season "1 person in"), but the app said **"Confirmation incomplete"**.
- HOLD to stamp failed **before Phantom opened**: "Ritual event was not found".
  Week 1 lapsed. That ritual is abandoned devnet test data.
- Root causes (both client-side; program fine):
  1. the reader throws `not-found` for an unopened week; the claim path expected
     `{ event: null }`, so initialize + claim was never prepared;
  2. the confirmation check required `Funding` for 'created' even inside the
     solo create + fund + activate bundle, which reads back `Active`.
- **Fixed in b3757fc** with RED-first unit tests, plus
  `scripts/smoke-app-solo.ts`, which drives the screens' own modules on devnet:
  old code fails at create with the device error; fixed code passes create,
  stamp (InitializeCurrentEvent + ClaimCompletion, Ok), settle (FinalizeEvent,
  Ok). Run it before every APK build.
- Season d1 is spent; app now points at **d2 = `DUiLHsXdck8C5m8Rw5qxBV6KcYSQYxN89C64DrvYNKVx`**
  (not created). Next run: `init-demo-season.ts … --slug october-run-club-d2
  --claim-window-seconds 300`.
- **APK `artifacts/rituals-d3.apk` (from b3757fc) is BUILT and staged but NOT
  installed**: the install command needed approval while Jack was away. Phone
  still has d2 (has both bugs). Install first thing next session
  (`adb push` then `adb shell pm install -r`).

### Update 2026-09-30 (Hermes, Jack away; phone test still NOT run)

- Re-verified: HEAD clean + pushed, tsc clean, **2,146 tests / 99 files**,
  `verify-devnet-config` 5/5 PASS, Season d1 not created, Account 3 = 0.0999948
  SOL + 192 TEST, APK from 2026-09-28 10:52 still installed.
- **WSL DNS trap:** Node devnet scripts fail ("RPC request failed") because the
  WSL resolver hangs ~20 s on AAAA lookups. Run them with an IPv4 preload:
  `NODE_OPTIONS="--require <path>/ipv4-only.cjs"` (copy in the
  solana-mobile-app-development skill, `scripts/ipv4-only.cjs`; recipe in
  `docs/DEVELOPMENT.md`). `init-demo-season.ts` needs it too. The phone is unaffected.
- **Submission drafts rewritten for solo-first** on branch
  `docs/submission-solo` (worktree `~/projects/rituals-submission-solo`, 2e56a68):
  README, video script, pitch, store/privacy, repo audit, organizer email, plus
  PRODUCT/ARCHITECTURE/SECURITY/DEVELOPMENT reconciled. Not merged here yet.
- **SKR correction:** the reader and tiers exist and are tested, but no screen
  calls them, so no discount is live. Decide: wire it into create review, or drop the claim.
- Voided-week RED tests moved into the repo: `docs/parked/voided-week-red-tests.patch`.
- **Wider stamp window, no rebuild:** `init-demo-season.ts` now takes
  `--claim-window-seconds N` (plus optional `--grace-seconds`, `--period-seconds`;
  defaults unchanged at 90/60/180). A Season ritual inherits the Season's windows
  from chain. Proven on devnet with throwaway Season `window-probe-0930`
  (`8zUyyxKHcSaFAqZRqmEmeZAtZpg4i6Dzb42YGqKxN2P3`, 300 s check-in):
  `smoke-solo --path honor` 8/8 PASS (join, stamp, settle; Season counts 1/1),
  ritual `4oPfTucKJC6ABFtEwEVRQWyUdDMVfamVLV46dQfZ8u2c`. **For the phone test add
  `--claim-window-seconds 300`** to the d1 create command below (Phantom took
  ~70 s of 90 s last time). App-side reading of the wider window is
  code-reviewed, not yet seen on the phone.
- Dead-end UI pass in progress overnight (branches `fix/dead-ends-create`,
  `fix/dead-ends-misc`); see the 2026-10-01 update when it lands.
- Phone-test steps below are unchanged.

### Update 2026-10-01 ~00:40 (Hermes, overnight) — dead-end pass landed

Jack reported buttons that "don't do anything" (typed "call mom", tapped a
suggestion, nothing visible happened). Walked every screen on the phone and
audited the code; fixed on `fix/dead-ends-create` (7d930ac) +
`fix/dead-ends-misc` (79abdf5), merged on **`integrate/dead-ends` (9e8781c)**:
tsc clean, **2,185 tests / 113 files**. Fast-forwarded into `feat/solo-screens`
(rollback point if needed: c48c5c3).

- Create step 1: chosen suggestion shows a border, green band and "✓ Chosen"; no
  card looks pre-selected; editing the text clears a stale choice.
- Create: Back (header or Android) on step 2/3 goes back one step and keeps input.
- Proof "Note": was silently discarded. Now: chosen at create ("Add a line when
  you check in. Kept on this phone."), typed above HOLD, saved on-device after
  the stamp confirms, shown under the stamp and on the KEPT receipt.
- Witness: creator gets "Your witness" card with **Send to your witness** (share
  sheet) + Copy address. Witness pastes it into **Join with a link** → routed to
  the confirm screen (wrong wallet / no wallet get a plain message). Before this
  no screen led to WitnessConfirm at all.
- Home: "LIVE NOW" only when a Season was read; missing → "No Season running
  right now."; failed read → "Couldn't load the Season." + Try again.
- Join: helper line under the input. Settings: devnet-only info screen (testnet
  picker removed; the program does not exist on testnet).
- Group review copy no longer promises an edit flow that doesn't exist.

**APK `artifacts/rituals-d2.apk` (built from 9e8781c) is INSTALLED** on the
Seeker (`lastUpdateTime=2026-10-01 00:24:52`). Walked by Hermes on device: Home
Season line, Settings, Join helper, suggestion select (before/after screenshots
`artifacts/shots/d2-*`), Back across steps keeps input + Note selection, group
review copy. Not walkable without wallet approvals: note-on-stamp, receipt
note, witness share/confirm.

- Install note: `adb install -r` from the Windows temp path hung (rc 124) this
  time; `adb push` to `/data/local/tmp` then `adb shell pm install -r` worked
  in seconds. `monkey -p … LAUNCHER` did not foreground the app;
  `am start -n com.whoknowsmann.rituals/.MainActivity` did.
- Devnet witness smoke: the smoke witness keypair was unfunded (first run failed
  "debit an account but found no record of a prior credit" at approve).
  Funded it 0.05 devnet SOL from the deployer; rerun: claim Pending → approve →
  Confirmed → settled, 9/9 PASS (ritual `ANDdF71RfJRhbj7yeGyV376nWK3rzKoerfc9GvYWehu5`).

**Morning, when Jack says go:** create d1 with the wider window:

```bash
cd ~/projects/preflight-solo
export NODE_OPTIONS="--require $HOME/.hermes/skills/software-development/solana-mobile-app-development/scripts/ipv4-only.cjs"
npx tsx scripts/init-demo-season.ts --url https://api.devnet.solana.com \
  --authority-keypair ../preflight/.keys/rituals-devnet-deployer.json \
  --slug october-run-club-d2 --title 'October Run Club' --lead-minutes 8 --claim-window-seconds 300   # d1 spent 10-01
```

Then the phone steps below (3 approvals). Optionally pick **Note** on step 2 to
see a note land under the stamp and on the receipt.

**Active line: `feat/solo-screens` in the worktree `~/projects/preflight-solo`.**
Not `~/projects/preflight` (design/crew, behind). Plan of record:
`docs/plans/solo-first-2026-09-26.md` (decisions §1 are final). Runbook:
`docs/plans/solo-smoke.md`.

### Start here in the morning (in order)

The only thing left before Phase E is **Phase D: the solo phone test with
Jack** (3 Phantom approvals, ~15 min). Everything that did not need him is done.

1. **Re-verify** (commands above). Expect HEAD ≥ the docs commit after 906d577
   and **2,146 tests**. `./scripts/check-device.sh`: Seeker `SM02G40619100656`
   on USB; Rituals installed (`lastUpdateTime=2026-09-28 10:52`, build
   `artifacts/rituals-d1.apk` = 906d577).
2. **Check the phone wallet** (Phantom **Account 3** `98W4zJfQDk9F5qjtLTgWTYBRdETT3JgUqY7dBNT9WjLa`):
   last read 2026-09-28 11:00 = **0.0999948 SOL, 192 TEST**.
   `spl-token accounts --owner <addr> -u devnet` (not `spl-token balance --owner`,
   which printed nothing).
3. **When Jack says "go" (at the phone, Phantom on Account 3), create the Season.**
   The installed APK already points at slug `october-run-club-d1` =
   `BjLpWbSxmfgQTKSvFQ23AhsvEbKM5DNzRpuoXCNZTUDz` (NOT created yet; since d2 home shows
   "No Season running right now." until it is). **No rebuild needed.**
   ```bash
   cd ~/projects/preflight-solo
   npx tsx scripts/init-demo-season.ts --url https://api.devnet.solana.com \
     --authority-keypair ../preflight/.keys/rituals-devnet-deployer.json \
     --slug october-run-club-d1 --title 'October Run Club' --lead-minutes 8 \
     --claim-window-seconds 300   # 2026-10-01: 5-min stamp window; see update above
   ```
   `--lead-minutes 8`: joins close when week 1 opens, and a joined ritual uses
   the Season's schedule, so the stamp can't happen until week 1 opens. 8 min =
   time to join, without a long wait. If d1 already exists and has started, use
   a new slug: `npx tsx scripts/season-address.ts october-run-club-d2`, put the
   address in `src/data/rituals/demoConfig.ts`, rebuild (~4 min), install, then init.
4. **Phone run** (Hermes drives with `scripts/ui.py`, Jack only approves;
   tell him what Phantom will show before each approval):
   1. Home → Seasons card → Open → **Join** → type a promise → Next → Just me →
      Next → stake 5 TEST, cause = Northside Food Bank (demo) →
      **Approve & make it real** (approval 1: 16 weeks × 5 = 80 TEST + the
      activation fee). Expect the PROMISE MADE stamp, then Season shows
      **"1 person in"** (first devnet proof of `participant_count`).
   2. When week 1 opens: **hold to stamp** (approval 2). **The claim window is
      only 90 s** (`DEMO_CLAIM_WINDOW_SECONDS`), and Phantom's unlock + approve +
      Seed Vault took ~70 s once on 2026-09-25: start the hold the moment the week
      opens and approve promptly. Expect SHOWED UP + Season "1 checked in this week"
      (first devnet proof of `checked_in_count`).
   3. After the week closes ("This week is closing" → about 60 s later
      "ready to settle"): **Settle this week** (approval 3) → **See week 1
      receipt** → KEPT.
   4. Screenshot every screen (`scripts/ui.py shot <name>` → `artifacts/shots/`).
      Log: `./scripts/adb.sh logcat -v time | grep -E "\[rituals\]|MobileWalletAdapter"`.
5. Record the results (signatures, screenshots, anything that broke) here and in
   the Hub roadmap in the same commit. Then Phase E.

### Where things are (verified 2026-09-28 ~11:00 CDT)

| Branch (private repo whoknowsmann/rituals) | Head | State |
|---|---|---|
| `feat/solo-screens` (worktree `~/projects/preflight-solo`) | 906d577 + docs (pushed) | A+B+C merged, device-walk fixes in. tsc clean, **2,146 tests / 99 files**. |
| `feat/solo-program` | ab104ed (pushed) | Program + client. Native **197/197**. Ancestor of solo-screens. |
| `design/crew` (worktree `~/projects/preflight`) | b3dca32 (pushed) | Phase A only. Behind; don't develop here. |

`tmp/solo-{a..d}` worktrees and branches were deleted 2026-09-27 (all merged).

Phases:
- **A (device bugs) — done.** B2 (Phantom shows "github.com") **deferred to
  Phase E by Jack**; custom domain is a low-priority maybe. Don't raise it.
- **B (program) — DEPLOYED to devnet 2026-09-27** (details below). Season PDA
  `["season", id]`: `participant_count` +1 on **activation**, `checked_in_count[16]`
  +1 in the instruction that makes a claim Confirmed. One-approval solo
  create+fund+activate.
- **C (solo screens) — built; partly proven on the device.** Walked on the
  Seeker 2026-09-28: home, create steps 1–3, Season screen before week 1
  (Join, 16 weeks carried into the promise) and after ("Joining has closed").
  **Not yet on a device:** the ritual screen after create, hold-to-stamp,
  closing/settle, receipt, skip, witness. Those need wallet approvals and are
  the phone test.
- **D — next** (above). **E** (Oct 3–8) not started.

### Devnet fixtures and keys (all devnet-only; every key checked 0 mainnet)

| What | Address | Notes |
|---|---|---|
| Program | `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` | slot 504946601 |
| Demo cause "Northside Food Bank (demo)" | `4adFBqT1x7AyBFF4bd8qVgeSjPbqhnaJVB4x5muMzbT5` | owner `AZStJSV45Awq4VRzmkoTUpQQvrTVmfDW95p2whpDkv2R` (`.keys/rituals-demo-cause-owner.json`) |
| Demo Season `october-run-club-d1` | `BjLpWbSxmfgQTKSvFQ23AhsvEbKM5DNzRpuoXCNZTUDz` | **not created**; baked into the installed APK |
| Rehearsal Season `october-run-club-d0` | `DNpU8RU7b6tX6T1EKdc1Ex37sBPPNmER4g4GaGQYofGq` | created 10:38, closed 10:50; harmless leftover |
| Deployer / upgrade + Season authority | `ETQ9czekQJSebxkWn986Hao15FfEbe1345cZZDrHhXbx` | `../preflight/.keys/rituals-devnet-deployer.json`, ~4.59 SOL, TEST mint authority |
| Smoke owner | `fT9XeAmW56Yu8X1UNLQX7xeHU98nKs9WkZUSiVLJgo1` | `.keys/rituals-solo-smoke-owner.json`, TEST ATA `EKe5U5A4…A1R9` |
| Smoke witness | `3kLFDY5QWdMqXPXzPk4hzgwJ7CW5J53SbMPbXtSkVtF5` | `.keys/rituals-solo-smoke-witness.json`, unfunded |
| Phone: Phantom Account 3 | `98W4zJfQDk9F5qjtLTgWTYBRdETT3JgUqY7dBNT9WjLa` | 0.1 SOL, 192 TEST (the phone is connected as this) |
| Phone: Phantom Account 2 | `Da59UWdaoBej5xdX9atiaZahMYLxJNsdXHVY6GMh8VmV` | 0.075 SOL, 191.5 TEST |

**Never `~/.config/solana/id.json`** (Jack's real mainnet wallet).

### Devnet — deployed 2026-09-27 evening

- Program `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` upgraded to the solo +
  Seasons build: slot **504946601**, upgrade tx
  `3sgj1H6mMvmPSfWShXYKyKMtX6xMQs8gxpnby88XaAoWkk2CYVH6hMfmpn89XhBvFLAsvmVL8KFYtAaVvNLoTmB7`,
  ProgramData 855,304 B (extended by 131,704). `solana program dump` equals
  `target/deploy/rituals.so` byte for byte (zero padding after). sha256 of the
  .so starts `8468b614d497ea81`. `verify-devnet-config.ts`: all assertions PASS
  (ProtocolConfig untouched, no re-init).
- Old devnet rituals and older APKs no longer decode (accepted by Jack).
- Deployer `ETQ9…hXbx` has ~4.92 devnet SOL left.
- **How it was deployed (the CLI could not do it from here):** `solana program
  deploy` failed 5 times ("Max retries exceeded" on TPU writes; 429s through the
  public RPC). What worked: `scripts/write-program-buffer.ts` fills an existing
  buffer with paced RPC writes (3/s, only mismatched chunks, re-reads until the
  buffer equals the .so; 4 rounds, ~10 min), then `solana program extend` +
  `solana program upgrade <buffer> <program>`. Buffer keypair:
  `.keys/rituals-deploy-buffer.json` (gitignored; consumed by the upgrade).
  Next time, write the buffer with the script first; don't spend an hour on
  `program deploy` retries.

### Done 2026-09-28 morning (Hermes, before the phone test)

- **Demo cause live:** `Northside Food Bank (demo)` = TEST token account
  `4adFBqT1x7AyBFF4bd8qVgeSjPbqhnaJVB4x5muMzbT5`, owner `AZSt…kv2R`
  (devnet-only, 0 mainnet), committed in `demoConfig.ts` (931ebff).
- **Devnet smoke, honor + miss only** (Jack: keep testing proportionate), smoke
  owner `fT9X…Jgo1`: honor 8/8 (ritual `6SbCLhxh…`, Settled, Confirmed, exact
  conservation); miss 9/9 (ritual `EGdxRY22…`, cause got exactly the week's
  allocation, creator got nothing). **Run WITHOUT a Season**, so the Season
  counters are proven on the local validator only (35/35); the phone test is
  their first devnet proof.
- **Device walk found and fixed (all RED-first, pushed):**
  - ff8bbc7 home showed "Your rituals are out of reach": one pre-upgrade
    ritual (`CGw8…`, 909 B, no longer decodes) failed `Promise.all`.
  - 6910948 step 1 "Next" was dead unless a suggestion card was tapped, with
    no visible error; solo cards said "a friend confirms".
  - 8e86249 the promise ran for `suggestions[0]`'s weeks, not the tapped card's;
    step 3 now shows weeks + total; "LOCKED BEFORE YOU START" no longer clips.
  - 4e53ece (read against the program) Settle was offered from the deadline
    but finalize needs `now > resolution`; a no-check-in week stayed "open"
    forever; chain time never ticked on screen; no link to the receipt.
  - ecccb71 Season offered Join after week 1 (program rejects it); "1 people in".
  - 88cd8c2 home never reloaded on focus (new promise invisible until restart);
    no "Make another promise" once you have one.

### After the phone test

- Phase E (Oct 3–8): demo video, README, pitch, public repo + B2 app identity,
  release APK, dApp Store assets, organizer questions. Only with Jack's approval.

Known gaps (not in the solo demo path; deliberately after the phone test):
- A week voided without a verdict (witness questioned it, or never answered)
  renders wrong: the receipt shows KEPT with the ink stamp, the ritual screen
  offers "Settle" on an already-voided event, and a declared skip shows as ✓
  in the week strip. The witness also cannot question (no "I didn't see it").
  RED tests are parked in the repo at `docs/parked/voided-week-red-tests.patch`
  (7 failing tests; `git apply` it to resume). The original scratch copy was
  pruned; this was rebuilt 2026-09-30 from the session transcript and re-checked
  RED (7 failed / 27 passed in `src/features/rituals/solo/lifecycle/`).
- Note proof is client-side only.

Fixed 2026-09-27 (33f6ee2): pending-action recovery rejected `declare-skip`,
`create-solo` and `create-solo-fund-and-activate`, so **"Skip this week" failed
before the wallet opened on every attempt**, and solo create never journaled
(killing the app mid-approval was unrecoverable). Both journal now.

### Tooling lessons (2026-09-27/28)

- Walk every screen on the real device before asking Jack for the phone test:
  the 2026-09-28 walk found six demo-breaking bugs that 2,109 green unit tests
  missed. Read each screen against the program's rules too (e.g. finalize only
  when `now > resolution`).
- `scripts/ui.py tapt` matches substrings: "Make a promise" hit the title
  "Make a promise to yourself." Tap buttons by the coordinates from `dump`.
- The Season address is compiled into the APK, but it is a deterministic PDA of
  its slug, so build with `scripts/season-address.ts <slug>` first and create
  the Season on chain only when the phone test starts.

- A background command's log read while it is still running is not its result:
  a 429 mid-deploy was reported as "no buffer created" while the CLI went on to
  create one holding 3.68 SOL. Check `solana program show --buffers` after any
  failed deploy and close or reuse what is there.
- `solana program deploy` prints the ephemeral buffer's recovery seed phrase
  into its output/log. Use a named `--buffer` keypair file so nothing sensitive
  lands in logs and a failed write can resume.

- Approval-gated commands (`rm -rf`, `python -c`, `script -e`) block when Jack
  is away, and a blocked command ends the workflow. Keep cleanup out of the
  command chains that do the real work.
- Use `terminal(background=true)` for solana-test-validator (the tool refuses
  nohup/setsid). Ports: rpc 18899, faucet 19900, gossip 18000, dynamic 18100-18200.
- The runbook's local recipe needs a separate cause-owner keypair (fixed in cb98397).

## Previous handoff — 2026-09-26 afternoon

Phase A bugs B1–B8 were found on the phone. Group Create+host-fund `23Hwtf2h…`
and last-member Fund+Activate `5qdDRUw6…` on Ritual `CGw8DYbw…Gmu7S` → Active
2/2, signed by Jack on the Seeker. Phantom Account 2 = host `Da59…VmV`, Account
3 = wallet 2 `98W4…WjLa`. The APK on the Seeker is from 0c258ce (Phase A without
the amount/week-opens polish).

## Previous handoff — 2026-09-25 late

### Branches

- `design/crew` — **the working branch.** Crew scaffolding + solo proposal +
  all MWA fixes below (merged from `fix/mwa-diagnostics`) + fbe363f (fonts
  actually loaded, light shell) + bundles A/B/C. tsc clean, 1,996 tests / 77 files. Pushed.
- Overnight 2026-09-25 agent branches:
  - `feat/fewer-signatures` — **merged** (bundles A create+host-fund, C
    init-event+claim). Devnet proofs: A `4GhDiJM9…`, B `2CctpZh9…`,
    C `t2x5kJTb…` (all 1 signer, Status Ok, re-verified by Hermes).
  - `feat/fund-activate` — **merged** (bundle B: last member's fund+activate
    in one approval, via the app orchestrator: `5utpbQFu…`, re-verified).
    Prompts per 2-person journey now **host 5 (was 7), member 2 (was 3)**.
  - `feat/crew-home` — **merged** (Crew home + HoldButton, not yet wired).
    Checked on the Seeker 22:46 (empty state): fonts render, wordmark clip
    and duplicate top-bar title fixed. Screenshot `artifacts/shots/crew-home-2.png`.
    **APK now on the phone = design/crew (Crew home + bundles A/B/C)**;
    fallback `rituals-ab55204.apk` in `C:\Users\hound\AppData\Local\Temp\rituals\`.
  - `feat/solo-program` — NOT merged, NOT deployed. `create_solo_ritual`,
    `declare_skip`, solo settlement; native 181/181 (re-run by Hermes).
    Ritual layout 909→977 bytes, so deploying breaks decoding of existing
    devnet rituals and the current APK — needs Jack's go-ahead.
    2026-09-26: self-forfeit guard (6068 `ForfeitDestinationOwnedByParticipant`),
    5 negative tests, TS client adoption committed + pushed (55509ba, f5a0ff2);
    native **186/186**, tsc clean, 1,996 TS tests. Remaining: rollout plan,
    then Jack's go-ahead to redeploy.
- `fix/mwa-diagnostics` — `overnight/mobile-integration` + only the MWA fixes
  (ab774fd diag, 2a4ec29 compute budget/classification/stale auth, ab55204
  retry state). **The APK on the Seeker (installed 21:47) is ab55204** — ready
  for the next phone session; also saved as
  `C:\Users\hound\AppData\Local\Temp\rituals\rituals-ab55204.apk`.
- `overnight/mobile-integration` — previous stable app (f91054d).
- Nothing merged to main yet.

### Decisions Jack made

- **UI direction: C "Crew"** (light, social feed, friends as the interface),
  B "Ring" saved as the alternative. Sketches `sketches/ui-2026-09/`, spec
  `docs/DESIGN.md`, research `docs/plans/ui-direction-2026-09.md`.
- **Tagline is "Show up, or pay up."** — pinned by test; never replace it.
- **Solo rituals in submission scope** (§6 of `docs/plans/solo-rituals.md`):
  cause/charity-style default destination; non-staking witness; one declared
  skip per ritual; cohorts design-only / coming soon.
- Jack's feedback 2026-09-25: **3–4 approval taps per signature is annoying.**

### Fewer-signatures checkpoint — 2026-09-25

`feat/fund-activate` wires Bundle B into the prepared-action client. The last
unfunded member is selected from the authoritative funding bitmap only before
the first window opens and after stake/fee vault checks; their one-signer
transaction is Fund + Activate with combined readback. The host Activate action
remains available as a standalone fallback for rituals funded by an older build.
The measured two-person journey is now host **5** prompts / member **2** prompts
with A+B+C; see `docs/plans/fewer-signatures.md` for signatures and cost.

### MWA gate — 2026-09-25 evening: MWA signing PROVEN on the Seeker

| Time | Result | Cause |
|---|---|---|
| 20:33 | nothing sent | Phantom's notification-permission dialog cancelled its biometric unlock; Rituals swiped away killed the MWA session |
| 20:44 | nothing sent | cached auth token for `Da59…` while Phantom's active account was `2Xrz…m7Xa` → `auth_token not valid for signing` |
| 20:48 | **landed** (`4RbVZJqL…`, Ritual `2KmtR3…vQ3g`) but app said "Nothing was sent" | Phantom inserted its own ComputeBudget limit+price (it does so whenever a tx has none), signed *its* message; our exact-bytes check rejected it |
| 21:09 | nothing sent | MWA `Timed out waiting for response` (~2 min). Log shows ~70 s from first biometric to the approve screen, then Seed Vault. Assumed: slow approval exceeded the wallet timeout (not proven) |
| 21:13 | **landed** (`3PkBnAG7…`, Ritual `7vcEUApV…`), **our** budget ixs, fee 0.0000052 SOL, but screen still showed the old error | retry from a retryable error was ignored by the state machine (fixed ab55204) |

Fixes (all tested; RED shown on old code before GREEN):
- 2a4ec29 — prepared txs carry `SetComputeUnitLimit(200k)` +
  `SetComputeUnitPrice(1000 µlamports)`; any failure after the wallet returns a
  signature is marked `submitted` (+signature journaled for recovery) so the UI
  says "may have gone through"; `auth_token not valid` clears the cached
  authorization. Devnet: `smoke-app-lifecycle.ts` exit 0 with the budget ixs.
- ab55204 — Create and lifecycle machines accept PREPARE from a retryable
  error (the button was enabled but did nothing visible).

Where the 3–4 taps come from (logcat, one signature): Phantom biometric unlock →
Phantom approve → **Seed Vault** sign screen + biometric (Phantom on Seeker signs
via Seed Vault) → Phantom biometric again. Rituals itself requests one
authorize (reused token) + one signAndSend. Levers we control: fewer signatures
per journey (e.g. Create + host Fund in one tx), and testing Seed Vault Wallet
directly as the demo wallet.

Leftover devnet rituals (unfunded, not saved on the phone, harmless):
`2KmtR3Mf9C4xfPQqud88aBFrTY3PaN3XDBBX6VgwvQ3g`, `7vcEUApV7mMDHuZV688zBWxiUMBcdmtS3yTVLyGHqu1k`.

### Next steps, in order

0. **2026-09-26 morning (Hermes, Jack away):**
   - Suggest fixed + on the Seeker (c146762, a490455): titles in the user's own
     words, button always responds, results scroll into view, quiet chips.
   - Funding lobby rebuilt in Crew (c8355c1): poster, "You / Friend 2" tiles,
     no red waiting state, "Demo speed" instead of DEMO MODE. On the Seeker.
   - `smoke-app-lifecycle.ts` full lifecycle green on devnet (ritual
     `5Yi3kod7…`, finalize `29b2cR9J…`, both Finalized).
   - Phone MWA Create reached Phantom's biometric; cancel → "Nothing was sent…
     safely try again" (correct). Phantom then sat on "Unlock Phantom" and
     ignored Back; relaunching Rituals recovered. The fingerprint run still
     needs Jack.
   - Research: `docs/plans/hackathon-winners-2026-09-26.md`,
     `docs/plans/ui-warmth-research-2026-09-26.md`. Sketches (3 warmer takes):
     `sketches/ui-2026-09-26/` (per-screen PNGs in `shots/`). Awaiting Jack's pick.
   - Note: `react-native-reanimated` and any camera/image-picker module are
     NOT installed (the design notes assume reanimated). Motion today = RN
     `Animated`; photo proof needs a new native dep + Jack's approval.

1. **Phone (needs Jack):** install a build containing ab55204, Create once →
   expect "Ritual created" + invite. Then Fund from test wallet 2, claim,
   approve, settle. Approve promptly (<~45 s) and stay in Phantom until it
   returns.
2. Cut signatures per journey (Create + host Fund combined; evaluate Seed Vault
   Wallet directly).
3. Solo program changes (1 member when solo, non-staking witness, locked
   destination, solo settlement, `declare_skip`) + native tests + devnet
   redeploy (upgrade authority `ETQ9…hXbx`). See overnight notes below.
4. ~~Finish Crew scaffolding~~ done fbe363f (fonts, dark StatusBar, `color.bg`
   chrome). `headerTitle: ''` deferred until screens own hero titles.
5. Rebuild screens once in Crew covering solo + group (merged Create flow,
   "Just me / With one witness / With friends" first; fix Suggest; cut
   developer copy).
6. Friends' share page of the sketches (not built).

### Solo program changes — `feat/solo-program`

- Implemented additive solo instructions: `create_solo_ritual` and
  `declare_skip`.
- Solo rituals persist one host member, an optional non-staking witness, a
  locked token-account destination for missed stake, and one declared skip.
  Solo settlement refunds confirmed check-ins, refunds unresolved/questioned
  claims, and routes an unclaimed event allocation to the locked destination.
- Group lifecycle paths remain covered by the existing native suite.
- Measured native result: `cd program-tests && cargo test --locked` — **181
  passed, 0 failed** across 15 test binaries; focused `solo_ritual` — **5
  passed, 0 failed**. The pre-change baseline was **176 passed, 0 failed**.
- `anchor build` passed and emitted `target/deploy/rituals.so` (675,592 bytes).
  No deploy, upgrade, or cluster transaction was run.
- The generated IDL adds two instructions and `RitualKind`, and extends
  `Ritual` from 909 to 977 bytes. The frozen TypeScript IDL was not overwritten;
  the exact client work is recorded in
  `docs/plans/solo-program-client-delta.md`.

### Device / chain facts (verified 2026-09-25)

- Seeker `SM02G40619100656` on USB, dev mode; always drive it via
  `./scripts/adb.sh` (Windows adb.exe), never Linux `adb`.
- Wallets (devnet; all hold 0 mainnet value):
  - Phantom host `Da59UWdaoBej5xdX9atiaZahMYLxJNsdXHVY6GMh8VmV` — 0.1 SOL, 200 TEST
  - **Phantom test wallet 2** `98W4zJfQDk9F5qjtLTgWTYBRdETT3JgUqY7dBNT9WjLa` —
    funded 2026-09-25: 0.1 SOL, 200 TEST (from the Hub Roadmap note)
  - CLI friend `DNZKvXpftZ4PmFAGmSEZJLH3zxURVoZgwJNmcEUYgYsA` (`.keys/`)
  - Deployer `ETQ9czekQJSebxkWn986Hao15FfEbe1345cZZDrHhXbx` (~1.34 SOL, TEST
    mint authority, program upgrade authority)
- A host cannot also be a member: each member must be a distinct wallet
  (that's why Jack needed wallet 2).
- Tooling for UI checks: `scripts/ui.py` (dump / tapt "label" / type / swipe /
  back / shot → `artifacts/shots/`). Wrap calls in `timeout 30`: a Play Protect
  dialog on install can block uiautomator. Answer it "Don't send".

### Local builds

```bash
cd ~/projects/preflight
export JAVA_HOME=$HOME/.local/jdk/jdk-17.0.20.1+1 PATH=$HOME/.local/jdk/jdk-17.0.20.1+1/bin:$PATH
EAS_LOCAL_BUILD_WORKINGDIR=$HOME/.cache/eas-local-build \
  npx eas-cli build --local --profile preview --platform android --non-interactive \
  --output artifacts/rituals-local.apk      # ~2.5 min warm; retry on "GraphQL request failed"
cp artifacts/rituals-local.apk /mnt/c/Users/hound/AppData/Local/Temp/rituals/
./scripts/adb.sh install -r 'C:\Users\hound\AppData\Local\Temp\rituals\rituals-local.apk'
```

JDK 17 is required (system Java 21 has no javac). Install from a Windows path
(a `\\wsl$` path hangs adb). Stop Gradle with `./gradlew --stop` in the build
dir, never `pkill -f GradleDaemon` (it kills the agent's own shell).

### Fixed this session (all on device)

- 97752e8 — every template showed "This ritual link is invalid" (screens
  re-validated non-draft shapes); regression test walks the real screen chain.
- 4a6a2d9 — wallet choice: stock MWA always opened Seed Vault Wallet; a
  postinstall patch (`scripts/patch-mwa-wallet-package.mjs`) pins the intent to
  the chosen wallet. Seed Vault + Phantom offered at every connect point.
- 7fb437e — tagline restored; stale "fixture mode" copy removed.
- b0023fe — **Create failed before Phantom opened ("fee context is stale")**:
  web3.js 1.x drops `minContextSlot` on getFeeForMessage; fixed with
  `feeForMessageAtSlot`. Added `[rituals]` failure logging
  (`adb logcat | grep '\[rituals\]'`). Wallet back-out now reads as "declined".

### Known UX debt (Jack's feedback)

"Clunky, a lot going on, very AI coded." Title shown twice per screen, narration
under everything, red for normal states, developer strings (DEMO MODE,
Deployment ready), addresses instead of people, four screens to create one
ritual, Suggest looks broken (results below the fold, canned). All addressed by
the Crew rebuild in step 5.

## History

### Session 2026-09-24 evening (after WSL restart)

- First local builds; JDK 17 requirement discovered. Review-invalid bug fixed.
  Wallet choice added. Tagline restored. EAS cloud build 27961a41 (48c4bfd)
  predates the Review fix — do not use it.

## The one-line state

The protocol, typed client, **and the app's own screen-level lifecycle code** are
proven on devnet with CLI keypairs: `scripts/smoke-app-lifecycle.ts` drives
create → fund ×2 → activate → initialize event → claim → friend approves →
finalize through the same orchestrators and state machines the screens use,
exit 0. **2026-09-25: Create signed through MWA from the Seeker landed twice on
devnet** (see RESUME HERE). The remaining unproven link is the full two-wallet
lifecycle signed on the phone.

## Done and verified

- Anchor program deployed to devnet, slot 500137332; upgraded to solo + Seasons 2026-09-27, slot 504946601
- ProtocolConfig initialized; live state asserted against the client contract
- Valueless SPL TEST mint (6 decimals), mint authority held locally
- Full hero flow as real transactions (raw builders): 17/17 assertions,
  settlement conservation exact, protocol takes nothing
- **2026-09-24: full hero flow through the app-level modules** (Ritual
  `DywcbrgStUoR3tY6mbtKRCGXy8EWGGenhcJRs8ep1VZm`, finalize
  `3NpnJJYX…8439e`): pool 2,000,000 / payout 2,000,000 / forfeited 1,000,000 /
  remaining stake 2,000,000
- **Reload recovery** for in-flight transactions: pending records journaled at
  wallet handoff; resolver classifies from chain after a restart. Proven on
  devnet by `scripts/smoke-reload-recovery.ts`
- Invite/join (digest-bound, only after confirmed Create; join validates against
  chain) — unit-tested only
- Home, detail, claim, confirmation inbox, receipt screens read authoritative
  chain state (known rituals persisted locally; fixtures are labeled demo-only)
- Fund, Activate, InitializeEvent, Claim, Approve, Question, Finalize wired
  through one generalized lifecycle machine with pending-action journaling
- Transient public-RPC read failures (429, min-context-slot) are retried with
  bounded backoff; submission is never retried
- SKR balance read + activation-fee discount branch
- Ritual suggestions in the template picker (deterministic, on-device)
- Dark + gold design system; commitment-device copy
- APK (first-pass build 9066ad0) built by EAS; earlier build installed on the
  Seeker and launched clean

Measured 2026-09-24: **1,942 JS/TS tests across 70 files**, `tsc --noEmit`
clean, **180 native program test functions**; `cargo test` re-run
2026-09-25: 176 passed, 0 failed (count of executed tests).

## The next gate

**Full two-wallet lifecycle signed via MWA on the Seeker** (Create is proven —
see RESUME HERE). Host `Da59…VmV` and member test wallet 2 `98W4…WjLa` are both
Phantom accounts on the personal profile (user 0); Jack switches the active
account in Phantom between host and member steps, then reconnects in Rituals.
The app now clears a stale auth token automatically when Phantom rejects it.

What tooling cannot see: Phantom's storage is app-private (not debuggable,
device unrooted). Wallet addresses come from Jack — public addresses only,
never seed phrases or private keys.

Costs measured on devnet, so nobody over-farms faucets:

| Item | Cost |
|---|---|
| Token account rent | 0.001488 SOL |
| Ritual account rent | ~0.0027–0.0067 SOL |
| Create all-in (ritual + 2 vaults + fees) | ~0.01 SOL |
| Recommended wallet balance | 0.1 SOL |

The stake asset is the TEST mint, not SOL. Mint authority is local, so TEST can
be issued on demand — no faucet needed for stake.

Local funding sources: deployer `ETQ9czekQJSebxkWn986Hao15FfEbe1345cZZDrHhXbx`
(~1.5 SOL after 2026-09-24 smokes, holds TEST) and a devnet friend keypair
`DNZKvXpftZ4PmFAGmSEZJLH3zxURVoZgwJNmcEUYgYsA` (~0.3 SOL) that can act as member
2 from the CLI. Keys live in `.keys/` and are gitignored.

Note: **Create needs only one signer** (the host). A second wallet matters only
for Fund and Friend Confirm, and the CLI friend keypair can cover those until the
demo is filmed.

## After that gate, in order

1. Wallet-signed two-wallet lifecycle on the Seeker (invite → join → fund →
   activate → claim → approve → finalize) — screens are wired, device unproven
2. Merge `overnight/mobile-integration` to main after the phone run
3. Icon, splash, adaptive icon, accessibility, Seeker-size QA
4. Signed standalone APK verified on the Seeker
5. Demo video, pitch deck, screenshots, privacy copy (drafts on branch
   `overnight/submission-materials`)
6. Public-repo cleanup (audit on that branch: no secrets found in history;
   remove `sketches/`, `spikes/`, internal plans) then **make the repo public**
   and update the MWA wallet identity URI
7. Integrated adversarial pass, then ship

## Open risks

**Public devnet RPC is rate-limited.** Every smoke run sees 429s. Reads now
retry, but the phone demo should use a dedicated devnet RPC endpoint (needs Jack
to sign up for a free key). Filming against the public endpoint risks visible
stalls.

**Reload recovery — now implemented, device-unproven.** Proven on devnet by
script; the real MWA background/kill path on Android has not been exercised. Test
it on the Seeker before filming; if it misbehaves, the video must avoid it.

**Organizer questions still unsent.** Two remain, both eligibility rather than
scoring: is devnet with valueless tokens acceptable as "meaningful interaction
with the Solana network," and what disclosure does dApp Store review expect for a
commitment device. Drafts are ready in the Hub (`Clock In Organizer Questions`).
Being wrong on either is disqualification or a dead 30-day publication clock, not
a lost point.

**Rubric disagreement.** The live Align API lists AI 20 / SKR 20 / UX 15 / UI 15 /
Innovation 15 / Ecosystem Impact 15. Terms §8.1 lists four equal 25% criteria with
no AI or SKR, and the terms say they prevail. SKR's balance reader and tiers are implemented and tested but NOT wired into any screen (checked 2026-09-30), so no discount is live. The
"AI" surface is the deterministic on-device suggestions picker — that was a
deliberate choice so nothing can fail mid-demo, but **do not describe it as AI in
the submission**; a judge who finds decorative AI scores it worse than none.

**Repo is private.** A public source repository is a submission requirement.

## Correction log

Mistakes worth not repeating.

- `scripts/check-device.sh` reported Rituals as "not installed" while it was
  installed and running. Cause: piping adb into `grep -q` made grep exit on first
  match, adb died with SIGPIPE (141), and `pipefail` turned a successful match
  into a failure. Fixed in ca9937c. Lesson: capture adb output to a variable
  before matching, and distrust a clean-looking negative from a `pipefail` script.
- Status docs claimed `not-deployed` for a full day after devnet deployment,
  which caused a later session to brief Jack from stale prose. Lesson: when a
  gate flips, update `docs/STATUS.md` in the same commit.
- Test counts drifted (docs said 1,758/56; actual 1,906/65). Lesson: measure, or
  omit the number.
- Landed transactions were reported "sent but could not be confirmed" (seen on
  Approve and Activate). Cause: public devnet load-balances reads, so the
  post-confirmation readback hit a lagging node (-32016) or a 429 and the client
  treated one failed read as final. Fixed in 77348d2 with bounded read-only
  retry. Lesson: before assuming a protocol bug, check the transaction on-chain;
  here `solana confirm -v` showed `Status: Ok` while the app said failure.
- The app smoke's settlement assertion failed although settlement was exact:
  on devnet the host token account is also the fee recipient, so the activation
  fee skewed the baseline. Lesson: check for account aliasing before trusting a
  balance-delta assertion.
- Create failed on every phone attempt with "Could not create the ritual.
  Nothing was sent." The UI hid the cause by design, so it looked like a wallet
  problem. Real cause (found only after adding `[rituals]` logging): web3.js 1.x
  silently drops `minContextSlot` on `getFeeForMessage`, a lagging devnet node
  answered, and the preparer correctly rejected the stale fee. The CLI smoke
  never exercised that path. Lesson: log the real error name at every failure
  point; a smoke that bypasses the app's transport proves nothing about it.
- Unit tests per route helper all passed while the real Create → Review →
  Roster → Lobby chain failed on device. Lesson: test the hand-offs between
  screens, through a JSON round trip, not each helper alone.
