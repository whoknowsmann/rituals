Local Real-weeks reminders

Boundary and contract

  planner.ts and lines.ts are pure. Pass the confirmed account's schedule
  (opens/deadline/resolution, bigint or number) and an explicit nowSeconds.
  ritualAddress is an additional required planner option: it namespaces ids
  and seeds deterministic copy. stampedWeeks uses zero-based chain indices.
  The returned at values are epoch seconds; only the scheduler converts to Date.
  Production creation uses read.account.schedule and its perEventAllocation,
  never a fresh selectSoloSchedule calculation after wallet approval.

  Each eligible unstamped week gets open, deadline minus 86400 seconds, and
  deadline minus 3600 seconds. Only strictly future dates, at most 16 weeks.
  Windows shorter than a day, invalid windows, and times after the stamp
  deadline get nothing. At exactly one day, coincident open/day reminders are
  deduplicated. No receipt/resolution notifications are created.

  Six authored lines per stage. FNV-1a of address/week/stage selects a line.
  Bodies and titles are bounded to 60 Unicode code points. A long stake/cause
  label gets a generic body rather than a truncated amount or misleading name.
  The banned-word test covers authored copy, not arbitrary user-entered titles.

  scheduler.ts owns only date-trigger mapping and prefix cancellation.
  service.ts owns serialized storage, permission and scheduling operations.
  native.ts is the sole React Native / expo-notifications adapter; runtime.ts
  requires it lazily within the service error boundary. Tests inject an SDK
  port and vi.mock expo-notifications; they never evaluate native.ts.
  No backend, push registration, push tokens, credentials or new dependency.

Integration

  SoloCreateScreen: default-on “Remind me each week” switch under the speed
  pills, only for speed === 'real'. This is visible step 2 (internal step 3
  with the existing witness step hidden). Confirmed chain readback invokes
  afterCreate. Demo and off preferences are recorded but never request access.
  A real/off retry clears a previously enabled set without requesting access.

  One “Rituals” Android channel, default importance. Create the channel before
  asking permission, check current permission first, persist permissionAsked
  before the one request. Denial is logged, not a create failure. Other creates
  and process restarts do not re-prompt. Granting access in Android Settings
  does not automatically rebuild previously denied sets.

  SoloRitualScreen: confirmed claim clears the captured claimEventIndex, not
  the possibly advanced display week. The hook also clears an observed chain
  stamp and the account's skipEventIndex on read/recovery. The model's 'skipped'
  state can describe the previous week: never cancel its current eventIndex
  merely because it says 'skipped'. Screen mounting sets up foreground display
  but never requests permission or schedules a set.

  forgetRitual: removes phone record, clears its notification prefix and its
  preference. Other rituals and the global permissionAsked flag are preserved.
  Identifier format: rituals:reminders:v1:<address>:<zero-based-week>:<stage>.
  Storage: @rituals/reminders/v1 -> { permissionAsked, rituals: {
    [address]: { enabled, stampedWeeks }
  }}. Native identifiers need no parallel local ledger: enumerate scheduled
  requests and match the exact colon-terminated ritual/week prefix.

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
  2. On a clean test profile, enter “Read”, Next. Demo speed has no reminder
     switch. Select Real weeks: switch appears selected in the existing pill
     style. Toggle off/on with TalkBack; checked state should be announced.
     Returning to Demo hides it. Neither speed selection prompts permission.
  3. Create two Real weeks, 5 TEST each, reminders on. Approve creation; only
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
     and create at Demo speed: neither adds requests or asks permission.
  9. Leave a separate unstamped Real-weeks ritual for the day/hour reminders.
     Verify delivery at its actual deadline-24h and deadline-1h, no new receipt
     reminder after resolution. This requires waiting; inspecting the queue
     proves requested timestamps, not Android delivery over six days. Also test
     a reboot, battery saver/Doze and foreground display on the ritual screen.
 10. On an old test binary without the native module, open/create/stamp/remove:
     these must still work and log a reminders failure, not crash. Test this
     separately from the new binary; unit injection cannot prove native linkage.

Honest limits and rollback

  Delivery is best effort. Installed Expo 0.29.14 falls back to inexact alarms
  when Android denies exact-alarm access (ExpoSchedulingDelegate.kt). This
  branch does not add exact-alarm permissions or claim second-perfect delivery;
  Doze, force-stop, clock changes and OS settings may delay/prevent alerts.
  No notification tap deep-link or post-create reminder settings UI is added.
  No migration opts existing remembered rituals in, and no background RPC can
  discover stamps made elsewhere while this phone stays closed. Native queues
  normally persist independently of JS, but an app kill mid-schedule, failed
  cancellation, or failed native enqueue is not automatically repaired. Logs
  expose failures; the app never promises reminders guarantee a kept week.
  The hook installs the foreground handler when visiting create/ritual screens;
  a cold process left only on Home has not initialized that handler.

  Remove screen hook imports/calls and the create toggle/state, the
  authoritativeRituals cleanup import/call, and the app.json plugin to drop this
  module. Before disabling an already shipped feature, clear all of its native
  prefixes once; deleting JS alone does not unschedule native notifications.
  No changes to chain/program code, devnet scripts, keys or docs/STATUS.md.
