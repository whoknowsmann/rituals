# Submission package plan — CLOCK IN (submit Wed Oct 7, 8 pm CDT)

Written 2026-10-04 night (Hermes) for Jack's Monday morning. Plan of record for
the last three days. Owners are explicit; everything marked Hermes runs without
you unless it says "needs you".

## 0. Where we are

The app is done for this submission: solo loop, one approval to start, one
hold per week, weeks close themselves, free (fee 0/0/0 on chain since today),
Demo speed · Real weeks, night mode. d19 is on the Seeker, walked to the wallet
prompt; three devnet smokes are green. What's left is the package around it:
video, README, deck, public repo with a license, release APK, dApp Store kit,
and the submission form. Required by the organizer: APK, GitHub repo, demo
video, pitch deck. Everything else is polish that affects the "presentation"
quarter of the score.

Done tonight (details in §7): fact sheet (`docs/submission/FACTS.md`), four
Sonnet drafts (README, video script, deck, store listing + privacy), the video
render pipeline (`scripts/video/render.py`, proven on a test cut), the repo
presentation audit (§5), this plan.

## 1. Deliverables and definition of done

| # | Deliverable | Done when |
|---|---|---|
| 1 | **Demo video** 90–120 s | Real Seeker footage only; two approvals shown as caption cards; "Demo speed" said and shown once; voiceover (yours) or captions; unlisted YouTube link opens logged-out. |
| 2 | **GitHub repo, public** | `main` = the submission branch (fast-forward), new README, LICENSE, no secrets (scan clean), description updated; `curl` logged-out returns 200; cron flip verified Wed ~02:00 CDT. |
| 3 | **APK** | GitHub release `v0.1.0-clockin` with the APK + sha256; installed from that exact file on the Seeker and walked once. |
| 4 | **Pitch deck** ~8 slides | PDF, every number traceable to FACTS.md, no banned words; you have read it aloud once. |
| 5 | Submission form | Submitted by you Wed before 8 pm CDT; every link checked logged-out by Hermes first; screenshot of the confirmation saved. |
| 6 | dApp Store kit (nice to have) | 6 screenshots, icon, listing copy, privacy text in `docs/submission/`; not needed to submit, needed within days of a win. |
| 7 | Organizer email (your call) | Sent or consciously skipped. |

## 2. Schedule

### Monday (you at the desk in the morning)

**Block A — phone, ~40 min, needs you (2–3 approvals).** This is the only
block where your hands are required. Hermes drives over adb and records.

1. Seed Vault Wallet on Devnet. Home must already show one finished ritual
   with a miss (it does: "Call mom", "stretch") — that is the B-roll for the
   missed week.
2. Recording run (Demo speed, "Read", 4 weeks, 5 TEST): Home → + New ritual →
   step 1 → step 2 (pills, summary) → **Lock it in** (approval 1: sheet shows
   **−20 TEST**, no fee) → Locked in → ritual screen with the countdown and the
   "Demo speed: a week here is 6.5 minutes." line → ~2 min wait → **HOLD**
   (approval 2) → SHOWED UP + saying → ~6 min → KEPT receipt. Optional:
   film the Seed Vault sheet with a second phone for 5 s; otherwise the video
   uses a caption card there (wallet screens record black, by Android design).
3. While week 1 settles: your decisions (Block B). Then logcat saved,
   footage pulled, you are free.

**Block B — decisions, 15 min, needs you.** See §4; answer in one message.

**Block C — Hermes, rest of the day, no you.** Video v1 cut from the footage
(render.py: phone left, captions right, waits compressed and labelled) → you
watch it once → voiceover: you record the script's single-take read on your
phone's voice memo (~60–90 s) and drop the file in `artifacts/video/`, or we
go captions-only → v2 with your voice → you upload unlisted to YouTube (I
can't sign in to your account) and paste the link. README final from the
draft; LICENSE; `main` fast-forwarded; release `v0.1.0-clockin` with the APK
and sha256; deck PDF (already rendered tonight: `artifacts/deck/rituals-deck.pdf`;
re-rendered after your edits) → you read it once.

### Tuesday

Hermes: judge TEST access if you chose a faucet (§4.2), MWA identity if you
approved a Pages origin (needs a rebuild + re-walk + new release asset), dApp
Store screenshots via adb, logged-out check of every link, STATUS final.
You: organizer email (send or skip), deck edits, video approval.

### Wednesday

~02:00 CDT the cron `rituals-make-repo-public` scans history and flips the repo
public, reports to Telegram. Hermes re-checks every link logged-out in the
morning and writes the exact text for each form field. You submit before
8 pm CDT and save the confirmation.

## 3. The video: can Hermes make it alone?

Mostly yes. Everything except the two wallet approvals can be driven over adb
and recorded with `adb shell screenrecord` (3-minute segments). The cut is
built by `scripts/video/render.py`: ffmpeg only, the app's own fonts
(Fraunces 900 headlines, Figtree body, lime notes), 1920×1080, the phone on the
left, captions on the right, speed ramps for waits, caption cards for the
wallet moments. A 20-second proof cut is at `artifacts/video/pipeline-test.mp4`
(frame: `pipeline-test.png`). What you saw someone do "entirely in JavaScript"
is almost certainly Remotion (React components rendered to video). It makes
nicer motion (animated captions, device frames) at the cost of an `npm install`
and a Chromium download; the ffmpeg route gets 90 % of the look with zero new
dependencies. If v1 looks flat to you, Remotion is a Tuesday-morning upgrade,
not a rewrite: the footage and shot list are the same.

Rules the cut follows: only real footage, no staged states; waits are
compressed and labelled ("8× — the wait, not the app"); wallet approvals are
caption cards, never black frames; "Demo speed: a week here is 6.5 minutes."
appears on screen and in the voice once; one "Devnet · test tokens" line;
nothing about AI, SKR, mainnet.

Voiceover: your voice is better than any TTS and the script is written to be
read in one take. Fallback if you'd rather not: captions carry the story and a
neutral TTS track can be generated locally for timing, not for the final.

## 4. Decisions needed from you (one message answers all)

1. **License.** Recommendation: MIT (simple, judges expect it). Alternative
   Apache-2.0 if you want the patent clause. Needed before the Wednesday flip.
2. **How judges get TEST.** Options: (a) **"Get test tokens" in the app**
   backed by a tiny faucet on your Oracle micro (a key with mint authority to a
   faucet-only wallet, 50 TEST per address per day, rate-limited) — half a day,
   real, public service; (b) a request form: README says "DM @you / email for
   TEST", we mint by hand — zero build, friction for judges; (c) pre-mint to a
   few addresses and say nothing. Recommendation: (a) if you're fine running a
   public faucet on the micro; else (b) with a quick turnaround promise.
3. **MWA identity origin.** Seed Vault shows "github.com" and warns "We don't
   recognize this domain". A GitHub Pages site (whoknowsmann.github.io/rituals,
   one static page + icon) fixes the name and icon. Public action, needs a
   rebuild and re-walk. Recommendation: yes, Tuesday morning, if the video is
   already in the can.
