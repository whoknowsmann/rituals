> **SUPERSEDED (2026-10-02) by `single-blade-2026-10-02.md`.** Jack chose a harder cut: solo only, no Seasons.

# Rituals: scope to place (2026-10-02)

Written by Hermes at Jack's request after the 2026-10-01 phone run. Jack's words:
"scope this app to WIN the hackathon or at least place... we're hitting some
project creep with good intention but maybe need to focus our goal."

Deadline: **Fri Oct 9, 1:59am CDT** (= 2026-10-09 06:59 UTC, Align API, last
re-verified 2026-09-17; re-check on submit day). In practice that is the end of
Thursday night. Internal target: submitted by **Wed Oct 7, 8pm CDT**, which also
meets the Hub rule of submitting at least 24 hours early. That leaves 6 working
days, and most of Jack's time is evenings.

## 1. The bet

Judges decide in about two minutes of video plus a skim of the repo. They will
not install a devnet APK and run a 16-week ritual. We win or place on **one
loop that is obviously real, obviously useful, and filmed well**, not on how
many features exist.

**The one loop:** make a promise, put a stake behind it, show up and stamp it,
get it back. Miss, and it goes where you chose. Solo, on a Seeker, with one
approval per step.

Everything in this plan either makes that loop work on the phone, makes it look
good, or puts it in front of a judge. Anything else waits until after Oct 8.

## 2. How this maps to the judging

The two rubrics still disagree (see Hub `Hackathon Requirements.md`). Both are
covered by the same loop:

| Terms §8.1 (prevails) | Align API | What carries it |
|---|---|---|
| Stickiness / PMF 25% | Ecosystem 15 | Weekly loop with money behind it; the Season count ("12 people checked in this week") is a reason to come back |
| UX 25% | UX 15 | One approval to start, hold-to-stamp, receipt. No dead buttons (fixed 10-01) |
| Innovation 25% | Innovation 15 | Self-commitment with a locked destination, not a bet. Witness who never stakes |
| Presentation 25% | UI 15 | The video, the deck, a README a judge can skim in 60 s |
| | AI 20 | Not chasing. See §5 |
| | SKR 20 | One small real thing, only if cheap. See §5 |

If organizers confirm the Align weights, AI + SKR are worth 40 points we mostly
give up. Even then, decorative integrations score worse than an honest absence.
Send the organizer email (Jack, 2 min) so we know by mid-week instead of guessing.

## 3. Freeze list: no new work on these before Oct 8

These are real and some are good. They don't help a judge in two minutes.

- **"With friends" group flow.** Keep it in the app as the secondary path (it
  works on devnet). No new screens, polish or fixes unless it crashes. In the
  video it's one line: "or do it with friends."
- **Witness** beyond what landed on 10-01 (share + join routing). No
  "I didn't see it" / question action.
- **Voided-week display bug** (parked RED tests in `docs/parked/`). Only matters
  when a witness doesn't answer. Not on the demo path.
- **Program changes of any kind.** The deployed program is the one we ship.
- **Adversarial/security audit matrix**, Expo upgrades, reload-recovery edge
  cases beyond what exists.
- **Photo proof**, notifications/reminders, `.skr` names, Genesis-token badge,
  AI recap.
- **Mainnet anything.**

## 4. Must ship (in order)

| # | Item | Owner | When | Done means |
|---|---|---|---|---|
| 1 | **Phone run on the fixed build (d3)** | Jack ~25 min + Hermes | Fri Oct 2 evening | Create → stamp → settle → KEPT receipt on the Seeker, Season d2, 5-min window. Then let week 2 lapse and close + settle it for a real MISSED receipt. 5 Phantom approvals total |
| 2 | **Capture video footage during that run** | Hermes records (`adb screenrecord`), Jack approves | same session | Raw clips for every shot in the script, incl. the missed week |
| 3 | **Send organizer email** | Jack | Fri Oct 2 | Sent from his address; reply logged in Hub |
| 4 | **Visual pass on the 5 demo screens** (Home, Create ×3, Ritual, Receipt, Season) | Hermes + Sonnet-checked copy | Sat Oct 3 | Screenshots side by side look like one designed product; Jack signs off from the phone |
| 5 | **Public repo** | Jack decides license; Hermes executes | Sat–Sun | License file, README rewritten from `docs/submission/README.public-draft.md`, history kept, repo public, secrets scan re-run on the day |
| 6 | **MWA identity off "github.com"** | Hermes, Jack approves the public page | after #5 | Phantom shows "Rituals" + a real https origin (GitHub Pages on the public repo is enough) |
| 7 | **Release APK** | Hermes | Mon Oct 5 | Signed release build installed on the Seeker, walked end to end, attached to a GitHub release |
| 8 | **Demo video, 90–120 s** | Jack voice, Hermes edit | Mon–Tue | Uses only real footage from #2. Captions for devnet/TEST/demo cause |
| 9 | **Pitch deck, ~8 slides** | Sonnet drafts from the outline, Jack edits | Tue Oct 6 | PDF exported and linked from README |
| 10 | **dApp Store listing kit** | Hermes | Tue | Icon, 4–6 screenshots, description, privacy text ready. Needed only if we win (30-day publish rule), but cheap now |
| 11 | **Submit** | Jack | **Wed Oct 7 by 8pm** | Submitted with the form fields checked; Hermes verifies every link opens logged-out |

Slack: Thu Oct 8 until 1:59am is buffer only. Nothing new starts after Tue night.

## 5. The two rubric hedges, kept small

- **SKR (up to 1 evening, only after #1–#4 are done).** The balance reader and
  discount tiers exist and are tested but no screen uses them. Wire the discount
  into the create review line ("Activation fee 0.5 TEST, 20% off for SKR
  holders") using the stand-in mint the reader already supports (confirm it
  exists on devnet first), labeled as a devnet stand-in. If it isn't done by
  Sun night, drop the SKR claims from every doc instead.
- **AI: don't.** Nothing in the loop needs it, and putting AI near "did you show
  up" contradicts the product's trust model. If the organizer says AI is
  required, the smallest honest thing is a weekly recap line written on-device
  from confirmed history. That's a separate decision for Jack, not a default.

## 6. Risks that can sink us, and the guard

| Risk | Guard |
|---|---|
| Another phone-only bug in the demo loop | `scripts/smoke-app-solo.ts` now drives the screens' own modules on devnet and must pass before every APK build. On the old code it failed at create with the exact device error; the stamp bug is pinned by a unit test using the real reader's error. Hermes still walks every build on the phone up to the wallet prompt |
| Public devnet RPC rate limits during recording | Record when devnet is quiet; keep a second take; optional dedicated RPC (Jack signup, 5 min) |
| Phantom approval too slow for a window | Season windows are now set per run (`--claim-window-seconds 300`) |
| Organizer says devnet isn't acceptable | We learn it Fri instead of after submission. Fallback is a written explanation, not a mainnet rush |
| Running out of evenings | The freeze list. If behind on Mon, cut #10, then #6. Never cut #1, #2, #5, #7, #8, #11 |

## 7. What Jack does, total

About 3–4 hours across the week:
- Fri: phone run with footage (~30 min, 5 approvals), send organizer email, pick a license
- Sat: thumbs up/down on the visual pass from the phone
- Mon–Tue: record the voiceover (~20 min), review the video and deck
- Wed: submit

Everything else is Hermes, with writing drafted by Sonnet 5.5 and checked
against the code.
