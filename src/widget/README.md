Rituals Android widget — cute, clever, clear

Clarity contract

A stranger glancing at the 2x2 widget for two seconds should know which ritual,
what to do now, by when, what's at stake, and that it's Rituals. This contract
is also the opening comment in RitualWidget.tsx. It is a design target, not a
claim of completed device/user testing.

2x2, top to bottom: RITUALS in spaced Figtree caps; the ritual name in Fraunces
900, one line with end truncation; the expressive ink stamp; one Figtree action
block containing timing and stake; the app's punch-card dots. Exactly three
native text elements, with at most three rendered lines in the action block.
No generic streak headline. Empty has only the brand, waving stamp and invitation.
A legacy blank title displays “Your ritual”; the saved title is not rewritten.

4x2: stamp left; right column contains brand, name, action block, dots. Names
remain Fraunces and single-line truncated in both orientations. The action block
uses native font fitting rather than truncating an amount. The root's only
click action remains OPEN_APP; there is no transaction or signing action.

Copy examples (slashes below denote separate lines, except “TEST / week”)

open       Stamp week 2 · 5 days left   / 5 TEST on the line
concerned  Stamp week 2 · 1 day left    / 5 TEST on the line
alarmed    Stamp week 2 · last hour     / 5 TEST on the line
stamped    Week 2 stamped               / Week 3 opens Tue / 5 TEST / week
missed     Missed week 2                / 5 TEST to your cause
resting    Week 3 opens Tue 9:00         / 5 TEST / week
finished   Done · 4 of 6 kept            / 5 TEST / week
empty      Start a ritual
closing    Week 2 closed · open app      / 5 TEST / week

These are examples, never fixed week numbers, amounts or dates. The snapshot's
chain windows and render-time clock provide all timing. Real remaining time is
floored to whole days/hours (“5 days left”, “1 day left”, “3h left”). “last hour”
is literal, including the inclusive deadline; earlier proportional alarm uses
its actual coarse hours. All open demo-speed states say “Stamp week N · now”,
never a seconds/minutes countdown. Opens use the chain timestamp in device-local
time: weekday alone after a stamp, weekday plus 24-hour HH:MM while resting.
The shared displayFormat.weekOpensLabel was inspected but not reused: its
minute countdown/full date/AM-PM copy is too long for this surface.

Every nonempty state carries stake context. A stamped or finished state says
“5 TEST / week”, not “on the line”: stamping is confirmed, but settlement may
not yet be. The final stamped week has no invented next opening. Resting without
a future window asks to open the app. A confirmed miss names the stored cause
if the entire amount and destination fit 30 characters, otherwise “your cause”.
No guessed short name or fabricated transfer. Pathological amounts use “Your
stake on the line”, “Stake to your cause”, or “Stake per week · open app”, never
rounded/clipped digits. Copy has no mockery, banned product words or random
quips. The pinned tagline is unchanged: Show up, or pay up.

Stamp and progress

