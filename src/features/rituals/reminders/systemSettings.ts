import Constants from 'expo-constants'
import { Linking, Platform } from 'react-native'
import { logFailure } from '../../../utils/diagnostics'

export type NotificationPermissionState = 'checking' | 'on' | 'off' | 'unavailable'

export function notificationPermissionLine(state: NotificationPermissionState, platform: string): string {
  if (state === 'checking') return 'Checking…'
  if (state === 'unavailable') return 'Unavailable on this install'
  if (state === 'on') return 'On'
  return platform === 'android' ? 'Off — turn on in Android settings' : 'Off — turn on in system settings'
}

export async function openNotificationSettings(): Promise<void> {
  try {
    const packageName = Constants.expoConfig?.android?.package
    if (Platform.OS === 'android' && packageName) {
      try {
        await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
          { key: 'android.provider.extra.APP_PACKAGE', value: packageName },
        ])
        return
      } catch { /* Some Android versions only expose the app's general settings. */ }
    }
    await Linking.openSettings()
  } catch (error) { logFailure('notification settings', error) }
}
