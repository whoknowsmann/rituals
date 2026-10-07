Local Real-weeks and Demo-speed reminders

Boundary and contract

  planner.ts and lines.ts are pure. Pass the confirmed account's schedule
  (opens/deadline/resolution, bigint or number) and an explicit nowSeconds.
  ritualAddress is an additional required planner option: it namespaces ids
  and seeds deterministic copy. stampedWeeks uses zero-based chain indices.
  The returned at values are epoch seconds; only the scheduler converts to Date.
  Production creation uses read.account.schedule and its perEventAllocation,
  never a fresh selectSoloSchedule calculation after wallet approval.

  Each eligible unstamped Real week (window >= one day) gets open, deadline
  minus 86400 seconds, and deadline minus 3600 seconds. Demo windows (< one day)
  get exactly one open-stage request at opens, no day/hour requests. Only
  strictly future dates, at most 16 weeks; invalid windows get nothing. At
  exactly one day, coincident open/day reminders are deduplicated. No receipt
  or resolution notifications. Recheck the clock after permission and before
  each enqueue: a passed opening is dropped, never shifted to "now".

  Six authored lines per stage. FNV-1a of address/week/stage selects a line.
  Bodies and titles are bounded to 60 Unicode code points. A long stake/cause
  label gets a generic body rather than a truncated amount or misleading name.
  The banned-word test covers authored copy, not arbitrary user-entered titles.
  Demo copy is a fixed deadline statement, e.g. "Demo week 2: stamp by
  2026-10-07 18:30:45 UTC." The full date/time (seconds, explicit UTC) is stable
  across locale/timezone changes and does not claim a late-delivered week is
  still open. It is also <= 60 characters, including week 16.

  scheduler.ts owns only date-trigger mapping and prefix cancellation.
  service.ts owns serialized storage, permission and scheduling operations.
  native.ts is the sole React Native / expo-notifications adapter; runtime.ts
  requires it lazily within the service error boundary. Service tests inject an
  SDK port; adapter tests mock React Native and expo-notifications. Hook tests
  exercise effect bodies/dependencies with mocked React, not a native renderer.
  No backend, push registration, push tokens, credentials or new dependency.

Integration

  SoloCreateScreen: default-on “Remind me each week” switch under the speed
  pills for BOTH speeds. This is visible step 2 (internal step 3 with the
  existing witness step hidden). Demo opt-in warns that alerts can arrive late
  and to follow the in-app clock. Confirmed chain readback invokes afterCreate,
  guarded once per address per screen instance; repeat calls replace the same
  identifiers. Off preferences are recorded without requesting access; an off
  retry clears a previously enabled set. Screen remount never schedules a set.

  One “Rituals” Android channel, default importance. Create the channel before
  asking permission, check current permission first, persist permissionAsked
  before the one request. Denial is logged, not a create failure. Other creates
  and process restarts do not re-prompt. Granting access in Android Settings
  does not automatically rebuild previously denied sets.
  New requests carry data.ritualReminder = 'demo' or 'real'. The Expo foreground
  handler suppresses both alert and sound for Demo anywhere in the foreground
  app, including Home and the ritual screen; Real-weeks behavior stays enabled.
  This handler is not a background notification filter.

  SoloRitualScreen: confirmed claim clears the captured claimEventIndex, not
  the possibly advanced display week. Confirmed skip clears its captured action
  target immediately, without waiting for another RPC read. The hook clears an
  observed chain stamp and the account's skipEventIndex on read/recovery, earlier
  settled indices, every week after its chain deadline, and all completed weeks.
  The persisted stampedWeeks list includes these closed/excluded weeks, not just
  stamps; it must never be used to infer a kept stake. The model's 'skipped'
  state can describe the previous week: never cancel its current eventIndex
  merely because it says 'skipped'. Screen mounting sets up foreground display
  but never requests permission or schedules a set.

  forgetRitual: removes phone record, clears its notification prefix and its
  preference. Other rituals and the global permissionAsked flag are preserved.
  Identifier format: rituals:reminders:v1:<address>:<zero-based-week>:<stage>.
  Storage: @rituals/reminders/v1 -> { permissionAsked, rituals: {
    [address]: { enabled, stampedWeeks }
  }}. Native identifiers need no parallel local ledger: enumerate scheduled
  requests and match the exact colon-terminated ritual/week prefix. Cancellation
  also dismisses matching delivered tray alerts, after cancelling the alarms.
  Both collections are attempted even if one cannot be read/cleared.

  Serial operations avoid lost preference writes, duplicate prompts and
  create/stamp/remove races. Repeated scheduling replaces only that ritual's
  set. A scheduling failure rolls back its partial set. Cancellation tries
  every matching id even if one fails; storage failure still attempts native
  cancellation. Errors use logFailure; denial/count/clear notes use logNote.