All nine original expressions and state colours remain. The double ink rules
now enclose a dashed/ticked rim, keeping it a stamped seal rather than a bare
smiley. Active faces use lime paper (#C8F560), confirmed stamps use green ink
on white, misses use quiet ink on muted paper, resting/closing use dark ink on
white. Completion is content/green only when more than half of all weeks were
kept; otherwise neutral/dark. Grey ink remains exclusive to confirmed misses.
The stamped action block gets the lime accent. Ritual tint stays the background.

Renderer investigation: installed react-native-android-widget 0.16.1's
android/.../builder/widget/SvgWidget.java calls SVG.getFromString, then
renderToPicture and PictureDrawable. Its android/build.gradle pins
com.caverock:androidsvg-aar:1.4 (not react-native-svg). The cached 1.4 runtime
contains Text/TextPath and PlainTextDrawer/PathTextDrawer implementations.
Text-path support exists; it is not claimed to be unsupported. Nevertheless,
tiny curved default-font lettering at the reduced 2x2 stamp size is not verified
on Android here. The conservative fallback is shape-only rim ticks plus a
readable native RITUALS label; no SVG legend or external font/asset dependency.

punchCard.ts draws one mark per week, at most eight per row (up to 16 weeks).
Home's language: kept = white filled, missed = dark filled, upcoming = hollow,
current = heavier open ring. A skip is a dash, unread/expired unconfirmed history
is hollow with a small centre mark. Neither is a fabricated kept/missed result.
Finished dots retain the complete outcome history. Streak calculation is still
available in the model with its existing semantics, but no longer occupies UI.

Sizing

The root has match_parent dimensions, radius.lg and 8dp padding. Copy gets an
explicit dp budget before the square stamp uses the remainder. At heights of
140dp or more: brand 14dp, name 24dp, action 44dp, dots 12dp (24dp for >8 weeks).
Shorter placements use 10/16/32dp copy budgets. Empty omits name/dots and uses a
26dp action budget. Horizontal mode starts at width >=240dp and aspect >=1.5;
its face uses up to 43% of inner width with a 12dp gap before the text column.
Both foreground and headless refresh retain the host's actual width and height.
The 110dp minimum has bounded geometry, not proven two-second legibility; small
placements and accessibility font sizes need device inspection. JS tree budget
assertions are not proof that Android's rasterized text is readable.

Unchanged clock, selection and data boundary

WIDGET_THRESHOLDS remains the single urgency constants block:
  concerned: remaining <= one third of the stamp window;
  alarmed: remaining <= 15% of the stamp window (takes priority);
  windows >=86400 seconds additionally use <=one day / <=one hour floors.
Opens/deadline are inclusive. No clock runs between Android widget updates.
A stamped week celebrates through its window, then rests until the next opens;
a final stamped week keeps its joy until a completed account is observed.
A confirmed miss stays quiet until the next week opens. An expired unconfirmed
week displays closing, never claims settlement or a transfer. Clock projection
can advance to a later saved window, but never advances the chain account.

Selection re-runs across ALL saved candidates: nearest open unstamped deadline;
else newest active; else newest finished. Ties use newest remembered order.
Funding, cancelled, group and unreadable rituals are not candidates. Known
order determines tint, as on Home. Streak still counts consecutive kept weeks
backwards from the latest decided week; skip/miss/unread closed history breaks
it. Open unstamped/future weeks are ignored; a confirmed current stamp counts.

@rituals/widget/v3 stores { rituals: [...] } in oldest-first remembered order.
Each candidate contains address, title, tint, active, stakeLabel, causeLabel,
and weeks: [{ opens, deadline, outcome }]. Unix seconds, ordered nonoverlapping
windows; outcomes pending/kept/missed/skipped/unknown. Decoder and persistence
are unchanged. No keys, notes, balances or wallet objects are stored. v2 cannot
reconstruct these windows; open Home once to publish v3 rather than migrate.

The serialized foreground publisher caches all candidates across restarts,
removes forgotten rituals, clears on empty successful Home loads, and uses the
existing Home/detail/confirmation data. Declared skips override refunded done
cells. Existing create/stamp/manual/automatic-settlement refresh points remain.
No extra chain reads, screen changes, reminders changes or native config changes.
Headless add/update/resize reads AsyncStorage and Date.now() only; no RPC, network,
alarms, transactions or polling. It ignores deletion and other widget names.
Android's unchanged 30-minute update period is inexact and can be delayed by
battery policy/force-stop. Entire demo windows may pass between redraws. Open
the app for fresh chain results; local copy does not imply a continuously fresh
balance, settlement or countdown.

Verification and device handoff

npm run typecheck passed. npm test -- src/widget passed 96 tests in 7 files.
The full npm test ran once and passed 2,437 tests in 141 files (baseline
2,396 / 141). It emitted bigint native-binding fallback warnings and expected
negative-path logs; there were no failures.
Tests use the installed JS converters/serializer (only the unused numeric
SvgWidget asset resolver is stubbed), covering both layouts, three-text limit,
Fraunces truncation, explicit budgets at 110/160/180dp and wide/tall placements,
all faces/colours, 1–16 punch dots, finished Read regressions, all state copy,
chain-time edges, local weekday/time, exact stakes and conservative unknowns.
Existing persistence, restart, selection, headless no-network graph and in-memory
plugin checks remain. No install, build, prebuild, Gradle or adb was run.

Device-only: actual Fraunces/Figtree sizing, title ellipsis, action wrapping/font
fitting, rim-tick weight and expression legibility, 2x2/4x2 balance, large system
fonts, cold/warm tap opening, and periodic refresh under battery restrictions.
