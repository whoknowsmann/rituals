Rituals Android widget

Scope and removal

One fixed 2x2 home-screen poster (146dp minimum, launcher target 2x2). The square leaves room for the ritual name as the hero and for week, counts, and a quiet status below. Long names truncate after two lines; the miss sentence may wrap onto two lines. All text uses paper white (color.card) over exactly ritualTintAmong's Home tile colour. The native widget font is Fraunces_900Black, copied from the already-installed Expo font package; Android's library falls back to system type if the asset is unavailable, with weight 900 still requested. No preview PNG is required by 0.16.1, so none is included.

The root tap is OPEN_APP, not a transaction or background action. On cold launch the app's normal navigation opens; a warm launch can resume the existing screen. This does not add URL routing or guarantee Home on warm launch.

Remove src/widget/, the App.tsx registration import, the app.json widget plugin entry, and the widget imports/calls in Home, SoloCreate and SoloRitual to drop this feature. The dependency was already present before this branch's implementation. No chain program, script, key, account decoder, cadence, navigation, or existing product model was changed.

Data boundary

widgetModel(known, outcomes, nowSeconds) is pure apart from the device's local weekday formatting. Inputs are plain projected outcomes, not native modules or React state. The foreground widgetBundle adapter reuses soloRitualModel and takes actual windows from account.schedule; there are no cadence constants in widget code. Waiting labels use M:SS under an hour and a local weekday otherwise. Deadline is inclusive, as in the solo lifecycle. After the deadline an unstamped snapshot says Closing…; time alone never invents settlement, a missed count, or another week's index.

Selection follows reverse remembered order (listKnownRituals appends new rituals), with active solo rituals preferred over completed ones. If none remain active, the latest available finished ritual retains its result. Funding, cancelled, group and unreadable rituals are not candidates. The module caches foreground projections so reading an older screen does not replace the newer active ritual. On process restart the saved selected snapshot seeds that cache; Home's complete load repopulates the other candidates. Until Home loads, only the saved selection and subsequently read rituals are available; this is not a second database of every ritual.

The only persisted widget record is @rituals/widget/v1:
  address, title, weekIndex (zero-based), weekCount, kept, missed, status, opens, deadline, tint
A null record represents no supported remembered ritual. The decoder rejects malformed JSON, unknown statuses, invalid counts/windows/colour and discards extra fields. There are no notes, keys, balances or wallet data in the snapshot. The title and counts are visible on the phone's home screen.

Kept/missed come from closed event outcomes plus a confirmed current stamp, counted once. Home's existing convention treats a voided/refunded week as done; the widget counts that as kept too, but names a known skip as Skipped last week. This is not a claim that a skipped week was stamped. Completed snapshots preserve the last result rather than choosing a miss just because any earlier week was missed.

Incomplete history does not become zero counts. The adapter refuses it and leaves the previous snapshot alone. Home only replaces its candidate cache when all supported candidates have complete outcomes; its existing batched history read supplies those. This can leave the entire widget stale when one historical read fails. Empty successful Home loads clear the snapshot. Widget failures are best-effort and do not block app actions.

Freshness and confirmation hooks

Home publishes on its successful load and again with closed-week outcomes. SoloRitual publishes from fresh enriched reads through a hook that compares the serialized projection, so the screen's one-second clock does not cause one storage write per second. Create waits for rememberRitual, then projects the confirmed readback's real schedule. Stamp, manual settlement (including its event-init step), and successful automatic settlement each request a redraw. Those immediate redraws can show the previous snapshot; the ensuing authoritative read publishes the confirmed state. Skip is picked up by that same ritual-read hook.

The headless handler only reads AsyncStorage and renders the snapshot. Its transitive runtime import graph is source-pinned against RPC, web3, network calls and foreground adapters. It handles add/update/resize, ignores deletion and other widget names, and registers at module scope from App.tsx so cold headless startup does not need a React screen mount. Native imports are separate from every module imported by model/storage unit tests. Non-Android refreshes are no-ops; missing native-module errors in an older APK are contained, not treated as widget success.

Android's periodic update is configured at its 30-minute minimum, and the OS may delay it. Opens in 1:30 is a value at render time, NOT a ticking countdown. A two-minute Demo-speed week may pass entirely between launcher updates. Open the app to get fresh chain results; no background RPC, exact alarms, timer service, or scheduled transactions have been added. A stale snapshot is accepted by design, including when the app has not run for days. Force-stopping the app can prevent headless work until it is reopened.

Config plugin / expo prebuild

Use the installed and lockfile-pinned react-native-android-widget 0.16.1. Do not upgrade its line just for this feature. app.json defines one RitualWidget, a description, 146dp x 146dp minimum, 2x2 target cells, resizeMode none, updatePeriodMillis 1800000, and the existing Fraunces TTF path. No configurable activity or preview image is requested.

