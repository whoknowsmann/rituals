import { StyleSheet, View } from 'react-native'
import { TopBar } from '../components/top-bar/top-bar-feature'
import { PreflightScreen } from '../screens/PreflightScreen'

export function HomeNavigator() {
  return (
    <View style={styles.shell}>
      <TopBar />
      <PreflightScreen />
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
})
