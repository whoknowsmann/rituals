import { StyleSheet, View } from "react-native";
import { color, space } from "../../theme";
import { Appbar } from "react-native-paper";
import { TopBarWalletMenu } from "./top-bar-ui";
import { useNavigation } from "@react-navigation/core";

export function TopBar() {
  const navigation = useNavigation();
  return (
    <Appbar.Header mode="small" style={styles.topBar}>
      <TopBarWalletMenu />
      {/* The screen owns the wordmark; the bar carries only wallet + settings. */}
      <View style={styles.spacer} />

      <Appbar.Action
        icon="cog"
        mode="contained-tonal"
        accessibilityLabel="Settings"
        onPress={() => {
          navigation.navigate("Settings");
        }}
      />
    </Appbar.Header>
  );
}

const styles = StyleSheet.create({
  topBar: {
    backgroundColor: color.bg,
    paddingHorizontal: space.sm,
    alignItems: "center",
    elevation: 0,
  },
  spacer: { flex: 1 },
});
