# Rituals widget v2: design proposal (2026-10-08)
Design only; no code touched. Basis: src/widget/ in the preflight-widget worktree (branch per the briefs: exp/reminders-widget), shots x1-x6, widget-duo and widget-clarity briefs,
DESIGN.md, FACTS.md, Home logic (tileStatus, tileMoney, homeSections). Verdict in one line: design it now, ship it after judging (section 7).
Evidence limits: Duolingo pages could not be fetched (web_extract backend is search-only, no browser), so section 1 uses search snippets [s] and the earlier brief [b, unverified].
No device run. Contrast ratios are computed from hex values, not measured on the phone.

## 1. Duolingo's widget: what it shows, why it works
Shows Duo plus the streak number. Duo's face follows whether today's lesson is done. One tap opens the app. The small size carries almost nothing else.
- [s] Duolingo blog: it began as a hackathon project to display "a user's most relevant learning stats"; the widget "will remind you whether or not you've extended your streak that day".
- [s] A third-party summary (not primary): Duo's expressions grow "increasingly concerned as the day progresses". [b] About 25 faces, each paired with one short line.
- [s] Reddit threads: even Duolingo's widget sometimes shows a wrong or frozen streak. Staleness is normal; design for it.
Why it works (my read): (1) one question, "did I do today's lesson?", answered by face and colour; (2) one number you could lose, so no label is needed; (3) a shared clock ("today"), so no
date copy; (4) the hero's mood escalates as the deadline nears; (5) one tap to the obvious place; (6) daily cadence, so every glance has stakes. Steal: one hero, one number, mood = urgency,
one tap. Skip: guilt voice, endless streak, 25 faces. The "half of widget users keep 6-month streaks" figure is selection bias (people who care install widgets); I do not use it.

## 2. Why Rituals is a different beast
1. Weekly, not daily. Real weeks: 6-day window, 23 h grace, 7-day week. A good user stamps early, so "stamped, next opens Tue" is the resting state. There is no shared "today".
2. Several rituals, each with its own windows, length and stake: one priority rule and a collapse, not a list.
3. Money. Honest = the week's share only, exact (formatAtomic never rounds), always "tSKR", never "back" before settlement (a confirmed stamp is stored as kept before the vault pays), never
   summed. DESIGN calls money a quiet fact; a loud number would also read as a wager.
4. Demo vs real. A 1-minute week is over before a widget can redraw and nothing on a widget ticks, so demo windows must show copy that stays true.
5. Refresh. updatePeriodMillis has a 30 min floor ([s] Android API reference; library type: 1,800,000 ms), is inexact, and Doze can delay it. The app pushes (requestWidgetUpdate) only on its
   own events: create, stamp, settle, Home and ritual reads. Time passing pushes nothing. Rule: every line is true when stale, or carries an absolute time.
6. No wallet. Home shows the connected wallet's rituals only (10-08), but the widget snapshot holds every remembered ritual, so it could show one the app hides.
7. Nothing created, or all finished: invite once; a finished card must not sit on the home screen forever.

## 3. The widget: one job, one hero, one number, one tap
Job: answer "do I owe a stamp, and by when?" in two seconds. Nothing else gets a slot. Sizes: 2x2 (design at ~170 dp wide, estimated from x6; degrade to the 110 dp minimum), 4x1, 4x2.
- Hero = the ritual that needs you most (rule 3a). Its name is the loudest text: Fraunces 900, two lines, ellipsis, never shrunk (a " · detail" tail on a title is dropped). The face becomes a
  status mark (~30% of the tile, was 55%).
- Number = that ritual's weekly share in tSKR, shown only while it can change: at risk (owes) or just moved (missed). A quiet line under the verb; never summed. Progress is the dots (4x2) or
  "3 of 4 kept" (finished). Cut: streak (rituals are finite, skips are legal, Home moved from counts to "X of Y tSKR back", a bare flame-style number is the "mood tracker" problem again) and
  "stamps this week across rituals" (windows differ per ritual, so "this week" has no shared meaning; the badge covers it).
- Character: lime paper = act (a stamp is owed, or start one; calm, side-eye, alarmed by time left); cream = quiet; green ink = done; grey = missed (never red, DESIGN rule 4). Words carry the meaning.
- Tap: the whole tile opens the app (Home lists "Stamp this week" tiles first). It never signs or stamps. v2.1: deep link to that ritual's screen.
3a. Priority (render time, connected wallet only, each ritual on its own windows):
  A owes: open unstamped window; earliest deadline, then larger weekly share, then Home order.  B news: closing, or missed until the next week opens; newest deadline first.
  C quiet: active, nothing owed; earliest next opening.  D finished <= 3 days ago; newest first.  Else EMPTY. Demo-window rituals never enter A or B; they rank in C by newest.
