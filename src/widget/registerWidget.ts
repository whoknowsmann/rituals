import { Platform } from 'react-native'

// Top-level registration also runs on a cold headless launch, not inside a hook.
if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget')
    const { widgetTaskHandler } = require('./widgetTaskHandler') as typeof import('./widgetTaskHandler')
    registerWidgetTaskHandler(widgetTaskHandler)
  } catch {
    // An older APK / Expo Go has no native module. The app must still open;
    // widget support requires a newly prebuilt Android binary.
  }
}
