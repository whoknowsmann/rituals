Rituals Android widget — the stamp has opinions

Design

The app's own double-ruled ink stamp is the character, not a new animal mascot.
Nine shape-only expressions share one slightly rotated rubber-stamp ring. The
face carries status; a Fraunces 900 hero carries the consecutive-week streak
while active, or the kept/total tally (such as 1/6) when finished. Its small
label sits directly beneath it: “week streak” or “weeks kept”.
One short Figtree line nags or celebrates. No punch dots, stake header, pill or
extra narration. The tagline remains unchanged elsewhere: Show up, or pay up.

State       Face         Example line                    Stamp ink / paper
open        calm         Week 1 is open.                  dark / #C8F560
concerned   side-eye     Your 5 TEST has opinions.        dark / #C8F560
alarmed     alarmed      Nearly closed. Stamp it.         dark / #C8F560
stamped     joyful       You showed up.                   #2F6B2A / #FFFDF8
missed      sad          5 TEST went to your cause.       #8C8377 / #EAE3D6
resting     closed eyes  Week 2 opens in 3h               dark / #FFFDF8
finished    content*     Ritual finished.                 #2F6B2A / #FFFDF8
empty       expectant    Start a ritual?                  dark / #C8F560
closing     neutral      Week closed. Open Rituals.       dark / #FFFDF8

* Finished uses a neutral face with dark ink unless more than half of all weeks
were kept. Grey ink is reserved for confirmed misses, not completion or closing.
The concerned glance has two right-shifted pupils, one lowered flat brow and a
small flat mouth, with no overlapping eye strokes. Sad brows rise toward the
middle over a shallow downturned mouth: disappointed, never mocking.
Dark ink is #1D1A16. Ritual tint remains the background, with paper-white text;
empty uses warm app paper. The stamped streak numeral celebrates in #C8F560.
Misses never turn red. The open, concerned and stamped lines use deterministic
FNV-1a address/week/state selection, matching reminders' hashing/voice without
changing that feature. Literal “Last hour. Stamp it.” is used only in the final
hour of a real window; accelerated demos and earlier proportional urgency say
“Nearly closed. Stamp it.” All authored messages fit a 30-character budget.

The complete cause label is stored. Receipt copy names it when the full amount
and cause fit; otherwise it says “5 TEST went to your cause.” A very long amount
uses “Stake went to your cause.” Neither amount nor destination is truncated
into a different one. The actual app receipt names Northside Food Bank (demo).

Layout

The provider is unchanged: 110dp minima, 2x2 target, horizontal|vertical resize,
30-minute updatePeriodMillis. Root is match_parent with radius.lg (20dp) and
14dp padding. At a square placement the SVG box takes about 55% of inner height,
the hero/label stack 30%, and the message the remainder. The empty face gets 72%.
The label has a 9dp or 12dp budget directly under the number with no added gap.
Both texts are centred and fitted to the full available text width, including
two-digit tallies such as 16/16; their combined height stays within the budget.
The display uses available width AND height, not an empty weighted header.

A width of at least 240dp and aspect ratio of at least 1.5 switches to a large
face on the left and numeral, message and small single-line ritual name on the
right, centred within that text column. Both foreground refresh and headless
resize pass the host dimensions.
Text has bounded lines and native font fitting; only the wide ritual name is
ellipsized. All UI is FlexWidget/TextWidget/SvgWidget from the installed 0.16.1.
SVG is self-contained shapes: no fonts, images or URLs. Text uses the existing
bundled Fraunces_900Black and Figtree 400/600 assets. OPEN_APP is the only action.

Clock, selection and streak

WIDGET_THRESHOLDS in widgetModel.ts is the single urgency constants block:
  concerned: remaining <= one third of the stamp window;
  alarmed: remaining <= 15% of the stamp window (takes priority);
  windows >= 86400 seconds additionally use <= one day / <= one hour floors.
Opens and deadline are inclusive. No countdown runs between Android updates.
A stamped week celebrates through its window, then rests until the next opens;
a final stamped week keeps its joy until a completed account is observed.
A confirmed miss stays quiet until the next week opens. An expired unconfirmed
week displays closing, never claims settlement or a transfer. The clock can
advance to a later saved window, but cannot advance the on-chain account or
settle it; opening the app handles any required catch-up.

