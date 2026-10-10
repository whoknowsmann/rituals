# Rituals: demo video script (CLOCK IN)

Target length: ~110 seconds. Built only from adb screen recordings of the app on a Seeker, plus caption cards. Every claim traces to docs/submission/FACTS.md. Updated 2026-10-09 for the d41 flow: faucet on Home, create step 1 with two fields, and the last week's miss shown as Finished with one totals line.

## 1. Premise

Rituals lets you put a stake on a weekly promise. Stamp the week and you get that week's stake back; miss it and that week's stake goes where you chose.

The video is ONE real run on a real phone, from a wallet that holds nothing (the judge's path): get test tokens on Home, start a 2-week demo ritual, stamp week 1, deliberately leave week 2, and end on the two real receipts side by side. Waits are cut, never sped up; the two wallet approvals are caption cards (wallet screens record black, by Android design).

The sentence to leave in a judge's head: Show up and you get your stake back, miss and it goes where you chose, and Rituals takes nothing.

## 2. Shot table

FOOTAGE = adb screen recording. CARD = caption card over a still frame of the app.

| # | Time (s) | On screen | Caption | Voiceover |
|---|---|---|---|---|
| 1 | 0-5 (5) | CARD. Still of Home, tiles dimmed. | Rituals / Show up, or pay up. | You know the thing you keep meaning to do. Put a stake on it. |
| 2 | 5-15 (10) | FOOTAGE. Home on a fresh wallet: "Start a ritual?" with Get test tokens as the main button. Tap it; hold on "Sent: 50 tSKR and 0.05 SOL." Tap Start one. | Devnet faucet · nothing to sign | Fresh wallet, nothing in it. One tap for test tokens. Nothing to sign. |
| 3 | 15-21 (6) | FOOTAGE. Step 1, "What will you do each week?": type "Read" in NAME. Next. | none | I name what I'll do each week. |
| 4 | 21-33 (12) | FOOTAGE. Step 2: 2 weeks, Demo speed, tap 20. Hold on "2 demo weeks · 1 min each · 10 tSKR a week". Under IF YOU MISS A WEEK, IT GOES TO, tap City Animal Shelter (demo). | none | Two weeks, twenty in total, ten a week. If I miss a week, it goes to a demo animal shelter. I pick that, not the app. Rituals takes nothing. |
| 5 | 33-36 (3) | CARD. Still of step 2 with Lock it in. | One approval in Seed Vault Wallet | One approval. |
| 6 | 36-43 (7) | FOOTAGE. Ritual screen: the demo line and the ticking countdown "Week 1 opens in …s". | none | Every week's stake is locked. Demo speed: a week here is one minute. |
| 7 | 43-45 (2) | CARD. | Week 1 opens. | |
| 8 | 45-53 (8) | FOOTAGE. HOLD TO STAMP with "…s left". Type a short note, then press and hold the full 1.4 s; the button fills. End on release, before the wallet. | none | Now I hold to stamp. I add a note, just for me. |
| 9 | 53-55 (2) | CARD. | One approval in Seed Vault Wallet | One more approval. |
| 10 | 55-65 (10) | FOOTAGE. Confetti, YOU SHOWED UP! thumps in, the saying. Rest 2 s. | none | Stamped. |
| 11 | 65-68 (3) | CARD. | Week 2: I do nothing. | Week two, I do nothing. |
| 12 | 68-80 (12) | FOOTAGE (same run). Week 2's countdown runs out with no stamp; the screen turns to Finished with a MISSED stamp and "Closing…", then reads "10 of 20 tSKR back · 10 tSKR to City Animal Shelter (demo)". | No approval. The app settles it. | The week closes on its own. Missed. Ten of the twenty goes to the shelter. |
| 13 | 80-100 (20) | Split screen from this run: the week 1 receipt (KEPT, "10 tSKR back to you", the note) left, the week 2 receipt (MISSED, the same totals line) right. | One promise. Both outcomes. | One promise, both outcomes. Show up: your stake comes back. Miss: it goes where you chose. |
| 14 | 100-110 (10) | CARD. Paper card, wordmark. | Rituals / Show up, or pay up. / rituals.whoknowsman.com | It's devnet, with test tokens. Rituals takes nothing. Show up, or pay up. |

Rows 5 and 9 are the two wallet approvals. Row 6 is the one place Demo speed is said and shown. Rows 12-13 are the payoff and get the longest holds.

Cuts: rows 6→8 cut the ~60 s wait for week 1; rows 10→12 cut the rest of week 1's window and grace; inside row 12, cut the ~10 s of grace under "Closing…" so the totals line follows the MISSED stamp. Do not speed footage up. The countdowns on screen are the app's own chain-timed countdowns.

## 3. Voiceover, one continuous read

About 140 words. Short sentences, normal pace, one take after the cut; trim to rows.

You know the thing you keep meaning to do. Put a stake on it. [pause]

Fresh wallet, nothing in it. One tap for test tokens. Nothing to sign. [pause]

I name what I'll do each week. [pause]

Two weeks, twenty in total, ten a week. If I miss a week, it goes to a demo animal shelter. I pick that, not the app. Rituals takes nothing. [pause]

One approval. [pause]

Every week's stake is locked. Demo speed: a week here is one minute. [pause]

Now I hold to stamp. I add a note, just for me. [pause]

One more approval. [pause]

Stamped. [pause]

Week two, I do nothing. [pause]

The week closes on its own. Missed. Ten of the twenty goes to the shelter. [pause]

One promise, both outcomes. Show up: your stake comes back. Miss: it goes where you chose. [pause]

It's devnet, with test tokens. Rituals takes nothing. Show up, or pay up.

Captions: burn the voiceover in as captions as well (the owner wants both). Lower third, the app's Figtree, short lines, one sentence per caption.

## 4. Do not show, do not say

- No real money, no network except devnet. Say "devnet, with test tokens" once (row 14); the app's footer shows it too.
- Nothing from the FACTS "Never" list. A missed stake is nobody's gain.
- Nothing from the FACTS "Hidden" paragraph (friends, a witness, Seasons). If it appears, re-record.
- No activation fee: there is none.
- Never say a week is shorter than one minute; say "demo speed" when timing comes up; never imply Real weeks was recorded (if asked: 7-day weeks, a 6-day stamp window, reminders on).
- The stamp note stays on the phone, not on chain.
- Do not say "That's a week, not a verdict." The app shows it only on a missed week that is not the last, and week 2 of 2 is the last.
- Do not show the wallet. It records black. (It names the app as Rituals at rituals.whoknowsman.com; the cards stand in for it.)

## 5. Recording checklist

Hermes drives the phone over adb and records (`adb shell screenrecord --time-limit 180` in a loop). Jack only approves in the wallet. Jack records the voiceover afterwards.

Mode: day mode (sun/moon toggle), confirmed before the first take.

Before the take:
1. The faucet answers `/api/health` with 200 and has SOL.
2. Seed Vault Wallet: a FRESH account ("test 2", 0 SOL / 0 tSKR), network set to Devnet, connected in Rituals. Home shows "Start a ritual?" with Get test tokens as the main button.
3. d41 (or later) is installed and was walked end to end the same day. Create step 1 and the stamp sayings have not been walked on the phone yet.
4. Notifications silenced, clean status bar, nothing in recents.

The run (about 4 minutes of real time):
1. Record. Home → Get test tokens (wait for "Sent: 50 tSKR and 0.05 SOL.") → Start one → type "Read" → Next.
2. Step 2: 2 weeks, Demo speed, 20, City Animal Shelter (demo).
3. Lock it in → first approval (Jack approves the moment the sheet appears).
4. Ritual screen: capture the demo line and the countdown. Week 1 opens ~60 s after Lock it in.
5. Type the note, hold HOLD TO STAMP the full 1.4 s → second approval, immediately (the stamp window is 45 s).
6. Confetti + YOU SHOWED UP!.
7. Stay on the ritual screen. Do nothing through week 2 (it opens 60 s after week 1 did; 45 s window; 10 s grace). Capture Finished with the MISSED stamp, "Closing…" and the totals line.
8. Open the week 1 and week 2 receipts (tap the cells); capture each. Wait until week 2's receipt shows the totals line and not "Not closed yet".
9. Stop. Save `adb logcat -d -v time` to artifacts/logs/, and check the shelter's balance went up by 10 on chain.