On expo prebuild the widget plugin adds/generates:
  android/app/src/main/java/com/whoknowsmann/rituals/widget/RitualWidget.java
    A class extending com.reactnativeandroidwidget.RNWidgetProvider.
  android/app/src/main/res/xml/widgetprovider_ritualwidget.xml
    Size/update attributes above, home_screen category, @layout/rn_widget initial layout,
    and @string/widget_ritualwidget_description. No preview/configuration attributes.
  android/app/src/main/assets/fonts/Fraunces_900Black.ttf
    A copy of node_modules/@expo-google-fonts/fraunces/900Black/Fraunces_900Black.ttf.
  android/app/src/main/res/values/strings.xml
    Non-translatable widget_ritualwidget_description = Your weekly promise.
  android/app/src/main/AndroidManifest.xml
    Receiver .widget.RitualWidget, exported=false, label Rituals;
    actions android.appwidget.action.APPWIDGET_UPDATE and com.whoknowsmann.rituals.WIDGET_CLICK;
    metadata android.appwidget.provider -> @xml/widgetprovider_ritualwidget;
    service com.reactnativeandroidwidget.RNWidgetCollectionService with BIND_REMOTEVIEWS permission.

The library's layouts/provider/worker and native module arrive through normal React Native autolinking, not copied by this plugin. Its Android Gradle dependencies include concurrent-futures 1.1.0, WorkManager 2.8.1 and androidsvg-aar 1.4. Those can affect dependency resolution, manifest merging, native architecture/codegen and the final Android build even though TypeScript is green. An existing APK or Expo Go cannot acquire widget support from a JS update alone.

Important 0.16.1 quirk: dangerous mods run before the manifest mod in Expo 52. This plugin initializes projectPaths inside its later manifest mod, so its generated Java/XML/font paths are initially relative to cwd. Run prebuild from the project root, not by passing an unrelated project path from elsewhere. The plugin harness executes the installed plugin with real Expo mod wrappers and an in-memory filesystem sink in that order, verifying the exact paths/content and idempotent manifest registration. It does NOT prove a complete prebuild or a Gradle build; no native files were generated in this task.

Parent verification (not executed here)

1. On the integration branch, commit/back up existing native edits. From that project's root run npx expo prebuild --platform android --no-install under the parent's build authorization, then inspect the generated paths, font and manifest above. Use the parent's established Android build/install workflow for a new binary; no dependency install is needed for this change.
2. On Seeker, long-press an empty launcher area, choose Widgets, find Rituals, and place its 2x2 widget. For empty-state proof use a fresh test installation or a phone with no remembered rituals; do not clear an existing user's app storage or settler key. Expect Start a ritual? and a tap that opens Rituals.
3. Create a three-week Demo-speed ritual with a distinctive title. After Locked in., return to the launcher. Match its name/tint against Home, Week 1 of 3 and 0 kept · 0 missed, with Opens in M:SS before the chain's opening. The text need not tick while on the launcher.
4. At the on-screen opening, visit the ritual then return to the launcher: expect Stamp this week. Hold to stamp and approve; wait for the authoritative stamped screen, then return. Expect Stamped and 1 kept · 0 missed. Let the app close the week; check Week 2 of 3 and no doubled count.
5. Leave the next week unstamped. After its resolution, reopen the ritual and let automatic settlement finish. Before the following opening, the widget must say That's a week, not a verdict. and 1 kept · 1 missed. Revisit at the following opening; Stamp this week must replace that sentence. Separately exercise the manual close/settle fallback if an approved test ritual lacks a working settler.
6. Create a newer active ritual and check selection and tint. Open the older ritual: selection must stay newer. Complete the newer ritual, reload Home and expect the older active one; complete all and verify the latest finished result, with Week M of M rather than M+1. Remove finished rituals using the app UI and reload Home; with none remembered, expect the empty widget.
7. Add a second widget instance, background/swipe the app away (not force-stop), toggle airplane mode and remove/re-add a widget. A headless add should render the last snapshot offline, without a wallet prompt. Observe periodic refresh after at least 30 minutes; OS scheduling may delay it. Tap both widgets, including with the app already open.
8. Check a long ritual title, default and large font/display scales, paper-white legibility against every used tile tint, miss-message wrapping, Fraunces rendering, cold launch, reboot, and launcher sizing. These are device-only checks; unit/source/plugin tests cannot certify them.

If shipping in an hour, cut the entire widget unless its new native binary has passed the Seeker smoke. It is optional; do not risk the core create/stamp/settle submission to keep it. If only font loading fails, remove the plugin fonts option and the fontFamily property to retain a bold system title. Do not promise minute-level reminders from this implementation.
