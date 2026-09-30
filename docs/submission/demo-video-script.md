# Rituals demo video script (solo-first)

Target: 1:50. Device: physical Solana Seeker. Network: Solana devnet, valueless TEST token.
Voice: Jack, first person, calm. Based on `docs/plans/hackathon-winners-2026-09-26.md` section 4 and Phase E of `docs/plans/solo-first-2026-09-26.md`. Replaces the 2026-09-23 group-first script.

Rules for this cut:
- Open on an active solo ritual and the human problem. No logo, no terminal, no address.
- Every shot is a real screen from the phone test. Do not splice fixtures over unconfirmed steps. If a step fails, reshoot it or cut it, and say so.
- Wallet approvals are FLAG_SECURE. Phantom and Seed Vault screens record as black. Cut away or hold on the black frame with the caption "Approve in Phantom". Do not try to work around it.
- Say "devnet", "TEST token", and "demo cause" on screen and in voice. Never say AI. Never say pot, win, or payout.

## Shot list

Status tags: [READY] can be captured now. [NEEDS CAPTURE] depends on the phone test (Phase D), which has not run.

| Time | On screen | Voiceover | Caption |
|---|---|---|---|
| 0:00-0:10 | Home screen on the Seeker with an active solo ritual ("Run 3x a week") and its week strip. Slow push in. [NEEDS CAPTURE: home with an active ritual, after join] | "I keep saying I'll run three times a week. Then Thursday comes and I haven't. Rituals is how I stop negotiating with myself." | (none for the first 3 seconds), then "Show up, or pay up." |
| 0:10-0:24 | Home Seasons card, then the Season screen: "October Run Club", "0 people in", Join. Then create steps: promise, Just me, stake 5 TEST, destination "Northside Food Bank (demo)", 16 weeks. [NEEDS CAPTURE: Season screen pre-join, create steps 1 to 3. Screens were walked on 2026-09-28, so a re-shoot is cheap] | "This is October Run Club. Everyone joins with their own stake. Mine is 5 TEST a week, for sixteen weeks. If I miss a week, it goes to a food bank I chose. Never to Rituals." | "5 TEST a week. 16 weeks." then "Missed week goes to: Northside Food Bank (demo)" |
| 0:24-0:38 | Tap "Approve & make it real". Cut to the black Phantom frame for about 2 seconds. Return to Rituals: the PROMISE MADE stamp inks in, then the Season shows "1 person in". [NEEDS CAPTURE: approval 1, PROMISE MADE, "1 person in"] | "One approval in my wallet creates it, funds it, and starts it. The rules are locked before any money moves. Then the app stamps it: PROMISE MADE." | "Approve in Phantom" then "PROMISE MADE" |
| 0:38-0:54 | The ritual screen when week 1 is open: "Make it official / Hold to stamp this week." Finger holds the button, haptic, stamp inks: SHOWED UP. Cut to the Season screen: "1 checked in this week". Brief Phantom black frame for the claim approval. [NEEDS CAPTURE: hold-to-stamp, approval 2, SHOWED UP, "1 checked in this week"] | "When I've run, I press and hold. That's the check-in. It's honor by default, just me. The stamp inks, and the Season counts one person checked in this week. No names. Just an honest count." | "Press and hold to stamp" then "1 checked in this week" |
| 0:54-1:10 | Week closes ("This week is closing", then ready to settle). Tap "Settle this week". Black Phantom frame. "See week 1 receipt". Receipt shows the KEPT stamp and 5 TEST returned. [NEEDS CAPTURE: approval 3, KEPT receipt] | "When the week closes, I settle it. One more approval, and the program sends my 5 TEST back. The receipt says KEPT. I can check the transfer on chain myself." | "Settle this week" then "KEPT" |
| 1:10-1:26 | A missed week. The missed mark (quieter than KEPT, no red) with "That's a week, not a verdict." Then the receipt line: "went to Northside Food Bank (demo)". [NEEDS CAPTURE: see note below] | "Some weeks I'll miss. On this one, that week's slice went to the food bank I picked. The app says it plainly: That's a week, not a verdict." | "A missed week. Demo cause, devnet." |
| 1:26-1:42 | Short, quiet screens: the receipt again with "devnet" visible, or a cutaway of the Solana Explorer page for the settlement transaction (devnet cluster). Optional: the Seeker on a desk with Phantom and Seed Vault Wallet options. [NEEDS CAPTURE: explorer cutaway for the phone-test settle signature] | "Everything you just saw ran on Solana devnet, on a Seeker, through Mobile Wallet Adapter. The token is worth nothing and the cause is a demo. The stake sits in a program, not with us." | "Devnet. TEST token. Demo cause." |
| 1:42-1:50 | Hold on the home screen with the active ritual. End card: "Rituals" and the tagline. | "Rituals. Show up, or pay up." | "Show up, or pay up." |

