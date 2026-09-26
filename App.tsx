// Polyfills
import "./src/polyfills";

import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Fraunces_600SemiBold, Fraunces_900Black } from "@expo-google-fonts/fraunces";
import { Figtree_400Regular, Figtree_600SemiBold, Figtree_800ExtraBold } from "@expo-google-fonts/figtree";

import { ConnectionProvider } from "./src/utils/ConnectionProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaperProvider } from "react-native-paper";
import { AppNavigator } from "./src/navigators/AppNavigator";
import { ClusterProvider } from "./src/components/cluster/cluster-data-access";
import { ritualsTheme, color } from "./src/theme";

const queryClient = new QueryClient();

/**
 * Crew (light) shell. Fonts are bundled, so loading is near-instant; render
 * nothing until the faces the theme names are available (a font error falls
 * through to system fonts rather than a blank app).
 */
export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_900Black,
    Figtree_400Regular,
    Figtree_600SemiBold,
    Figtree_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ClusterProvider>
        <ConnectionProvider config={{ commitment: "processed" }}>
          <SafeAreaView style={styles.shell}>
            <StatusBar style="dark" />
            <PaperProvider theme={ritualsTheme}>
              <AppNavigator />
            </PaperProvider>
          </SafeAreaView>
        </ConnectionProvider>
      </ClusterProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: color.bg,
  },
});
