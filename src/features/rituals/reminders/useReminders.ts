import { useEffect } from 'react'
import { reminders } from './runtime'

/** Also clear an observed chain stamp/skip after a restart or a recovered
 * wallet action. No permission request or scheduling happens on screen mount. */
export function useReminders(observed?: { ritualAddress: string; eventIndex: number | undefined; stamped: boolean }) {
  const address = observed?.ritualAddress
  const eventIndex = observed?.eventIndex
  const stamped = observed?.stamped
  useEffect(() => {
    if (address && eventIndex !== undefined && stamped) void reminders.afterStamp(address, eventIndex)
  }, [address, eventIndex, stamped])
  return reminders
}
