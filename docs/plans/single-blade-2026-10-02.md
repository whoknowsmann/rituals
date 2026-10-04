# Rituals: the single blade (plan of record, 2026-10-02)

Supersedes `scope-to-place-2026-10-02.md` (written 2 hours earlier; it still
kept Seasons and the group flow, and Jack chose to cut harder).

**Decision (Jack, 2026-10-01 night): solo user only.** The whole submission is
one sentence:

> Put a stake on a weekly promise. Show up and stamp it to keep it. Miss, and
> that week's stake goes to a cause you chose.

Why (research in `hackathon-winners-2026-09-26.md`): the closest past winners
(Kinlog, Echo, NOMI, Seek) are single loops a judge gets in one sentence. The
terms rubric is half UX + presentation. Our breadth already cost us: the 8 dead
buttons found 10-01 were nearly all in side features, while the core loop had
never completed on the phone and both 10-01 phone bugs were on that one path.

**Deadline:** Fri Oct 9, 01:59 CDT (06:59 UTC, Align API; re-check on submit
day). **Submit by Wed Oct 7, 8pm CDT.**

## 1. State at handoff (verified 2026-10-01 ~23:30 CDT)

- Repo `~/projects/preflight-solo`, branch `feat/solo-screens` @ `f7dba9c`
  (docs) on `b3757fc` (stamp + create-confirm fixes). Clean, pushed.
  tsc clean; vitest **2,189 / 113 files**.
