import { StyleSheet, View } from 'react-native'
import { TopBar } from '../components/top-bar/top-bar-feature'
import { RitualsHomeScreen } from '../screens/RitualsHomeScreen'

export function HomeNavigator() {
  return (
    <View style={styles.shell}>
      <TopBar />
      <RitualsHomeScreen />
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
})
