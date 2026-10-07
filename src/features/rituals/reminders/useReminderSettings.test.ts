import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reminders } from './runtime'
import { useReminderSettings } from './useReminderSettings'

// Exercise effect callbacks and async state, not an Android/React renderer.
const harness = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0,
  focus: undefined as (() => void | (() => void)) | undefined,
  appState: undefined as ((state: string) => void) | undefined, remove: vi.fn(),
}))
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (value: unknown) => {
    const index = harness.cursor++
    if (!(index in harness.cells)) harness.cells[index] = { current: value }
    return harness.cells[index]
  },
  useState: (value: unknown) => {
    const index = harness.cursor++
    if (!(index in harness.cells)) harness.cells[index] = value
    return [harness.cells[index], (next: unknown) => {
      harness.cells[index] = typeof next === 'function' ? next(harness.cells[index]) : next
    }]
  },
}))
vi.mock('@react-navigation/native', () => ({ useFocusEffect: (callback: () => void | (() => void)) => { harness.focus = callback } }))
vi.mock('react-native', () => ({ AppState: { addEventListener: (_event: string, callback: (state: string) => void) => {
  harness.appState = callback
  return { remove: harness.remove }
} } }))
vi.mock('./runtime', () => ({ reminders: { getPreferences: vi.fn(), getPermissionState: vi.fn() } }))
vi.mock('../../../utils/diagnostics', () => ({ logFailure: vi.fn() }))
const render = () => { harness.cursor = 0; return useReminderSettings() }
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
const preferences = { masterEnabled: true, permissionAsked: false, rituals: {} }

beforeEach(() => {
  vi.resetAllMocks(); harness.cells = []; harness.cursor = 0; harness.focus = undefined; harness.appState = undefined
  vi.mocked(reminders.getPreferences).mockResolvedValue(preferences)
  vi.mocked(reminders.getPermissionState).mockResolvedValue('on')
})

describe('reminder settings focus/resume and failure isolation (mocked React)', () => {
  it('loads preferences/permission on focus and refreshes on return from Android settings', async () => {
    expect(render().permission).toBe('checking')
    const cleanup = harness.focus?.()
    await flush()
    expect(render()).toMatchObject({ permission: 'on', preferences, busy: false, error: null })
    vi.mocked(reminders.getPermissionState).mockResolvedValue('off')
    harness.appState?.('background')
    expect(reminders.getPermissionState).toHaveBeenCalledTimes(1)
    harness.appState?.('active')
    await flush()
    expect(render().permission).toBe('off')
    if (cleanup) cleanup()
    expect(harness.remove).toHaveBeenCalledOnce()
  })
  it('does not let a stale pre-resume permission read overwrite the latest one', async () => {
    let resolveOld!: (state: 'off') => void
    vi.mocked(reminders.getPermissionState).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    render(); harness.focus?.()
    harness.appState?.('active')
    await flush()
    expect(render().permission).toBe('on')
    resolveOld('off')
    await flush()
    expect(render().permission).toBe('on')
  })
  it('reports missing native support honestly without preventing preferences from loading', async () => {
    vi.mocked(reminders.getPermissionState).mockResolvedValue(undefined)
    render(); harness.focus?.(); await flush()
    expect(render()).toMatchObject({ permission: 'unavailable', preferences, error: null })
  })
  it('reports storage failure instead of displaying a usable guessed master switch', async () => {
    vi.mocked(reminders.getPreferences).mockResolvedValue(undefined)
    render(); harness.focus?.(); await flush()
    expect(render()).toMatchObject({ preferences: null, error: 'Could not read reminders. Try again.' })
  })
  it('clears a recovered read error on resume so the system permission line is visible again', async () => {
    vi.mocked(reminders.getPreferences).mockResolvedValueOnce(undefined)
    render(); harness.focus?.(); await flush()
    expect(render().error).toBe('Could not read reminders. Try again.')
    harness.appState?.('active'); await flush()
    expect(render()).toMatchObject({ preferences, permission: 'on', error: null })
  })
  it.each(['reject', 'incomplete'] as const)('contains %s updates, refreshes state and releases the switch', async (failure) => {
    render(); harness.focus?.(); await flush()
    const action = vi.fn(async () => { if (failure === 'reject') throw new Error('offline'); return undefined })
    await expect(render().update(action)).resolves.toBeUndefined()
    expect(render()).toMatchObject({ busy: false, preferences, error: 'Could not update reminders. Try again.' })
    expect(reminders.getPreferences).toHaveBeenCalledTimes(2)
  })
  it('guards rapid double taps and reads back persisted state after the action', async () => {
    render(); harness.focus?.(); await flush()
    let finish!: (ok: boolean) => void
    const action = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const pending = render().update(action)
    expect(render().busy).toBe(true)
    await render().update(action)
    expect(action).toHaveBeenCalledOnce()
    vi.mocked(reminders.getPreferences).mockResolvedValue({ ...preferences, masterEnabled: false })
    finish(true)
    await pending
    expect(render()).toMatchObject({ busy: false, error: null, preferences: { masterEnabled: false } })
  })
  it('ignores reads completed after focus is lost', async () => {
    render()
    const cleanup = harness.focus?.()
    if (cleanup) cleanup()
    await flush()
    expect(render().permission).toBe('checking')
    expect(render().preferences).toBeNull()
  })
})
