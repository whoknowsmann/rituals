import { StyleSheet, View } from "react-native";
import { space, useScheme } from "../../theme";
import { Appbar } from "react-native-paper";
import { TopBarWalletMenu } from "./top-bar-ui";
import { useNavigation } from "@react-navigation/core";

export function TopBar() {
  const navigation = useNavigation();
  const { scheme, colors, toggle } = useScheme();
  return (
    <Appbar.Header mode="small" style={[styles.topBar, { backgroundColor: colors.bg }]}>
      <TopBarWalletMenu />
      {/* The screen owns the wordmark; the bar carries wallet, day/night and settings. */}
      <View style={styles.spacer} />

      <Appbar.Action
        icon={scheme === "dark" ? "white-balance-sunny" : "weather-night"}
        mode="contained-tonal"
        accessibilityLabel={scheme === "dark" ? "Switch to day mode" : "Switch to night mode"}
        onPress={toggle}
      />
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
    paddingHorizontal: space.sm,
    alignItems: "center",
    elevation: 0,
  },
  spacer: { flex: 1 },
});
