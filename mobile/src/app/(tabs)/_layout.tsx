import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AlertsTabIcon,
  CommutesTabIcon,
  MapTabIcon,
  MoreTabIcon,
  StationsTabIcon,
} from "@/components/tab-icons";
import { useDashboard } from "@/api/dashboard";
import { useNetwork } from "@/state/network-provider";
import { useTheme } from "@/theme/theme-provider";

export default function TabsLayout() {
  const { theme } = useTheme();
  const { network } = useNetwork();
  const { data: dashboard } = useDashboard(network, true);
  const insets = useSafeAreaInsets();

  const currentCount =
    (dashboard?.activeAlerts.length ?? 0) +
    (dashboard?.delays.length ?? 0) +
    (dashboard?.reducedSpeedZones.length ?? 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.color.background },
        tabBarActiveTintColor: theme.color.text,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarActiveBackgroundColor: theme.color.chromeGlow,
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: {
          borderRadius: 24,
          marginHorizontal: 2,
          marginVertical: 6,
        },
        tabBarStyle: {
          position: "absolute",
          left: 14,
          right: 14,
          bottom: Math.max(10, insets.bottom),
          height: 68,
          paddingHorizontal: 5,
          paddingBottom: 0,
          backgroundColor: theme.color.surfaceOverlay,
          borderColor: theme.color.borderStrong,
          borderTopColor: theme.color.borderStrong,
          borderWidth: 1,
          borderTopWidth: 1,
          borderRadius: 34,
          elevation: 16,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: Platform.OS === "ios" ? 0.5 : 0,
          shadowRadius: 18,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.15 },
        tabBarIconStyle: { marginTop: 1 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Map",
          tabBarIcon: ({ color }) => <MapTabIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Status",
          tabBarBadge: currentCount > 0 ? (currentCount > 99 ? "99+" : currentCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.line.suspension,
            color: "#ffffff",
            fontSize: 9,
            fontWeight: "900",
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            lineHeight: 16,
            alignSelf: "center",
          },
          tabBarIcon: ({ color }) => <AlertsTabIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="stations"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) => <StationsTabIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="commutes"
        options={{
          title: "Commutes",
          tabBarIcon: ({ color }) => <CommutesTabIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => <MoreTabIcon color={color} />,
        }}
      />
    </Tabs>
  );
}