Selection re-runs at render time across ALL saved candidates: open unstamped
week with nearest deadline; else newest active; else newest finished. Ties use
newest remembered order. Funding, cancelled, group and unreadable rituals are
not candidates. Known order determines tint, as on Home.

Streak = consecutive kept weeks counting backwards from the most recent
decided week. A confirmed current stamp is kept before settlement. Future and
open unstamped weeks do not break it. A miss resets it; subsequent kept weeks
start a new run. Skips/voided refunds are not stamps and break the run. Unread
closed history or an expired unconfirmed week also stops the count rather than
claiming an unverified streak. These conservative unknowns are not shown as
confirmed misses. Finished tally counts stored kept outcomes, not future weeks.

Data boundary and freshness

@rituals/widget/v3 holds { rituals: [...] } in oldest-first remembered order.
Each candidate contains address, title, tint, active, stakeLabel, causeLabel and
weeks: [{ opens, deadline, outcome }]. Times are integer Unix seconds; outcomes
are pending, kept, missed, skipped or unknown. The decoder validates all
candidates, ordered nonoverlapping windows, outcome values and colour, and
drops extra fields. It stores no notes, keys, wallet objects or balances.

v2 cannot reconstruct week windows; it is not migrated. Open Home once after
updating to publish v3. Until then the widget shows the empty invitation.
The serialized foreground publisher caches all candidates across restarts,
removes forgotten rituals, and clears on empty successful Home loads. Home
batch results supply closed outcomes; current confirmed claims can immediately
add a kept week. Detail uses its existing enriched history. Declared skip
metadata overrides Home's refunded done cells; observed voided events are
skipped, never kept. No extra chain reads were added.

Existing write points remain wired: Home load/batch outcomes, create readback,
SoloRitual's content-change hook, and redraw after confirmed stamp/manual or
automatic settlement. Immediate confirmation redraw can precede the fresh
bundle that writes its outcome. Foreground failures remain best-effort and do
not block app actions. Reminders, screens, shared product models and native
configuration were not modified.

Headless add/update/resize reads AsyncStorage and Date.now() only, then selects
and projects. It ignores deletion and other widget names. No RPC, network,
alarms, scheduled transactions or background polling. Android's 30-minute
minimum is inexact and can be delayed by battery policy or force-stop. Entire
demo windows may pass between redraws. The app is required for fresh results.

Verification and device handoff

Executed for this polish: npm run typecheck passed; npm test -- src/widget
passed 55 tests in 7 files; the full npm test ran once and passed 2,396 tests
in 141 files (baseline 2,382 / 141). Added regression coverage for finished
kept/total heroes, active streaks, dark finished ink, separated side-eye strokes,
sad geometry, and stacked label budgets at minimum, 2x2 and 4x2 sizes. The full
run emitted bigint native-binding fallback warnings and expected negative-path
logs, with no failures. No rebuild or device verification was attempted.

Widget tests exercise the actual installed JS primitive converters/serializer,
with the native asset resolver stubbed only for SvgWidget's unused numeric
image path. They check square/wide composition, dp budgets, custom fonts,
inline SVGs and OPEN_APP. State/streak/selection tests cover threshold edges,
short/banned-word-screened copy, persistence and process restart. Runtime
handler tests advance Date.now() against the same saved snapshot; the existing
import-graph check excludes headless network/RPC/foreground adapters. The
plugin test still checks provider sizing, periodic interval and bundled fonts
through an in-memory filesystem, not prebuild.

Device-only checks remain: Fraunces/Figtree rendering and font fitting, SVG
scaling/line weight at actual launcher density, text clipping under large font
settings, 2x2 versus 4x2 physical layout, cold/warm tap behavior, and periodic
refresh timing under Android battery policies. JS tree tests are not pixel
screenshots. No installs, builds, prebuild, Gradle, adb or device actions are
part of this redesign. Existing native plugin/font setup is unchanged.
