# Solo-first execution plan (2026-09-26)

**Status: ACTIVE. This is the plan of record until submission.** It supersedes
the group-first sequencing in `2026-09-17-hackathon-submission.md` and the
"Next steps" list in STATUS.md from before 2026-09-26.

Deadline 2026-10-09 06:59 UTC · internal ship **2026-10-08**. Judged on
stickiness/PMF, UX (intuitive, polished, fun), innovation, presentation/demo
(`hackathon-winners-2026-09-26.md` §3).

## 1. Decisions (Jack, 2026-09-26) — do not relitigate

1. **Solo is the product.** Assume the user has no friends on the app. Groups
   ("With friends") are secondary but kept. Seasons are the third layer.
2. **Default check-in = honor ("Just me")**: press-and-hold → ink **stamp** +
   haptic. Optional accountability per ritual: one **non-staking witness**, or
   **photo/note proof**.
3. **Missed week goes to**: offer both, **a cause selected first**, "a person you
   pick" second. Locked before start. Rituals never receives missed stake.
4. **One declared skip per ritual** (declared before the week opens → refund).
5. **Seasons are real at submission**: app-wide shared ritual (e.g. "October Run
   Club"), live honest counter ("3 people ran today") + join. Each participant is
   solo with own stake + destination. Never pooled, no mutual confirmation, no
   money leaderboards. Show count only (no names) for submission.
6. **Visual direction = Proof & people structure + Hand-made texture/stamps.**
   Reference: `sketches/ui-2026-09-26-solo/` (index.html, NOTES.md, shots/).
   Handwriting only at commitment moments. Jack loves the stamps.
7. Deploy approved: redeploy the program to devnet with solo (+ season id). Old
   devnet rituals and older APKs become unreadable; accepted.
8. Tagline **"Show up, or pay up."** unchanged (pinned by test).

## 1b. Phase status (2026-09-28 ~11:00 CDT; details in docs/STATUS.md RESUME HERE)

- A: done (B2 deferred to Phase E). B: **deployed to devnet** (slot 504946601).
  C: built; home, create 1–3 and the Season screen walked on the Seeker, six
  device bugs fixed (2,146 tests). Demo cause live; devnet smoke honor + miss green.
- **D: next.** Final APK is on the phone, pointed at Season slug
  `october-run-club-d1` (created on chain only when Jack says go). 3 approvals:
  join/create → hold to stamp → settle → receipt.
- Parked until after the phone test: voided-week display + witness "question".
- E (Oct 3–8): not started.

## 2. Current truth (verified 2026-09-26 15:00 CDT — historical, see 1b)

- `design/crew` @ 57fed01 (pushed): Suggest fix, Crew lobby, research, sketches.
  tsc clean, **2,011 tests / 79 files** green.
- `feat/solo-program` (worktree `~/projects/preflight-solo`) @ f5a0ff2 (pushed):
  `create_solo_ritual`, `declare_skip`, solo settlement, self-forfeit guard
  (6068), TS client adoption. Native **186/186**. NOT deployed. It merged
  design/crew at 3e41273 only — **merge current design/crew in before building.**
- Program facts on that branch: honor needs no new work (with
  `additional_confirmation_threshold == 0` a claim is Confirmed immediately,
  `lib.rs` claim_completion). Witness = `Option<Pubkey>` on Ritual. Missing:
  **season id** field and anything countable for Seasons.
- **Proven on the Seeker today with Jack's fingerprint (group path):**
  Create+host fund in 1 approval `23Hwtf2h…` (Ritual
  `CGw8DYbwQnzh9bv9cDJvXqzEQt5qMmS88EG6UN5Gmu7S`); last-member Fund+Activate in
  1 approval `5qdDRUw6…` → Active 2/2. Claim/approve/settle NOT done on device
  (see bug B1). Full lifecycle green on devnet by script this morning
  (`smoke-app-lifecycle.ts`, Ritual `5Yi3kod7…`).
- No `react-native-reanimated`, no camera/image-picker installed. Motion = RN
  `Animated`. Photo proof = new native dep → ask Jack before adding.

## 3. Bugs found on the device today (fix in Phase A)

| # | Bug | Where | Fix |
|---|---|---|---|
| B1 | Demo speed still starts week 1 on **next same weekday** (+7 days when today). Only the gap between weeks is 3 min. Blocks any on-device claim/settle | `RitualFundingLobbyScreen.tsx` `firstEventAt = nextWeekdayOccurrence(...)`; `domain/rituals/schedule.ts` | When `cadence.accelerated`, first event opens ~now+120 s (check program min-lead constraint in create validation). Test: demo schedule event 0 opens within 5 min |
| B2 | Phantom shows app as **"github.com"** with GitHub icon | `src/utils/useAuthorization.tsx:104` `APP_IDENTITY.uri` | **Deferred to Phase E (Jack, 2026-09-26 evening).** Fix when the repo goes public. A custom Rituals domain is a maybe, very low priority; don't spend time on it before then. Needs a Rituals-owned https origin + icon path (check MWA identity rules: relative icon to uri) |
| B3 | No warning before jumping to Phantom; Jack thought Phantom was "inside" Rituals and got lost | every wallet action (lobby, RitualAction) | Pre-handoff sheet/line: "Opening Phantom to approve. Come back here when it's done." + busy state; after return show result. Document Android notification-permission prompt in Phantom cancelling the first approval |
| B4 | Ritual detail shows "I did it"/claim (disabled) + dev copy while Funding | `RitualDetailScreen.tsx` | Funding state shows funding progress + invite, no claim affordance |
| B5 | Join screen renders full base64 invite, buttons pushed off-screen | `JoinRitualScreen.tsx` | single-line truncated field, buttons above fold |
| B6 | Fund screen dev copy ("Member 1 · Da59U…", "Read the current Ritual before every action", "Authoritative readback complete") | `RitualActionScreen.tsx` | Crew copy, people tiles (reuse lobby pattern) |
| B7 | Switching wallet = hidden top-left menu → Disconnect → Connect | top bar | fold into group flow rebuild; solo avoids it |
| B8 | Copy-invite button leaves adb clipboard empty (fine on device?) | lobby | verify on device only; low priority |

## 4. Phases

### Phase A — device-blocking fixes on `design/crew` (~0.5 day)
B1, B3, B4, B5, B6 (B2 deferred to Phase E). RED test first for each (source/unit tests, as existing
screen tests do). Rebuild APK, install, screenshot each fixed screen.

### Phase B — program: solo + seasons, one redeploy (~1 day)
Work in `~/projects/preflight-solo` on `feat/solo-program`.
1. `git merge origin/design/crew` (keep both; resolve IDL/test-count docs).
2. Add season support with the **smallest honest onchain shape**. Recommended:
   - `Season` PDA (`["season", season_id]`): id, title digest, cadence,
     start/end, authority, `participant_count`, and per-event-index
     `checked_in_count[16]` (or a day bucket) incremented by claim/confirm on
     rituals that carry `season: Option<Pubkey>`.
   - `create_solo_ritual` takes optional season; validates cadence/schedule
     match the season template; increments participant_count.
   - Counter increments must be in the same instruction as the claim so the
     number can't lie; never touches money.
   - Alternative if time is short: `season_id: Option<[u8;32]>` on Ritual +
     client-side count via `getProgramAccounts` memcmp. Cheaper, still real,
     but RPC-heavy and 429-prone on public devnet. Decide in Phase B step 2
     after sizing; record the decision in `solo-rituals.md`.
3. Destination "person": already works (any token account of stake mint not
   owned by creator/witness). Cause: create a labelled demo beneficiary token
   account on devnet ("Northside Food Bank (demo)"), address in
   `programIds.ts`.
4. Native tests (settlement rows in `solo-rituals.md` §3, season counter,
   season mismatch rejection). Keep 186 green.
5. Rebuild IDL → client decoders/builders/tests.
6. **Deploy** with `scripts/deploy-devnet.sh` (authority `ETQ9…hXbx`,
   `.keys/`); re-run `verify-devnet-config.ts`; create the demo Season(s) and
   the cause account; smoke: solo honor create→claim→finalize, solo
   miss→destination, witness approve, declare_skip, season count increments.
   Add `scripts/smoke-solo.ts`.

### Phase C — solo screens from the sketch (~1.5 days)
Build against `sketches/ui-2026-09-26-solo/` + `docs/DESIGN.md` (update DESIGN.md
first with: stamp component, paper grain, handwriting face (pick one, e.g.
Caveat via expo-font), missed-week rules, Season card). Fix the sketch issues
noted below while building.
1. Home (empty + active): solo invitation, active solo posters with week strip,
   Season card with live count. Label "Seasons" not "People nearby"; drop the
   "Recent" filler card.
2. Create in 3 steps: intention (existing Suggest) → Who keeps you honest
   (Just me default / + one witness / With friends→existing group flow) + proof
   (none / note; photo later) → stake + destination (cause first / person) +
   skip + "the promise" signature card → ONE approval → stamp.
3. Check-in: HoldButton (already built, unwired) → stamp animation + success
   haptic; optional note.
4. Witness view ("Did Jack make it?") — reuse ConfirmationInbox logic.
5. Declared skip + missed week ("That's a week, not a verdict.") — no red.
6. Receipt: kept vs went-to-cause. **Different marks**: success stamp "KEPT"
   vs quieter miss mark (sketch wrongly uses "KEPT THE RULE" for a miss and a
   red box — both violate DESIGN rule 4).
7. Season screen: honest count, your status, join → creates linked solo
   ritual.
Group screens: keep working; restyle lobby/join/fund copy (B5/B6) only.

### Phase D — device proof, solo first (~0.5 day, needs Jack ~10 min)
See runbook §5. Solo honor ritual on the Seeker: create (1 fingerprint) → wait
~2 min (demo speed) → hold-to-stamp claim (1 fingerprint) → finalize → receipt.
Then a deliberate miss → destination receipt. Then join a Season and watch the
count move. Optional: witness path with wallet 2.

### Phase E — submission (Oct 3–8)
B2 app identity (see §3). Demo video 90–120 s per `hackathon-winners-2026-09-26.md` §4 (open on an active
solo ritual + the human problem; stamp moment; Season count; receipt), README,
pitch, public repo, release APK, dApp Store assets, organizer questions (see
STATUS "Organizer questions still unsent"), final QA, Jack's approval.

## 5. Phone test runbook (lessons from 2026-09-26)

- Drive the Seeker with `./scripts/adb.sh` and `scripts/ui.py` (wrap in
  `timeout 30`). `tapt` matches substrings — a page title can equal the button
  label (hit "Fund & start ritual" title instead of button); prefer
  `tapt "<accessibilityLabel>"` or `tap x y` from `dump`.
- Install: `adb install` blocks on a **Play Protect** dialog; tap "Don't send"
  while the install runs (run install in background, then tapt).
- Hermes does all navigation/typing; **Jack only does fingerprints** and Phantom
  account switching (Phantom's account list is behind biometrics).
- Before any wallet step tell Jack exactly what Phantom will show (e.g. "-8.5
  Unknown" = stake+fee in TEST; "Account 2" = host Da59…).
- Phantom's first approval may be cancelled by Android's notification-permission
  prompt; Jack must not swipe Rituals away from recents mid-approval (kills the
  MWA session — that is what failed at 14:42).
- Phantom accounts on the Seeker: Account 2 = host `Da59…VmV`, Account 3 =
  wallet 2 `98W4…WjLa`. Both ~200 TEST.
- adb clipboard read doesn't work; use in-app "Preview join terms" / "Paste from
  clipboard" instead.
- Log capture: `./scripts/adb.sh logcat -v time | grep -E "\[rituals\]|MobileWalletAdapter"`.
- Chain check: `solana transaction-history -u devnet <wallet> --limit 1
  --show-transactions`; schedule: `npx tsx scripts/ritual-schedule.ts <ritual>`.
- Serve sketches to the phone: `python3 -m http.server 8766` in the sketch dir
  (background) + `./scripts/adb.sh reverse tcp:8766 tcp:8766`.

## 6. Risks

- Season counter design is the only new onchain surface; keep money paths
  untouched and test conservation unchanged.
- Public devnet 429s (seen all day). A dedicated RPC needs Jack's signup.
- Camera proof = native dep + rebuild; default to note-only.
- Scope: if Phase B slips past 2026-09-29, fall back to `season_id` on Ritual +
  client count, and cut witness UI before cutting Seasons.
