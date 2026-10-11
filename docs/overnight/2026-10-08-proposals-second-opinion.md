# Design proposals: second opinion, 2026-10-08

Basis: read-only. I read the 15 proposals, DESIGN, FACTS, the Home polish report and today's source and tests. Nothing was run, so "no test pins X"
means I searched the *.test.ts files. Today's tree already has the proposals' Part 1 (weekHero.ts, Skip as a link) and the Home polish.

Bottom line: the build is clean and none of the 15 is a blocker. Five are one-line edits worth batching: about 15 minutes, one APK rebuild and a
three-state phone walk (disconnected create step 2, a missed week 1 of 2, the Finished screen). Do them before the recording run or not at all, so
the video matches the APK. If a rebuild is not worth it tonight, ship as is.

THE 15 (status | verdict | reason)
1. Missed ends like kept. Still relevant | DEFER | It is the video's payoff moment and the current closing-then-MISSED sequence is proven on the
   Seeker; a new path risks showing MISSED for a stamp still in flight or a declared skip. Risk is med, not low.
2. Disabled HOLD in the lead. Still relevant | DROP | It adds a dead control (the thing #11 removes) to a lead state that is already one clean line.
3. Remove the dark "Back to rituals" on missed/skipped. Still relevant | DO NOW | In the seconds between a miss settling and the next week opening
   it is the loudest control, and it invites leaving a screen that must stay open for demo weeks to settle.
   Change: SoloRitualScreen.tsx:327, delete the line. ErrorState keeps its own button (:361) and the header back arrow is the same exit.
   Risk: low; no test pins it. Keep it only if Jack asked for it (STATUS L239 lists the label in his 10-05 pass).
4. Minor controls in link tone. Partly done (Skip is already tone="link", :325) | DO NOW | Three bordered full-width buttons sit under the HOLD
   and under the payoff; the 10-06 UX review already asked for "a quiet removal link, not equal-weight buttons", and receipts are tappable on the card.
   Change: SoloRitualScreen.tsx:326, :328, :330, tone="quiet" becomes tone="link" (See week N receipt, Reminders, Remove from this phone).
   Settle/Close this week and Try again stay quiet. Risk: low; tests pin labels and order, not tone, and link keeps a 44 pt target.
5. One line per wallet step. Still relevant | DEFER | The copy lives in the wallet state machines (createMachine.ts:217-240, lifecycleMachine.ts:55-57)
   and is on screen for seconds; not worth touching transaction files tonight.
6. Demo line only while a week needs a stamp. Still relevant | DO NOW (narrow) | The line sits between the poster and YOU SHOWED UP!, the hero frame.
   Hide it only under a stamp, so it still shows in the lead (video row 7), open and missed states.
   Change: SoloRitualScreen.tsx:307, add "&& keptWeek === null" before the <Text>; update the one pinned string at weeksToggle.test.ts:26
   (SoloRitualScreen.test.ts:12 pins only the prefix and still passes). Risk: low.
7. Drop the "Week N" title. Still relevant | DROP | It is the only "Finished"/"Ended" label (the strip says nothing for Ended), and removing it
   re-lays out the hero screen hours before recording.
8. MISSED paper leaves when the next week opens. Still relevant | DROP | It is deliberate (SoloRitualScreen.test.ts:103, "Jack, 2026-10-07") and is
   the only place "went to {destination}" stays up while the next window runs. The clutter is real but small.
9. Home stamped tile matches the ritual screen. Still relevant | DEFER | Home changed this morning and still needs its phone walk, and DESIGN.md now
   keeps the tile's closing-time line on purpose; the mismatch only shows if you leave the ritual inside the 45 s.
10. No "0 of N kept" before a week closes. Obsolete | DROP | The kept-count line is gone from tiles (RitualsHomeScreen.tsx:216). A fresh tile now
    reads "0 of 20 tSKR back", which tileMoney.test.ts tests as "starts at zero"; leave it.
11. No wallet: chooser replaces the dead Lock it in. Still relevant | DO NOW | A judge who taps Start one before Connect sees a faded primary above
    "Set your wallet to Devnet." and two wallet buttons.
    Change: SoloCreateScreen.tsx:477, "{!createComplete && (" becomes "{!createComplete && selectedAccount && (". A render guard only: disabled,
    onPress and create.start() are untouched, and the chooser at :483 then sits where the button was. Risk: low; no pin breaks.
12. Reminder pill out of the stake card. Still relevant | DEFER | A harmless tidy-up on the screen the device tap driver walks; no judge-visible gain.
13. Destinations as one list. Still relevant | DEFER | Effort M and a layout change on the same driver-walked screen; the four rows read fine today.
14. Receipt: no narration, quiet exit. Still relevant | DEFER | The SKIPPED line is unreachable at demo speed (skip is never offered there) and
    "Back to ritual" is the receipt's only button; a link tone gains little.
15. Settings: say it once. Still relevant | DO NOW | The disclosure prints in the Network card and again in the footer, and two secondary jumps are
    bordered buttons beside the one real button (Get test tokens).
    Change: SettingsScreen.tsx: delete :67 (the Network card's second line; the footer at :76 keeps the pinned disclosure), and tone="link"
    on :58 and :72. Risk: low.

DO NOW, best value per minute first (all low risk; one commit, one APK)
1. #4 link tone on three controls (2 min): cleans every frame of the ritual screen, including the Finished screen after the payoff.
2. #3 delete the dark "Back to rituals" (1 min): removes the one control that says "leave" when the screen must stay open.
3. #11 hide Lock it in until a wallet is connected (2 min plus the disconnected walk): the first-run path for any judge who skips the README.
4. #6 demo line off the stamp hero (3 min including the one test string).
5. #15 Settings duplicate and two links (3 min).
Then: npm run typecheck, and vitest on the SoloRitualScreen, weeksToggle, SoloCreateScreen, SettingsScreen and reminders/systemSettings tests.

EXTRA (first-time judge)
E1. Create step 2, red "Not enough tSKR: this needs 20 tSKR." | optional | The default stake is 20 and a fresh wallet holds 0, so every judge (and
    video row 4) sees an error colour before doing anything wrong; DESIGN rule 4 keeps red for failures.
    Change: SoloCreateScreen.tsx:442, swap ErrorLine for <Text style={styles.quiet} accessibilityLiveRegion="polite"> with the same words.
    Risk: low; the test pins only the text. It quiets a message rather than clarifying one, so your call.
Beyond that I found nothing on the first-run path worth touching.

FIRST-RUN EXPLAINER: no. Rely on the design, README and video. Reply "agreed" to accept or "add" to reject.
The first screen already says the idea in one line with one button ("Show up, or pay up." and Start one), and each step labels itself
(NEW RITUAL · 1 OF 2, IF YOU MISS A WEEK, IT GOES TO, a ticking "Week 1 opens in 45s", HOLD TO STAMP). Any explainer, a screen or a line, is added
narration: it breaks "never add anything" and DESIGN rule 3, and a screen also needs a first-launch flag and its own device test tonight. What
actually stalls a judge is outside the app, a Seed Vault left on Mainnet, which the app cannot detect (FACTS), so no splash could warn about it;
README step 2 and the existing "Network mismatch" popup cover that. The better use of the time is the README, which is the explainer: L14 still
describes step-1 suggestions the app no longer has, and L31 still shows the "1 of 4 kept" tile line that today's Home change removed (FACTS L68
carries the same suggestions line).