Badge "N to stamp": N = rituals owing now, tier A only, N >= 2 (bare "N" under 140 dp wide).
Copy rules: <= 16 chars per line at 2x2; weekday or clock time, never a countdown ("by Sun", "by 9 PM" inside 24 h); no "back"; no flavor text; amounts exact, a line that cannot fit is dropped.
Clarity check (owner's five questions): which ritual = the name; what now = the verb line; by when = the weekday or time in it; what's at stake = the number; that it's Rituals = tint, stamp and the
launcher label, with RITUALS text only in EMPTY and NO WALLET. "Show up, or pay up." stays off the widget (pinned, no room, it would be narration).
Mockups (face glyphs stand in for the stamp faces; tint is the ritual's Home colour):
 OWES, calm              OWES, 2 rituals         STAMPED                 MISSED
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ (^_^)              │  │ (O_O)  [2 to stamp]│  │ (^o^)              │  │ (;_;)              │
│                    │  │                    │  │                    │  │                    │
│ Go for a run       │  │ Go for a run       │  │ Go for a run       │  │ Go for a run       │
│ Stamp by Sun       │  │ Stamp by 9 PM      │  │ Week 2 stamped     │  │ Missed week 2      │
│ 5 tSKR this week   │  │ 5 tSKR this week   │  │ Next opens Tue     │  │ 5 tSKR sent        │
└────────────────────┘  └────────────────────┘  └────────────────────┘  └────────────────────┘
 4x1                                                 4x2
┌────────────────────────────────────────────────┐  ┌────────────────────────────────────────────┐
│ (^_^) Go for a run           Stamp by Sun  [2] │  │ (O_O)  Go for a run            [2 to stamp]│
└────────────────────────────────────────────────┘  │        Stamp by 9 PM · 5 tSKR this week    │
                                                    │        ●●○○      Also: Read · by Mon       │
                                                    └────────────────────────────────────────────┘

## 4. States (line 1 is always the ritual name, Fraunces)
| state | trigger | hero: face, paper | number | line 2 / line 3 | tap |
|---|---|---|---|---|---|
| OWES calm | tier A, > 1/3 of window left | calm, lime | 5 tSKR | Stamp by Sun / 5 tSKR this week | Home |
| OWES tight | <= 1/3 left, or <= 1 day (real weeks) | side-eye, lime | 5 tSKR | Stamp by 9 PM (inside 24 h) / same | Home |
| OWES last | <= 15% left, or last hour | alarmed, lime | 5 tSKR | same as tight | Home |
| STAMPED | confirmed stamp, now <= deadline (or final week) | joyful, green ink on cream | none | Week 2 stamped / Next opens Tue (last: Final week) | Home |
| WAITING | active, nothing open or owed (before week 1, between weeks, after a skip) | resting, cream | none | Week 3 opens / Tue 9 AM | Home |
| CLOSING | deadline passed, no result seen | neutral, cream | none | Week 2 closing / Open the ritual | Home; v2.1 ritual screen (it settles there) |
| MISSED | settled with a forfeit, until next week opens | sad, grey | 5 tSKR | Missed week 2 / 5 tSKR sent (4x2: went to <destination>, else where you chose) | Home |
| FINISHED | Completed, <= 3 days since last deadline | content (> half kept), else neutral | none | Finished / 3 of 4 kept | Home |
| DEMO | window < 1 day (any demo week) | neutral, cream | none | Demo speed / 1 of 2 kept | Home |
| EMPTY | no active ritual, no snapshot, or finished > 3 days ago | expectant, lime | none | RITUALS (small) / Start a ritual | Home ("Start one") |
| NO WALLET | app wrote a signed-out snapshot | neutral, cream | none | RITUALS (small) / Connect wallet | Home (connect) |
Thresholds unchanged (WIDGET_THRESHOLDS). Skipped weeks show as a dash in the dots.

## 5. Several rituals
- One hero, ever. 2x2 never lists. Others appear only as the "N to stamp" badge and, on 4x2, one "Also: Read · by Mon" line. Home already sorts stamp-needed tiles first, so a tap lands beside the hero.
- Numbers stay per ritual (the hero's own share), so three rituals never read as one big bet. Different lengths, stakes and schedules need no special case: ranking uses each ritual's own windows.
- 0 rituals: EMPTY. Wallet gone: NO WALLET. All finished: FINISHED for 3 days, then EMPTY. Out of v2: pin-a-ritual per widget (widgetFeatures "reconfigurable" plus a config screen).

## 6. Compared with the current widget (9 states, big stamp, streak model)
- KEEP: the stamp character and all 9 faces; the thresholds block (1/3, 15%, 1 day, 1 hour); snapshot-only rendering (no RPC or signing in the headless task); ritual tint; Fraunces/Figtree; OPEN_APP; no "back" before settlement.
- CUT: the 55% face; "RITUALS" caps and dots on 2x2; streak (model and tests); "5 tSKR / week" price-tag lines; lime text on tint (3.4:1 on pink, computed); the immortal finished card; "now" claims on demo windows.
- CHANGE: lead with name + verb + absolute deadline ("Stamp by Sun" replaces "Stamp week 2 · 5 days left"); selection gains tiers B-D and the badge; snapshot scoped to the wallet; DEMO and NO WALLET states;
  picker text "The ritual that needs your stamp, and by when." (was "Your weekly promise"; the x1 picker showed an app icon on a blank preview, so add a real previewImage);
  tint contrast: cream text is 3.2:1 on #F0623F, 3.5 on #C9711F, 3.9 on #13917A (computed), so use ink text on those three or darken them for the widget (ink is 5.4:1 on #F0623F).

## 7. Cost, risk, verdict
Effort on top of the existing code (agent hours; Hermes review extra):
- Re-merge the widget branch onto the current release branch: 1.5-2 h. The three hook screens (RitualsHomeScreen, SoloCreateScreen, SoloRitualScreen) all changed after the fork (checked: wallet scoping, HOLD
  TO STAMP and the destination strings exist only on the main side); STATUS says the old integration branch (a21e86d) was local, untested and predates the clarity pass.
- widgetModel.ts (tiers, badge, DEMO and NO WALLET, new copy, drop streak), widgetSnapshot.ts (signedOut flag), refreshWidget.ts + RitualsHomeScreen (wallet-scoped publish, publish on disconnect): 3 h.
- RitualWidget.tsx (2x2, 4x1, 4x2, text colour by tint): 2 h. Five test files, src/widget/README, one FACTS line, previewImage PNG, app.json description: 2-3 h.
- Native build, install, 3-4 layout passes with screenshots on the Seeker: 2 h wall; Jack ~20 min (one Real-weeks ritual, two approvals).
- Total ~10 h, one calendar day. Lite (2x2 only, no wallet state): ~6 h. Deep link (scheme plus linking prop at AppNavigator.tsx:122; neither exists today): +2 h. Push on ritual-screen state flips: +0.5 h.
Risks:
1. Native change. The main app has neither the react-native-android-widget dependency nor its plugin (checked), so shipping means a new prebuild and APK; the proven create/stamp/settle loop needs a full re-smoke and the FACTS "proven" lines reset.
2. react-native-android-widget 0.16.1: dangerous mods need project-root cwd; every redraw is a headless JS cold start; no clock or chronometer element (Flex, Overlap, List, Text, Icon, Image, Svg
   only); SVG text unverified on device. It builds and places from the launcher (x1-x6) but is not part of the release build.
3. Refresh: 30 min floor plus Doze, so face escalation can lag by hours. The copy is stale-safe; the face is not.
4. Fonts at 110 dp and large system text are unverified. 5. The widget shows in every installer's picker, mentioned or not: a wrong widget is a visible bug, and FACTS needs device proof per claim.
Verdict: AFTER JUDGING.
(1) Judges follow the README at Demo speed. The widget's value, mood escalating over days, cannot show in a 5-minute session; the one state they can see (DEMO) is deliberately static.
(2) It forces a new native build under four days before the deadline plus a merge across three screens, for a feature outside the single blade (stake, stamp, miss, receipts).
(3) Showing it honestly needs a Real-weeks recording; a mock in the video would break "every claim traces to FACTS".
If Jack overrides: go only if merged, Seeker smoke green (create, stamp, settle) and widget screenshots in hand by Sat Oct 10 6 PM CDT; otherwise drop it (one-hour cut: remove the plugin from app.json
and the registerWidget import). Video insert = a separate 6-second clip on a Real-weeks ritual (create, wait 1 min, open the app so it pushes, home screen "Stamp by Wed", stamp, "Week 1 stamped").
Safe now: leave the branch parked; optionally one README What's-next line. Decisions for Jack: tSKR on the home screen? streak cut? Demo rituals static?
