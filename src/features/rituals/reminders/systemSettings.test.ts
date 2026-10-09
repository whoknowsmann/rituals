import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Constants from 'expo-constants'
import { Linking, Platform } from 'react-native'
import { notificationPermissionLine, openNotificationSettings } from './systemSettings'
import { REMINDER_CHANNELS } from './scheduler'
import { logFailure } from '../../../utils/diagnostics'

vi.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: { sendIntent: vi.fn(), openSettings: vi.fn() } }))
vi.mock('expo-constants', () => ({ default: { expoConfig: { name: 'Rituals', slug: 'rituals', android: { package: 'com.whoknowsmann.rituals' } } } }))
vi.mock('../../../utils/diagnostics', () => ({ logFailure: vi.fn() }))
const config = Constants.expoConfig
const source = (path: string) => readFileSync(resolve('src/features/rituals/reminders', path), 'utf8')

beforeEach(() => { vi.resetAllMocks(); Platform.OS = 'android'; Constants.expoConfig = config })

describe('system notification settings (mocked Linking; source pins)', () => {
  it('opens this app notification screen using the Android package extra, not a channel-specific screen', async () => {
    await openNotificationSettings()
    expect(Linking.sendIntent).toHaveBeenCalledExactlyOnceWith('android.settings.APP_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: 'com.whoknowsmann.rituals' },
    ])
    expect(Linking.openSettings).not.toHaveBeenCalled()
  })
  it('pins the intent and package lookup to installed config and the Settings button', () => {
    expect(JSON.parse(source('../../../../app.json')).expo.android.package).toBe(config?.android?.package)
    expect(source('./systemSettings.ts')).toContain('Constants.expoConfig?.android?.package')
    expect(source('./systemSettings.ts')).toContain("Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS'")
    expect(source('./systemSettings.ts')).toContain("key: 'android.provider.extra.APP_PACKAGE', value: packageName")
    expect(source('../../../screens/SettingsScreen.tsx')).toContain('label="Notification settings" onPress={() => { void openNotificationSettings() }}')
    expect(source('./systemSettings.ts')).not.toContain('expo-linking')
  })
  it('falls back to general app settings when the Android intent rejects', async () => {
    vi.mocked(Linking.sendIntent).mockRejectedValueOnce(new Error('intent unavailable'))
    await openNotificationSettings()
    expect(Linking.openSettings).toHaveBeenCalledOnce()
  })
  it('falls back when the package is unavailable rather than guessing a package', async () => {
    Constants.expoConfig = null
    await openNotificationSettings()
    expect(Linking.sendIntent).not.toHaveBeenCalled()
    expect(Linking.openSettings).toHaveBeenCalledOnce()
  })
  it('uses general app settings on iOS', async () => {
    Platform.OS = 'ios'
    await openNotificationSettings()
    expect(Linking.sendIntent).not.toHaveBeenCalled()
    expect(Linking.openSettings).toHaveBeenCalledOnce()
  })
  it('contains native settings failures rather than rejecting into the screen', async () => {
    vi.mocked(Linking.sendIntent).mockRejectedValueOnce(new Error('no intent'))
    vi.mocked(Linking.openSettings).mockRejectedValueOnce(new Error('no settings'))
    await expect(openNotificationSettings()).resolves.toBeUndefined()
    expect(logFailure).toHaveBeenCalledWith('notification settings', expect.any(Error))
  })
  it.each([
    ['on', 'On'], ['off', 'Off — turn on in Android settings'],
    ['checking', 'Checking…'], ['unavailable', 'Unavailable on this install'],
  ] as const)('gives permission %s plain, honest copy', (state, line) => {
    expect(notificationPermissionLine(state, 'android')).toBe(line)
  })
  it('does not label non-Android settings as Android', () => {
    expect(notificationPermissionLine('off', 'ios')).toBe('Off — turn on in system settings')
  })
  it('pins the small Settings card, persisted switch and explicit chain restoration', () => {
    const settings = source('../../../screens/SettingsScreen.tsx')
    expect(settings).toContain('accessibilityLabel="Notifications"')
    expect(settings).toContain('notificationPermissionLine(notificationSettings.permission, Platform.OS)')
    expect(settings).toContain('<Switch accessibilityLabel="Remind me" value={notificationSettings.preferences?.masterEnabled ?? false}')
    expect(settings).toContain('onValueChange={setRemindMe}')
    expect(settings).toContain('await reminders.setMasterEnabled(enabled)')
    expect(settings).toContain('restoreRememberedReminders(client.client, selectedAccount?.publicKey ?? null,')
    expect(settings).toContain('getCurrentAccount()?.publicKey.equals(selectedAccount.publicKey)')
    expect(settings.indexOf('accessibilityLabel="Test tokens"')).toBeLessThan(settings.indexOf('accessibilityLabel="Notifications"'))
  })
  it('pins the per-ritual button to its chain bundle and the master guard, without altering stamp/create', () => {
    const ritual = source('../../../screens/solo/SoloRitualScreen.tsx')
    expect(ritual).toContain("label={`Reminders: ${ritualRemindersOn ? 'on' : 'off'}`}")
    expect(ritual).toContain('reminders.setRitualEnabled({ ...input, enabled: !ritualRemindersOn })')
    expect(ritual).toContain('}, readyBundle, chainNow)')
    expect(ritual).toContain('disabled={!reminderSettings.preferences?.masterEnabled || reminderSettings.busy')
    expect(ritual).toContain('void cancelWeekReminders(ritualAddress.toBase58(), eventIndex)')
    expect(source('../../../screens/solo/SoloCreateScreen.tsx')).toContain('enabled: remindWeekly')
    expect(source('./native.ts')).not.toContain('deleteNotificationChannel')
    expect(source('./scheduler.ts')).not.toContain('deleteNotificationChannel')
  })
  it('keeps new authored labels within the FACTS Words restrictions', () => {
    const labels = ['Notifications', 'Notification settings', 'Remind me', 'Reminders: on', 'Reminders: off',
      ...Object.values(REMINDER_CHANNELS).map((channel) => channel.name),
      ...(['on', 'off', 'checking', 'unavailable'] as const).map((state) => notificationPermissionLine(state, 'android')),
      'Could not read reminders. Try again.', 'Could not update reminders. Try again.']
    expect(labels.join('\n')).not.toMatch(/\b(win(?:s|ning)?|beat(?:s|ing)?|pot|jackpot|payout|odds|luck(?:y)?|versus|rival|AI|mainnet|SKR|live)\b|\bprofit\s+from\b/i)
  })
})
