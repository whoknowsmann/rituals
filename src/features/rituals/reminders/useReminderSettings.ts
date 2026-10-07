import { useCallback, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { logFailure } from '../../../utils/diagnostics'
import { reminders } from './runtime'
import type { ReminderPreferences } from './storage'
import type { NotificationPermissionState } from './systemSettings'

/** Read-only on focus/resume. Returning from Android settings never prompts. */
export function useReminderSettings() {
  const [preferences, setPreferences] = useState<ReminderPreferences | null>(null)
  const [permission, setPermission] = useState<NotificationPermissionState>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(false)
  const updating = useRef(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++generation.current
    const [nextPreferences, nextPermission] = await Promise.all([reminders.getPreferences(), reminders.getPermissionState()])
    if (!active.current || current !== generation.current) return
    setPreferences(nextPreferences ?? null)
    setPermission(nextPermission ?? 'unavailable')
    if (!nextPreferences) setError('Could not read reminders. Try again.')
    else setError((current) => current === 'Could not read reminders. Try again.' ? null : current)
  }, [])
  useFocusEffect(useCallback(() => {
    active.current = true
    setBusy(updating.current)
    void refresh()
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh() })
    return () => { active.current = false; generation.current += 1; listener.remove() }
  }, [refresh]))
  const update = useCallback(async (action: () => Promise<boolean | undefined>) => {
    if (updating.current) return
    updating.current = true
    setBusy(true)
    setError(null)
    try {
      if (!await action()) throw new Error('Reminder update incomplete')
    } catch (failure) {
      logFailure('reminder settings', failure)
      if (active.current) setError('Could not update reminders. Try again.')
    } finally {
      await refresh()
      updating.current = false
      if (active.current) setBusy(false)
    }
  }, [refresh])
  return { preferences, permission, busy, error, update }
}
