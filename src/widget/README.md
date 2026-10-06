Rituals Android widget

Home tile repair

One resizable 2x2 Home tile, not a receipt. app.json uses minWidth/minHeight 110dp, targetCellWidth/Height 2, resizeMode horizontal|vertical. The previous 146dp minimum requested three rows on the owner's launcher. Provider minima select launcher cells; they do not guarantee the actual rendered dimensions. Existing placements may retain their previous footprint: remove/re-add or resize after updating the native binary.

The root uses the launcher's full width/height, ritualTintAmong's Home tint, radius.lg (20dp), and 14dp padding. The top group has a small uppercase stake label (e.g. 5 TEST / WK, Figtree 600, letter spacing 1, paper at about 75% opacity) and a 22sp Fraunces 900 name, limited to two lines with end truncation. The bottom group has one dot per week, the Home short count, and a single-line rounded status pill. Figtree 400 is used for counts and 600 for the pill. Text is paper white (#FFFDF8); a passive pill has translucent white fill, while an action pill uses the requested #C8F560 and dark goInk text. The optional orb is omitted. No receipt sayings or redundant Week N of M line.

The weighted header occupies the space left after measuring the footer. Its title is explicitly left/top aligned rather than centered in that space; the footer stays at the bottom. At a 2x2 placement the two groups fill the square; on a 2x3 stretch only the space below the name grows. A bounded title area prevents a long name from displacing the footer. There is no fixed root height. Dot sizes/gaps adapt to the reported width, including a rounding allowance for native physical pixels, so up to sixteen weeks remain one row. Very small placements and large accessibility scales still need native measurement checks; JS tree tests are not screenshots.

Empty: hide stake label, dots, and count; show Start a ritual? and the lime Open Rituals pill. The root tap is still OPEN_APP, never a transaction. A cold launch uses normal app navigation; a warm launch may resume the existing screen rather than Home.

Content and data boundary

Selection uses reverse remembered order (listKnownRituals appends new rituals): newest available active solo ritual, otherwise newest available completed solo ritual. Activity comes from the ritual account, not a terminal current event. Funding, cancelled, group and unreadable rituals are not candidates. Reading an older detail screen does not displace a newer active candidate in the foreground cache. On process restart the saved selection seeds that cache; Home repopulates other candidates. This is not a second database of all rituals.

Home's existing readSoloWeekOutcomes batch feeds soloHomeCells unchanged. Closed results are kept/done when settled without forfeiture or voided/refunded, missed when settled with forfeiture, and neutral closed when unread. The active index is now; later weeks are future. A confirmed stamp changes the pill but does not turn the current ring into a closed-week kept dot or increment the kept count. The count is weekSummaryShort(cells), e.g. 1 of 4 kept; only done cells count. Detail reads use their enriched history with the same eventOutcome convention, without extra RPC. For Home batches an absent history entry remains neutral rather than falling back to inferred outcomes from the current bundle.

Dot rendering: done = filled paper white; missed = filled dark ink; unread closed = the same neutral dark mark Home uses for closed/missed; future = transparent with a 35%-opacity paper outline; now = transparent with a stronger paper ring. Unread closed cells do not count as kept or assert a confirmed miss.

Pill text and act come directly from tileStatus(), never widget-specific replacement copy. In this branch that means:
  claimable/open-not-initialized: Stamp this week (act=true), or Stamped if showedUp.
  waiting: Opens <weekOpensLabel>, or Opens soon if the shared model supplies no label.
  closing/resolving: Stamped if showedUp, otherwise Closing….
  missed: Missed last week; skipped: Skipped last week.
  completed: Finished; awaiting-witness: Waiting on witness; funding: Not active yet.
Only the empty state intentionally supplies Open Rituals with act=true. Waiting dates use the shared formatter, not a custom widget countdown. Headless clock updates may open/close the saved window, but never invent settlement, advance a week, or reopen a terminal current event. Deadline remains inclusive.

The persisted record is @rituals/widget/v2:
  address, title, stakeLabel, cells (ordered per-week array), active, state,
  showedUp, terminalCurrent, opens, deadline, tint

The decoder validates fields, cells, lifecycle state, windows and colour, and drops extra fields. A null record means no supported remembered ritual. No notes, keys, balances, wallet or RPC objects are stored. Title, stake and outcomes are visible on the phone's home screen. v1 only stored aggregate counts and cannot reconstruct dot positions: it is deliberately not migrated. An upgraded widget displays the empty state until a foreground read publishes v2; open Home after installing the update.

Incomplete history no longer blocks the newest ritual or freezes the whole widget. It produces Home's neutral closed cells until the history read succeeds. Empty successful Home loads clear the snapshot. Storage operations are serialized; widget failures remain best-effort and cannot block confirmed app actions.

Freshness and confirmation hooks

Home publishes on successful load and again after its batched outcome read. SoloRitual publishes fresh enriched reads through a hook that compares serialized projections, avoiding writes on every screen clock tick. Create publishes after rememberRitual and confirmed readback. Stamp, manual settlement (including event init), and successful automatic settlement request a redraw; that immediate redraw may precede the authoritative read that publishes the new snapshot. Skip is picked up by the same read hook.

The headless handler reads AsyncStorage only, renders on add/update/resize, and ignores deletion/other widget names. Both foreground and headless rendering pass the host width to the dot layout. Runtime import-graph tests exclude RPC/web3/network/foreground adapters. Registration remains at module scope through App.tsx. Non-Android refreshes are no-ops; missing native support in an old APK is contained, not reported as success.

Periodic updates use Android's 30-minute minimum and may be delayed. Opening labels are values at render time, not ticking timers. A demo-speed week may pass entirely between updates. Open the app for fresh chain results. No background RPC, exact alarms, timer service, or scheduled transactions. Force-stop may prevent headless updates until the app is reopened.

Native plugin and parent handoff

Use the installed react-native-android-widget 0.16.1; no installs or dependency changes for this repair. The plugin copies three already-installed font assets: Fraunces_900Black.ttf, Figtree_400Regular.ttf, Figtree_600SemiBold.ttf. It generates:
  android/app/src/main/java/com/whoknowsmann/rituals/widget/RitualWidget.java
  android/app/src/main/res/xml/widgetprovider_ritualwidget.xml
  android/app/src/main/assets/fonts/<the three fonts above>
  widget_ritualwidget_description in strings.xml
  .widget.RitualWidget receiver and RNWidgetCollectionService in AndroidManifest.xml

The receiver is exported=false with APPWIDGET_UPDATE and the app's WIDGET_CLICK action. The service requires BIND_REMOTEVIEWS. There is no configuration activity or preview PNG. Layout/provider/worker/native-module support arrives through autolinking. A JS update alone cannot update provider sizing or native font assets.

0.16.1 quirk: Expo 52 runs dangerous mods before the manifest mod, but this plugin sets projectPaths in the manifest mod. Run prebuild from the project root, not an unrelated cwd. The plugin-output test executes the actual installed plugin and Expo mod wrappers against an in-memory filesystem sink in that order, asserting provider paths, 110dp/2x2/resizable XML, all three fonts, strings, and idempotent manifest registration. It does not run prebuild or Gradle.

Repair verification

The full npm test run passed: 2,445 tests in 140 files (the supplied branch baseline was 2,411 in 139). npm test -- src/widget passed 104 tests in six files; npm test -- src/widget/widgetPlugin.test.ts passed again separately. The render tests use 0.16.1's actual JS converters/serializer, assert the native tree's grouping, fonts, colours, truncation, tap target and weighted layout, and check 1–16 dots at multiple widths and pixel densities. These tests do not render Android pixels.

npx tsc --noEmit (also with --no-install) was blocked by the CLI security wrapper's package-intelligence network timeout, not a compiler error. The installed compiler was run through npm run typecheck (tsc --noEmit) instead and passed after fixing the unfinished test's incompatible dynamic import/import.meta usage. No dependencies were installed. No native build, prebuild or device operation was performed.

Parent/device checklist (not executed in this repair)

1. Back up native edits; regenerate native plugin output from the project root under the parent's build authorization, then use the parent's Android build/install workflow. No package install is needed.
2. Open Home once to publish v2, remove/re-add the old widget, and verify its initial footprint is truly 2x2. Resize to 2x3 and back; label/name stay top, dots/count/pill stay bottom.
3. Compare the selected ritual, tint, exact pill words and every dot against Home. Check a current confirmed stamp: Stamped pill but current ring unchanged; after settlement the closed dot/count update. Check misses, refunded skips, unread history, waiting and Finished.
4. Check long names truncate after two lines, long date pills truncate without wrapping, Fraunces/Figtree assets load, no content is clipped at normal size, and accessibility font/display scaling remains usable. Check all tint contrasts and sixteen-week rows.
5. Exercise empty state without clearing the owner's app storage or settler key. Confirm Start a ritual?, no stake/dots/count, and lime Open Rituals. Tap both cold and warm app instances.
6. Check newest-active selection, all-finished fallback, removing forgotten rituals, multiple widget instances, offline headless add/resize, reboot and delayed periodic refresh. No wallet prompt should occur from a widget redraw.

Removal/scope

To remove the feature: drop src/widget/, App.tsx registration, the app.json widget plugin entry, and widget calls/imports in Home, SoloCreate and SoloRitual. This repair does not change those screens, reminders, chain programs, account decoders, cadence, navigation, or shared product models. Keep the widget out of the submission if the parent cannot verify the new native binary on Seeker.