4. **Repo cleanup.** `sketches/` (5.9 MB, 67 files, design exploration) and
   `spikes/` are unreferenced by the app. Keep (shows craft, provenance) or
   drop from the public tree? Recommendation: keep; they cost nothing and the
   README's repository map labels them.
5. **Repo description.** Today: "a Solana Mobile social-accountability app for
   private groups" (wrong since the fold). Proposed: "Show up, or pay up. Put a
   stake on a weekly promise; stamp it to keep it; miss it and it goes to a
   cause. Solana Mobile · devnet." Say yes and I set it.
6. **Organizer email.** Draft exists (`docs/submission/organizer-questions-email.md`
   on `docs/submission-solo`, needs the fee/free update). Send Monday, or skip?
7. **Voiceover.** Your voice (recommended) or captions only.
8. **Video wallet moments.** Second phone for 5 s of the Seed Vault sheet, or
   caption cards only.

## 5. Repository presentation audit (measured tonight)

- Remote: `whoknowsmann/rituals`, private, default `main` @ d3bd3a8 ("docs:
  make every status document match observed reality", Sep). `feat/solo-screens`
  is **157 commits ahead; fast-forward possible** (no history rewrite).
- `main`'s README describes the September product ("forfeit to the members who
  showed up"). Every visitor would see that until the fast-forward lands.
- No LICENSE file. No key files ever tracked on any branch; no secret-key
  arrays; no token patterns. The cron's scan will pass as of tonight.
- Topics are right (solana, solana-mobile, anchor, react-native, hackathon,
  accountability). Description is stale (§4.5).
- Dead weight: `sketches/` 5.9 MB / `spikes/` 164 KB, unreferenced by `src/`.
  `package-lock.json` 740 KB (normal).
- 21 lines in docs/README carry machine paths (`/home/hound`, `C:\Users`);
  cosmetic, I'll sweep the README and leave the dated plans as provenance.
- "preflight" appears only as the local worktree path in notes and as
  `skipPreflight`/`preflightCommitment` (protocol options — never rename).

## 6. Risks and fallbacks

- **Public devnet 429s during the recording run.** Record first thing, retry
  a segment rather than the whole run; the create and stamp are independent
  takes if needed (two rituals is fine, the cut doesn't care).
- **Approval expiry (~60 s).** You approve the moment the sheet appears; if
  it expires nothing was sent and we retry.
- **Cron flip fires on a stale `main`.** Fast-forward + LICENSE + README must
  land Monday/Tuesday. I'll verify `main` the evening before.
- **Video shows a wallet screen we can't record.** By design: caption card.
- **Running out of Tuesday.** Cut order if behind: dApp Store kit first, then
  MWA identity, then the faucet. Never cut: video, public repo, release APK,
  submission.

## 7. Tonight's artifacts (Hermes, 2026-10-04 night)

- `docs/submission/FACTS.md` — the fact sheet; every doc traces to it.
- root `README.md` (new, placeholders in angle brackets), `docs/submission/video-script.md`, `pitch-deck.md`,
  `dapp-store-listing.md` — Sonnet 5.5 drafts, reviewed against FACTS by
  Hermes (review notes at the top of each file if anything was changed).
- `scripts/video/render.py` + `artifacts/video/pipeline-test.mp4` — the cut
  pipeline, proven.
- `scripts/deck/build.py` → `artifacts/deck/rituals-deck.html` and
  `rituals-deck.pdf` (8 slides, app fonts, printed with the browser; no
  overflow). Re-run after any edit to `pitch-deck.md`; speaker notes stay in
  the markdown.
- `docs/STATUS.md` — START HERE updated.
