import { useEffect } from 'react'
import { reminders } from './runtime'
import { observedReminderWeeks, type ReminderObservation } from './planner'

/** Also clear observed stamps, skips, expired and completed weeks after a
 * restart/recovery. No permission request or scheduling on screen mount. */
export function useReminders(observed?: ReminderObservation & { ritualAddress: string }) {
  const address = observed?.ritualAddress
  const weeks = observedReminderWeeks(observed).join(',')
  // Foreground display also works after restarting into an unstamped ritual.
  // Loading the adapter does not request permission or schedule anything.
  useEffect(() => { void reminders.prepare() }, [])
  useEffect(() => {
    if (address && weeks) for (const week of weeks.split(',')) void reminders.afterStamp(address, Number(week))
  }, [address, weeks])
  return reminders
}
