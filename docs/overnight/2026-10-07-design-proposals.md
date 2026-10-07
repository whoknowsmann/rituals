# Design proposals — 2026-10-07

Branch `opus/design-2026-10-07`. Brief: clean changes only (remove, merge,
re-order, re-weight, re-label). Nothing below adds a screen, banner, tooltip or
explanatory sentence. Ranked by impact on what a judge sees; `[row n]` = row in
`docs/submission/video-script.md`.

Basis: the code on this branch after Part 1, read state by state, and
`opus/bughunt-2026-10-07` @ b4a6dd9 where it changes the same screens. The
screenshots in `artifacts/shots/` (d26–d29) could not be opened in this session
(no image viewer was available), so nothing here is credited to a screenshot.

Part 1, already on this branch: after a stamp, YOU SHOWED UP! stays the hero
until the next week opens. Its punch-card cell reads ✓ at once, and one ticking
line under it says what happens next: "Week 2 opens in 40s"; for the last week,
"Week closes in 30s" and then "Closing…". The title names the week whose stamp
is shown. The skip is a quiet "Skip week N" link.

## 1. Ritual: a missed week ends the same way a kept week does [row 13]
- Now: at "0s left" the HOLD disappears and a card reads "This week is closing /
  The check-in window has closed. It settles in a moment." for the 10 s grace.
  Then a second card shows MISSED with "Closing this week…" and "{destination}
  gets this week's stake.". Only after that does the result appear.