Device verification for the parent (not performed by this branch)

  1. Use a disposable TEST-wallet test profile on a Seeker running Android 13+
     and a parent-built binary containing expo-notifications and its plugin.
     An OTA update of an older binary cannot add the native module. Preserve
     the user's existing app data; do not clear their real app installation.
  2. On a clean test profile, enter “Read”, Next. Both speeds have a default-on
     reminder switch. Toggle off/on with TalkBack; checked state is announced.
     Demo opt-in warns about late delivery. Neither selection prompts access.
  3. Create two Real weeks, 5 tSKR each, reminders on. Approve creation; only
     after chain readback should Android ask. Allow promptly. Look for the
     “Rituals” channel at default importance and a reminders Scheduled log.
     Background the app before week one's on-chain opens; expect a notification
     near that time with the ritual title. Do not change the phone clock.
  4. Inspect actual scheduled requests before and after changes, not just logs.
     In a temporary parent-only debug action, import expo-notifications and
     AsyncStorage; await getAllScheduledNotificationsAsync() and
     AsyncStorage.getItem('@rituals/reminders/v1'), then log the results.
     Filter identifiers starting rituals:reminders:v1:<actual-address>:.
     Compare native date trigger values (milliseconds on Android) to that
     account's opens, deadline-86400 and deadline-3600. At most six requests
     for this two-week ritual; exclude any opening already in the past.
     Remove this read-only instrumentation before release.
  5. Once week one opens, hold to stamp and approve. Re-inspect: prefix :0:
     is absent, :1: is unchanged, stampedWeeks includes 0. Restart and reopen
     the ritual; it must not restore :0:. Deny a stamp approval on a different
     unstamped ritual: its pending reminder set must remain.
  6. Before a week opens, declare its skip. Re-read: that account's
     skipEventIndex prefix disappears, but the next week's reminders remain.
  7. Switch to a different test wallet so the active ritual offers “Remove
     from this phone”; remove it. Its full prefix and preference must disappear,
     another ritual's requests must remain, and the chain ritual is unchanged.
  8. In a separate clean disposable profile, deny the permission prompt after
     a Real-weeks create. Creation still succeeds with no pending reminders.
     Create another and restart: no second prompt. Also create with switch off
     at either speed: neither adds requests or asks permission.
  9. Leave a separate unstamped Real-weeks ritual for the day/hour reminders.
     Verify delivery at its actual deadline-24h and deadline-1h, no new receipt
     reminder after resolution. This requires waiting; inspecting the queue
     proves requested timestamps, not Android delivery over six days. Also test
     a reboot, battery saver/Doze and foreground display on the ritual screen.
 10. On an old test binary without the native module, open/create/stamp/remove:
     these must still work and log a reminders failure, not crash. Test this
     separately from the new binary; unit injection cannot prove native linkage.
 11. Create two Demo weeks, reminders on. Inspect one :open request per future
     week, deadline copy, no day/hour alarms. Hold the permission dialog past
     week 1 opens: week 1 must be absent, not delivered on grant. Hold past both
     openings: no alarms. Stamp/skip: that week's pending AND tray alerts clear.
     Leave the ritual screen open past deadlines/completion: closed weeks clear.
     Repeat after process restart; another ritual's requests must remain intact.
 12. Demo opening while foreground: no alert/sound over the app. Real opening:
     existing channel behavior. Background both: alerts can arrive late. Tap
     from warm and cold states: normal app resume/Home, no ritual deep link.

Honest limits and rollback

  Delivery is best effort. Installed Expo 0.29.14 falls back to inexact alarms
  when Android denies exact-alarm access (ExpoSchedulingDelegate.kt). This
  branch does not add exact-alarm permissions or claim second-perfect delivery;
  Doze, force-stop, clock changes and OS settings may delay/prevent alerts.
  Android channel importance affects presentation, NOT alarm precision. Date
  and interval triggers use the same native alarm scheduler; changing trigger
  type is not a precision fix. No JS handler or native expiry/TTL in this SDK
  can veto a late local alert while the process is backgrounded/dead. A demo
  alert may still arrive after its 45-second stamp window or ritual finishes
  while away; deadline copy plus the create warning disclose that limitation.
  Screen-event cleanup is best effort, not an atomic background expiry guarantee.
  If zero late alerts is required, do not enable Demo reminders for that run.
  No notification tap deep-link or post-create reminder settings UI is added:
  Expo opens the app; cold start reaches Home, warm start resumes the current
  navigator. No notification response listener attempts an invalid route.
  Preferences/ids belong to rituals on this phone, not the selected wallet.
  Account switching neither duplicates nor cancels another wallet's reminders;
  "Remove from this phone" cancels them explicitly. No automatic wallet scoping.
  No migration opts existing remembered rituals in, and no background RPC can
  discover stamps made elsewhere while this phone stays closed. Native queues
  normally persist independently of JS, but an app kill mid-schedule, failed
  cancellation, or failed native enqueue is not automatically repaired. Logs
  expose failures; the app never promises reminders guarantee a kept week.
  The hook installs the foreground handler when visiting create/ritual screens;
  a cold process left only on Home has not initialized that handler.
  Expo's default without a handler drops foreground notifications; no guarantee
  of Real-weeks foreground presentation on a Home-only cold start is added.
  Old queued requests without the new data marker retain the prior policy.

  Remove screen hook imports/calls and the create toggle/state, the
  authoritativeRituals cleanup import/call, and the app.json plugin to drop this
  module. Before disabling an already shipped feature, clear all of its native
  prefixes once; deleting JS alone does not unschedule native notifications.
  No changes to chain/program code, devnet scripts, keys or docs/STATUS.md.