### Missed-week shot (1:10-1:26): pick one, in this order

1. Best: on the phone, let a second short ritual lapse during the phone test (Phase D plans "a deliberate miss"), settle it, and record the real missed receipt and the stamp. [NEEDS CAPTURE]
2. Fallback: cutaway to the explorer page for the 2026-09-28 devnet smoke miss (ritual `EGdxRY22...`, smoke owner `fT9X...Jgo1`), where the demo cause received exactly one week's stake. Caption it "Devnet smoke test, signed by script". Say so in the voiceover if used. Do not present it as a phone recording.
3. Do not stage a missed-week screen with a fixture.

If the fallback is used, change the line to: "Some weeks I'll miss. In our devnet test, that week's slice went to the food bank chosen up front. The app says it plainly: That's a week, not a verdict."

### Timing notes for the real capture

- The claim window in demo mode is 90 seconds. Start the hold the moment week 1 opens and approve promptly. See `docs/STATUS.md`, "Phone run". Record the whole take in one pass, then cut in the edit.
- The wait for week close is about a minute of dead air. Cut it. Do not speed-ramp the wallet screens.
- Phantom still labels the app "github.com" during approval, and the black frame hides it. This is a Phase E fix, so check whether the label is fixed before the final recording and whether any frame leaks it.

## Full voiceover (one block for recording)

I keep saying I'll run three times a week. Then Thursday comes and I haven't. Rituals is how I stop negotiating with myself.

This is October Run Club. Everyone joins with their own stake. Mine is 5 TEST a week, for sixteen weeks. If I miss a week, it goes to a food bank I chose. Never to Rituals.

One approval in my wallet creates it, funds it, and starts it. The rules are locked before any money moves. Then the app stamps it: PROMISE MADE.

When I've run, I press and hold. That's the check-in. It's honor by default, just me. The stamp inks, and the Season counts one person checked in this week. No names. Just an honest count.

When the week closes, I settle it. One more approval, and the program sends my 5 TEST back. The receipt says KEPT. I can check the transfer on chain myself.

Some weeks I'll miss. On this one, that week's slice went to the food bank I picked. The app says it plainly: That's a week, not a verdict.

Everything you just saw ran on Solana devnet, on a Seeker, through Mobile Wallet Adapter. The token is worth nothing and the cause is a demo. The stake sits in a program, not with us.

Rituals. Show up, or pay up.

Word count: 220. At 150 words per minute that is 1:28 of speech. The planned runtime is 1:50, because the stamp and receipt moments need about 20 seconds of silence. That sits inside the 90 to 120 second target. If the phone-test footage runs long, cut the 1:26 to 1:42 shot first, not the missed-week beat.

The "5 TEST" amounts and "sixteen weeks" match the current create defaults in `docs/STATUS.md`. If the phone test uses different numbers, change the voiceover to match the footage before recording.

## Capture checklist (in phone-test order)

Phone: Seeker, Phantom Account 3. Screen record the whole session. Screenshots via `scripts/ui.py shot <name>`.

1. [ ] Home with no active ritual, Seasons card showing the Season (establishing shot; optional).
2. [ ] Season screen before joining: "October Run Club", "0 people in", Join.
3. [ ] Create step 1 (promise typed), step 2 (Just me), step 3 (5 TEST, Northside Food Bank (demo), 16 weeks, locked-rules card).
4. [ ] Approval 1: tap "Approve & make it real", the black Phantom frame, return to the app.
5. [ ] PROMISE MADE stamp inking in, and a still of it.
6. [ ] Season screen after joining: "1 person in" (first devnet proof of participant_count). Still.
7. [ ] Home with the active ritual and week strip (this is the opening shot).
8. [ ] Ritual screen when week 1 opens: "Hold to stamp this week."
9. [ ] Hold-to-stamp in one continuous take, finger visible, then approval 2 (black frame) and the SHOWED UP stamp.
10. [ ] Season screen: "1 checked in this week" (first devnet proof of checked_in_count). Still.
11. [ ] "This week is closing" screen, then "ready to settle".
12. [ ] Approval 3: "Settle this week", the black frame, "See week 1 receipt".
13. [ ] KEPT receipt: full screen and a still. Note the signature.
14. [ ] Deliberate miss: a second ritual left to lapse, then the missed state ("That's a week, not a verdict."), then the receipt line naming the demo cause. Still of each.
15. [ ] Explorer pages (devnet cluster) for the settle signature and, for the fallback, the 2026-09-28 smoke miss. Zoomed screenshots with the cluster visible.
16. [ ] Device framing shot: the Seeker in hand, Rituals open, for the open and close.
17. [ ] Optional: the wallet picker showing Phantom and Seed Vault Wallet.
18. [ ] Re-check the Phantom app label ("github.com" or fixed) and note it in the capture log.