- `scripts/smoke-app-solo.ts` (drives the screens' own modules on devnet):
  RED on pre-fix code, GREEN on b3757fc (create, stamp, settle all `Ok`).
- **APK `artifacts/rituals-d3.apk` (from b3757fc) is built and staged in
  `C:\Users\hound\AppData\Local\Temp\rituals\` but NOT installed.** The phone
  still has d2, which has both bugs. Install via `adb push` to
  `/data/local/tmp` then `adb shell pm install -r` (plain `adb install` hangs).
- Program unchanged: `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p`, config
  `7LMgBSJmEFKkfYKh2znr6VSxcm5QEHEouNijXDENhMd1`. **No program changes before Oct 8.**
- Phone wallet: Phantom Account 3 `98W4zJfQDk9F5qjtLTgWTYBRdETT3JgUqY7dBNT9WjLa`,
  devnet 0.0912 SOL / 110.4 TEST after the 10-01 run (enough for a 4-week
  promise at 5 TEST/week).
- Season d1 spent. App points at d2 PDA `DUiLHsXd…` (not created); Seasons are
  hidden by the fold below, so it shouldn't be needed.

## 2. The fold (first job, Hermes, Fri Oct 2)

**What a judge sees after the fold:**
- **Home:** "Make a promise" + your active rituals. Nothing else interactive.
- **Create, 2 steps:** (1) What are you promising? (text + suggestions with the
  chosen state). (2) Stake each week + cause + the promise card + **one**
  approval (create + stake + activate).
- **Ritual screen:** week strip, hold to stamp (optional one-line note above
  HOLD), "Skip next week", settle, link to receipt.
- **Receipt:** KEPT / missed ("That's a week, not a verdict.") / skipped, with
  the note if one was written.
- **Settings:** devnet info.

**Hide (entry points only; keep code, routes and program support):**
- With friends: Home button, create-step option, TemplatePicker → group screens
- Witness: "+ One witness", the "Your witness" card, witness routing in Join
- Join with a link: Home button
- Seasons: Home section, Season screen entry, `seasonAddress` param path
- "A person you pick" destination (cause only)
- The proof-mode chooser: offer the note line at every stamp instead (adjust
  `soloNotes` so a missing record means note allowed)

**Mechanism:** one flag (e.g. `SOLO_ONLY = true` in a small config module).
Entry points read it. Pin the hidden surfaces with a source test. No deletions.
Optionally show one plain, untappable line on Home: "With friends and Seasons:
coming soon." **No tappable "coming soon" buttons.**

**In-app timing for the demo:** standalone solo rituals currently use
`DEMO_CADENCE` (90 s check-in). Give solo create its own cadence with a
**300 s** check-in window (period ≥ claim + grace + 30). Keep the group lobby on
`DEMO_CADENCE`. Check `DEMO_SOLO_FIRST_EVENT_LEAD_SECONDS`: the video wants week
1 to open within ~2 minutes of create.

**Gates before building d4:** tsc, vitest, `smoke-app-solo.ts` (standalone, no
`--season`), then install and **walk every screen on the phone up to the
wallet prompt** (screenshots), before Jack's run.

## 3. Ship order to Wed Oct 7

| # | Item | Who | When |
|---|---|---|---|
| 1 | The fold (§2), build d4, install, walk | Hermes | Fri day |
| 2 | Phone run with `adb screenrecord`: create → stamp with note → settle → KEPT; let next week lapse → settle → missed receipt (~5 approvals) | Jack ~30 min + Hermes | Fri evening |
| 3 | Organizer email; add "will judges/voters install the APK?" | Jack | Fri |
| 4 | Visual pass on the remaining ~6 screens | Hermes; Jack thumbs up on phone | Sat |
| 5 | **Rewrite submission docs for the single blade.** The drafts on `docs/submission-solo` (README, video script, pitch outline, store/privacy) still lead with Seasons, friends and witness. Use Sonnet 5.5 writers | Hermes | Sat |
| 6 | Test-token access for judges (decision below) | Jack decides | Sat |
| 7 | Public repo + license | Jack picks license; Hermes executes + re-scans | Sat–Sun |
| 8 | MWA identity off "github.com" (GitHub Pages origin) | Hermes, Jack approves | after 7 |
| 9 | Release APK, walked end to end, on a GitHub release | Hermes | Mon |
| 10 | Video 90–120 s from real footage only | Jack voice, Hermes edit | Mon–Tue |
| 11 | Deck ~8 slides | Sonnet drafts, Jack edits | Tue |
| 12 | dApp Store kit (icon, screenshots, copy, privacy) | Hermes | Tue |
| 13 | Submit; Hermes checks every link logged-out | Jack | **Wed 8pm** |

If behind on Monday, cut 12, then 8. Never cut 2, 7, 9, 10, 13.

**SKR:** at most one evening, after 1–4: wire the existing balance reader into
the create fee line as a labeled devnet stand-in. If it isn't done by Sunday
night, remove every SKR claim from the docs. **AI:** no.

## 4. Coming soon (deck "What's next" + README only; never in the app)

- **With friends:** 2–6 people stake and confirm each other. Program live on
  devnet; group flow built; needs a UI pass.
- **Witness:** a friend confirms your check-ins and never stakes. Program,
  share, and join routing built.
- **Seasons:** shared public rituals with an honest count. Program live; needs
  long-running Seasons and a join rule that allows late joiners.
- **Pick a person** as the destination.
- **Real donation rails:** investigate **The Giving Block** (Jack's "block
  works grants or something"; confirm the name with him). It has a crypto
  donation API that issues a deposit address per donation for thousands of
  nonprofits (thegivingblock.com/developer-resources,
  docs.thegivingblock.com/docs/crypto-donation-flow). It requires their
  donor-disclosure language and likely partner onboarding. Post-hackathon.
- Photo proof, reminders, `.skr` names, Seeker Genesis badge, mainnet
  stablecoin after legal and security review.

## 5. Open decisions for Jack

1. **Test tokens for judges:** a fresh install can't make a promise, because
   there's no way to get TEST. Options: a small hosted devnet faucet behind a
   "Get test tokens" button (public service, Jack's call), or ask the
   organizers first.
2. License for the public repo.
3. Point `Anchor.toml` `wallet` at the devnet deployer, not
   `~/.config/solana/id.json` (real mainnet wallet).
4. Send the organizer email (`docs/submission/organizer-questions-email.md` on
   `docs/submission-solo`).

## 6. Working conventions (so a fresh session starts fast)

- Start: this file, then `docs/STATUS.md` (top block), then load skill
  `solana-mobile-app-development`.
- Node devnet scripts need the WSL DNS preload: `NODE_OPTIONS="--require
  $HOME/.hermes/skills/software-development/solana-mobile-app-development/scripts/ipv4-only.cjs"`.
- Device: `./scripts/adb.sh`, `scripts/ui.py` (dump / tap / type / shot); launch
  with `am start -n com.whoknowsmann.rituals/.MainActivity`.
- Local APK build: `TAG=dN scripts/build-apk-local.sh` (EAS local, JDK17 at
  `~/.local/jdk`, retries GraphQL 503, stages the APK for adb).
- Delegation (updated 2026-10-04): Anthropic models only. Writing goes to
  Sonnet 5.5 (`hermes chat -Q --oneshot --provider anthropic -m
  claude-sonnet-5-5 -t file`); code subagents also run on Anthropic (check the
  routing before dispatching), one worktree per agent, disjoint files.
- Devnet keys: `../preflight/.keys/rituals-devnet-deployer.json` (config
  authority, mint authority), `.keys/rituals-solo-smoke-owner.json`. Never the
  CLI default wallet.

## 7. Progress against the ship order (updated 2026-10-04, Hermes)

| # | Item | State |
|---|---|---|
| 1 | The fold, d4, walk | **Done** 10-02 (9d6a387). |
| 2 | Phone run, create → stamp → settle → KEPT, missed week | **Done** 10-02 on Phantom (found 3 bugs + 5 fingerprints per approval) and again 10-03/04 on **Seed Vault Wallet**: create + 1 stamp per week, weeks close by themselves. Recording of the final run still to do (item 10). |
| 3 | Organizer email | **Open (Jack).** Devnet risk now low: Monolith's Echo won while "live on devnet". |
| 4 | Visual pass | **Done** 10-04 from Jack's list: "ritual" wording, sayings on stamps, punch card, 2-column coloured tiles, night mode, big HOLD, weeks/stake controls, clean names, signed-card frame. Jack's thumbs-up on d17 pending. |
| 5 | Submission docs for the single blade | **Open (Hermes, Sonnet writers).** Drafts on `docs/submission-solo` are stale. |
| 6 | Test tokens for judges | **Open (Jack decides).** |
| 7 | Public repo + license | **Open (Jack: license).** Cron flips the repo public Wed 01:59 CDT after a secrets scan; merge to `main` + README must happen first. |
| 8 | MWA identity off github.com | **Open (Jack approves Pages).** Now more important: Seed Vault warns "We don't recognize this domain". |
| 9–13 | Release APK, video, deck, dApp Store kit, submit | Not started; video after Jack's UI thumbs-up. |

**Added 2026-10-04 evening (Jack approved; do before the video):**
- **Free: remove the activation fee.** Program change (allow zero fee + an
  authority-only `update_protocol_config`, no account layout change), devnet
  upgrade, set fee to 0, client and copy follow, drop SKR claims. Overrides
  the "no program changes before Oct 8" freeze in §1. Steps in STATUS item 1.
- **Demo / Real weeks toggle on create**, Demo default; real weeks = stamp
  any day in the first 6 days, settles on day 7; in-app "Demo speed" notice
  and a line in the video. Steps in STATUS item 2.
- UI thumbs-up given on d17; "Lock it in" / "Locked in." on d18.

Decisions made since §1 (all Jack's unless noted):
- **Demo wallet = Seed Vault Wallet** (approve + fingerprint), not Phantom
  (Phantom with a Seed Vault key costs ~5 fingerprints per approval).
- **No settle/close approvals:** the app's own settle key, pre-paid inside
  the create approval, runs the permissionless open/settle steps
  (Hermes design, Jack asked for "lean as hell").
- **Stay on devnet** with the valueless TEST token; mainnet only after the
  hackathon (dApp Store publication within 30 days of a win).
- Night mode follows the phone with a sun/moon override; "ritual" everywhere;
  stamp sayings may be cheeky but never mock a miss.
- Delegation: Jack upgraded to the Claude Max plan (2026-10-04) and wants
  Anthropic models for subagents; no GPT subagents are running.
