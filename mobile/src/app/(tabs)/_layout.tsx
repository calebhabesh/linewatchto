import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";

import { MobileBottomNavBar } from "@/components/mobile-bottom-nav-bar";
import { OperationsShell, ShellProvider } from "@/features/shell";
import { useTheme } from "@/theme/theme-provider";

export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <ShellProvider>
      <View
        style={[styles.container, { backgroundColor: theme.color.background }]}
        testID="tabs-shell-container"
      >
        {/* Layer 0: The persistent operations shell with the schematic map permanently mounted */}
        <OperationsShell />

        {/* Layer 1: Tab scenes rendered with transparent background so the map is never unmounted or hidden */}
        <Tabs
          tabBar={(props) => <MobileBottomNavBar {...props} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: "transparent" },
            tabBarHideOnKeyboard: true,
          }}
        >
          <Tabs.Screen name="index" options={{ title: "Map" }} />
          <Tabs.Screen name="alerts" options={{ title: "Status" }} />
          <Tabs.Screen name="stations" options={{ title: "Search" }} />
          <Tabs.Screen name="commutes" options={{ title: "Commutes" }} />
          <Tabs.Screen name="more" options={{ title: "More" }} />
        </Tabs>
      </View>
    </ShellProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
});