- Change: at the deadline the HOLD area becomes the MISSED stamp ("That's a
  week, not a verdict."), with the same single ticking line as Part 1 ("Week 2
  opens in 14s"; last week "Week closes in 9s" → "Closing…"). Once the week
  settles, "{amount} went to {destination}." appears. Both cards go.
- Why: after the deadline no stamp can land, so the result is already decided.
  Showing it where the action was, with the time, replaces 10 s of narration.
  This is the payoff shot of the video.
- Effort S. `weekHero.ts` already has the pieces. Risk low. Two cases must stay
  out of this path: a stamp still in flight or not yet read back (it must keep
  "Stamping…" / "Reading your stamp…"), and a declared skip (bughunt's
  `weekSkipped`). The manual "Settle this week" fallback stays.

## 2. Ritual: before a week opens, show the HOLD it will be [rows 7–9]
- Now: during the ~60 s lead after Lock it in, a separate card reads "Week 1
  opens in 45s". When the week opens, the card disappears and the HOLD, note
  field and "45s left" appear in its place.
- Change: show HOLD TO STAMP, disabled, with "Week 1 opens in 45s" in the slot
  where "45s left" will tick. The note field is already there. Drop the card.
- Why: from the first second the screen shows what you will do and when. The
  hero never moves (lead → open → stamped). The note can be typed during the
  lead instead of inside the 45 s window.
- Effort S. Risk low. A press during the lead does nothing, and the countdown
  sits right above the button. A declared-skip week shows SKIPPED instead
  (bughunt).

## 3. Ritual: remove the dark "Back to rituals" button from missed / skipped
- Now: after a missed (or skipped) week, the loudest thing on screen is a dark
  primary "Back to rituals". It shows exactly while the next week opens in
  seconds. On bughunt's branch it also stays for the whole of a current-week
  skip.
- Change: remove it. The header back arrow stays, and the error state keeps its
  own.
- Why: it answers Jack's "back arrow or wait?" with "leave", while missed demo
  weeks only settle with this screen open. A kept week has no such button.
- Effort S. Risk low (no test pins it).

## 4. Ritual: every minor control in the new link tone
- Now: "Reminders: on/off", "See week N receipt" and "Remove from this phone"
  are full-width bordered buttons, the same weight Jack objected to for Skip.
- Change: `tone="link"` (added in Part 1) for all three. Bordered buttons remain
  only for "Settle this week" (fallback) and "Try again".
- Why: one hero per screen. Minor actions should look minor, and the punch-card
  cells already open receipts.
- Effort S. Risk low (tests pin the labels, not the tone).

## 5. Wallet hand-off: one line per step [rows 6, 10]
- Now: create runs through 4–5 status cards in a few seconds, each with a body
  line: "Building your ritual. A moment.", "Waiting for the network.",
  "Checking the ritual landed exactly as shown.", "Your wallet approved. We
  are checking that your ritual is ready.". On the ritual screen, actions show
  "Getting it ready / A moment.", and skip/settle also show "Confirming / Sent.
  Checking it landed.".
- Change: titles only ("Getting it ready", "Sent", "Confirming", "Checking your
  ritual…"). Keep "Approve in {wallet} within a minute. Don't swipe Rituals
  away." (B3 device finding).
- Why: these are narration, and the titles already say each step.
- Effort S. Risk low. The copy lives in `createMachine.ts` /
  `lifecycleMachine.ts` (bughunt's area), so the lead has to OK it.

## 6. Ritual: the demo line only while a week still needs a stamp
- Now: "Demo speed: a week here is 1 minute. Unstamped weeks are missed." sits
  above every state, including directly above YOU SHOWED UP!.
- Change: show it in the lead and the open window. Hide it once the current
  week is stamped and in the gap between weeks. Finished already hides it.
- Why: the warning stays where it can change behaviour. Under a stamp it is
  noise. The FACTS line ("the app says … on the ritual screen") stays true.
- Effort S. Risk low. Update the two tests that pin the exact JSX
  (`weeksToggle.test.ts`, `SoloRitualScreen.test.ts`).

## 7. Ritual: drop the "Week N" display title above the poster
- Now: the 32 pt "Week 1" and the 38 pt poster title are two display headings.
  The strip inside the poster already says "Week 1 of 2 · 1 kept", and "All 2
  weeks done" when finished.
- Change: remove the title. The poster title takes the header role.
- Why: DESIGN rule 1 (one loud thing). The poster is the hero.
- Effort S. Risk low–medium: the screen then starts at the poster, so check it
  on the device. If taken, Part 1's `titleWeekIndex` goes with it.

## 8. Ritual: last week's MISSED paper leaves when the next week opens
- Now: after a miss, the MISSED stamp and "{amount} went to {destination}." stay
  above the next week's HOLD, which puts two stamps and a HOLD on one screen.
  (Part 1 already hides it once that week is stamped.)
- Change: show it in the missed gap (as now) and on Finished only.
- Why: the miss had its moment, and the ✕ cell plus its receipt keep it one tap
  away.
- Effort S. Risk low.

## 9. Home: the stamped tile matches the ritual screen
- Now: right after a stamp the tile's current dot is still an open ring. Its
  line counts "Week closes in 32s" while the ritual screen counts "Week 2 opens
  in 40s". Two clocks show the same moment.
- Change: build the tile from Part 1's `punchCardCells` + `nextUpLine`: a filled
  dot and the same line.
- Why: one clock per moment, and the same ✓ everywhere.
- Effort S. Risk low. Update the pin on `stampedWeekClosingLabel(model, now)`.
  See the note on Home settling below.

## 10. Home: no "0 of N kept" before any week has closed
- Now: a fresh ritual's tile reads "0 of 2 kept" under its dots, which looks
  like failing before anything has happened.
- Change: no count line until the first week closes. The dots and the pill
  ("Opens in 45s") carry it.
- Why: removes a false negative at the start.
- Effort S. Risk low.

## 11. Create step 2: with no wallet, the wallet choice takes Lock it in's place
- Now: a disabled, faded "Lock it in" sits above "Set your wallet to Devnet." and
  the two wallet buttons.
- Change: while disconnected, render the chooser where Lock it in is, with no
  disabled primary.
- Why: the next real step is the visible one, and a dead primary reads as broken.
- Effort S. Risk low (move the `step === 3 && !selectedAccount` block and its
  pin).

## 12. Create step 2: "Remind me each week" out of the stake card
- Now: a third pill under "Demo speed · Real weeks", in the same style, so it
  reads like a speed option inside the money card.
- Change: move it below the destination list, just above the demo warning and
  Lock it in.
- Why: the stake card becomes weeks, speed and stake only, and reminders sit
  with the other "before you lock" choices.
- Effort S. Risk low.

## 13. Create step 2: the four destinations as one list
- Now: under "IF YOU MISS A WEEK, IT GOES TO", four separate bordered cards (3
  causes + "A wallet you choose") together outweigh the stake card.
- Change: one bordered group with hairline rows (radio + name). Same labels,
  same order.
- Why: it is one choice and should look like one.
- Effort M. Risk low–medium: keep 44 pt rows. The device tap driver matches the
  labels, which stay the same.

## 14. Receipt: no narration, quieter exit [row 14]
- Now: the SKIPPED receipt adds "This week was declared skipped before it
  opened." under a stamp that already says SKIPPED / "Your stake comes back.".
  Every receipt also has a bordered "Back to ritual" button on top of the header
  back arrow.
- Change: drop the line, and put "Back to ritual" in the link tone.
- Why: the stamp is the receipt.
- Effort S. Risk low (the test pins the label and `goBack`, not the tone).

## 15. Settings: say it once
- Now: "tSKR is a test token with no real value" appears twice (Network card
  and footnote). "Notification settings" and "View on Explorer" are full
  bordered buttons.
- Change: drop the Network card's second line, and put the two minor jumps in
  the link tone. "Get test tokens" stays the one real button.
- Why: one disclosure per screen, and one primary-weight control.
- Effort S. Risk low (the test's disclosure pin is satisfied by the footnote).

## Notes for the lead
- Merging this branch with `opus/bughunt-2026-10-07` (checked against b4a6dd9
  with `git merge-tree`) gives two mechanical conflicts:
  - `SoloRitualScreen.tsx`, the skip line. Both sides already say "Skip week
    N"; take `tone="link"`.
  - `SoloRitualScreen.test.ts`. Both sides appended tests at the same spot;
    keep both.

  With that resolution tsc is clean and the full suite passes (2,537 tests, 145
  files, run on an exported copy of the merged tree). The stamped variants of
  the closing / settle cards were left byte-identical to base, so bughunt's
  `weekSkipped` edits merge untouched. They can no longer render for a stamped
  week (the stamp branch comes first), so delete them after the merge.
- Logic, not design (bughunt / lead): the settle key runs only while the ritual
  screen is open. If someone stamps and goes back to Home, the week settles
  only when they reopen the ritual. Until then the tile shows "Closing…" and
  never "Stamp this week" for the next week, whose demo window can run out
  unseen.
