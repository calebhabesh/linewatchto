import type { Tabs } from "expo-router";
import { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { useDashboard } from "@/api/dashboard";
import {
  AlertsTabIcon,
  CommutesTabIcon,
  MapTabIcon,
  MoreTabIcon,
  StationsTabIcon,
} from "@/components/tab-icons";
import { useNetwork } from "@/state/network-provider";
import { SHELL_ELEVATION, SHELL_LAYOUT, SHELL_Z_INDEX } from "@/features/shell/shell-layout";
import { useShellOptional, type ShellTab } from "@/features/shell/shell-provider";
import { useTheme } from "@/theme/theme-provider";

export type MobileBottomNavBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const TAB_CONFIG: Record<
  string,
  {
    label: string;
    Icon: (props: { color: string; size?: number }) => React.ReactNode;
  }
> = {
  index: { label: "Map", Icon: MapTabIcon },
  alerts: { label: "Status", Icon: AlertsTabIcon },
  stations: { label: "Search", Icon: StationsTabIcon },
  commutes: { label: "Commutes", Icon: CommutesTabIcon },
  more: { label: "More", Icon: MoreTabIcon },
};

const NAV_HEIGHT = 72;
const PADDING_H = 6;
const PADDING_V = 6;
const ITEM_GAP = 2;

export const MobileBottomNavBar = memo(function MobileBottomNavBar({
  state,
  navigation,
}: MobileBottomNavBarProps) {
  const { theme, mode } = useTheme();
  const { network } = useNetwork();
  const { data: dashboard } = useDashboard(network, true);
  const insets = useSafeAreaInsets();

  const [containerWidth, setContainerWidth] = useState(362);

  const statusCount =
    (dashboard?.activeAlerts.length ?? 0) +
    (dashboard?.delays.length ?? 0) +
    (dashboard?.reducedSpeedZones.length ?? 0);

  const bottomOffset = Math.max(12, insets.bottom);
  const routeCount = Math.max(1, state.routes.length);
  const totalGaps = (routeCount - 1) * ITEM_GAP;
  const availableWidth = containerWidth - PADDING_H * 2 - totalGaps;
  const gliderWidth = Math.max(48, Math.floor(availableWidth / routeCount));
  const gliderHeight = NAV_HEIGHT - PADDING_V * 2;
  const stepX = gliderWidth + ITEM_GAP;

  const animIndex = useRef(new Animated.Value(state.index)).current;
  const prevIndexRef = useRef(state.index);

  useEffect(() => {
    if (prevIndexRef.current === state.index) return;
    prevIndexRef.current = state.index;
    if (process.env.NODE_ENV === "test") {
      return;
    }
    Animated.spring(animIndex, {
      toValue: state.index,
      useNativeDriver: true,
      tension: 260,
      friction: 24,
    }).start();
  }, [state.index, animIndex]);

  const shell = useShellOptional();
  const currentRouteName = state.routes[state.index]?.name;

  useEffect(() => {
    if (currentRouteName && shell) {
      shell.setActiveTab(currentRouteName as ShellTab);
    }
  }, [currentRouteName, shell]);

  const translateX = animIndex.interpolate({
    inputRange: [0, Math.max(1, routeCount - 1)],
    outputRange: [0, stepX * Math.max(1, routeCount - 1)],
  });

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - containerWidth) > 1) {
          setContainerWidth(w);
        }
      }}
      style={[
        styles.navContainer,
        {
          bottom: bottomOffset,
          backgroundColor:
            mode === "high-contrast"
              ? "#000000"
              : mode === "light"
                ? "rgba(255, 255, 255, 0.98)"
                : "rgba(26, 32, 44, 0.98)",
          borderColor:
            mode === "high-contrast" ? "#ffffff" : "transparent",
          borderWidth: mode === "high-contrast" ? 2 : 0,
          shadowColor: mode === "light" ? "#0f172a" : "#000000",
          shadowOpacity:
            Platform.OS === "ios" ? (mode === "light" ? 0.15 : 0.55) : 0,
        },
      ]}
      testID="mobile-bottom-nav"
    >
      {/* Selection Glider with soft inward glow and authentic glassmorphic styling */}
      <Animated.View
        pointerEvents="none"
        testID="bottom-nav-glider"
        style={[
          styles.glider,
          mode === "high-contrast" ? styles.gliderHighContrast : null,
          {
            width: gliderWidth,
            height: gliderHeight,
            transform: [{ translateX }],
          },
        ]}
      >
        {mode === "high-contrast" ? null : (
          <Svg
            height={gliderHeight}
            style={StyleSheet.absoluteFill}
            viewBox={`0 0 ${gliderWidth} ${gliderHeight}`}
            width={gliderWidth}
          >
            <Defs>
              {/* Frosted translucent glass base */}
              <LinearGradient id="glassBase" x1="0" x2="0" y1="0" y2="1">
                <Stop
                  offset="0%"
                  stopColor="#38bdf8"
                  stopOpacity={mode === "light" ? 0.08 : 0.06}
                />
                <Stop
                  offset="50%"
                  stopColor="#0284c7"
                  stopOpacity={mode === "light" ? 0.04 : 0.03}
                />
                <Stop
                  offset="100%"
                  stopColor="#0f172a"
                  stopOpacity={mode === "light" ? 0.02 : 0.05}
                />
              </LinearGradient>

              {/* Soft, atmospheric inward glow (smooth, ultra-subtle falloff) */}
              <RadialGradient
                cx="50%"
                cy="48%"
                id="inwardGlow"
                rx="54%"
                ry="50%"
              >
                <Stop offset="0%" stopColor="#38bdf8" stopOpacity={0} />
                <Stop offset="55%" stopColor="#38bdf8" stopOpacity={0.02} />
                <Stop offset="80%" stopColor="#38bdf8" stopOpacity={0.06} />
                <Stop offset="100%" stopColor="#81c9ff" stopOpacity={0.10} />
              </RadialGradient>

              {/* Frosted glass surface reflection */}
              <LinearGradient id="glassSheen" x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.06} />
                <Stop offset="24%" stopColor="#ffffff" stopOpacity={0.01} />
                <Stop offset="50%" stopColor="#ffffff" stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Base frosted glass pane */}
            <Rect
              fill="url(#glassBase)"
              height={Math.max(0, gliderHeight - 1)}
              rx={(gliderHeight - 1) / 2}
              width={Math.max(0, gliderWidth - 1)}
              x="0.5"
              y="0.5"
            />

            {/* Atmospheric subtle inward glow */}
            <Rect
              fill="url(#inwardGlow)"
              height={Math.max(0, gliderHeight - 1)}
              rx={(gliderHeight - 1) / 2}
              width={Math.max(0, gliderWidth - 1)}
              x="0.5"
              y="0.5"
            />

            {/* Glass surface sheen */}
            <Rect
              fill="url(#glassSheen)"
              height={Math.max(0, gliderHeight - 1)}
              rx={(gliderHeight - 1) / 2}
              width={Math.max(0, gliderWidth - 1)}
              x="0.5"
              y="0.5"
            />

            {/* Glowy Ring - Soft Delicate Aura */}
            <Rect
              fill="none"
              height={Math.max(0, gliderHeight - 2)}
              rx={(gliderHeight - 2) / 2}
              stroke={mode === "light" ? "#0284c7" : "#38bdf8"}
              strokeOpacity={mode === "light" ? 0.10 : 0.14}
              strokeWidth="2.2"
              width={Math.max(0, gliderWidth - 2)}
              x="1"
              y="1"
            />

            {/* Glowy Ring - Core Crisp Outline */}
            <Rect
              fill="none"
              height={Math.max(0, gliderHeight - 2)}
              rx={(gliderHeight - 2) / 2}
              stroke={mode === "light" ? "#0284c7" : "#81c9ff"}
              strokeOpacity={mode === "light" ? 0.48 : 0.52}
              strokeWidth="1"
              width={Math.max(0, gliderWidth - 2)}
              x="1"
              y="1"
            />
          </Svg>
        )}
      </Animated.View>

      {/* Tab Items */}
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const config = TAB_CONFIG[route.name] ?? {
          label: route.name,
          Icon: MapTabIcon,
        };

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: "tabLongPress",
            target: route.key,
          });
        };

        let badgeCount = 0;
        if (route.name === "alerts" && statusCount > 0) {
          badgeCount = statusCount;
        }

        const iconColor =
          mode === "high-contrast"
            ? isFocused
              ? "#000000"
              : "#ffffff"
            : isFocused
              ? "#ffffff"
              : theme.color.textMuted;

        const labelColor =
          mode === "high-contrast"
            ? isFocused
              ? "#000000"
              : "#ffffff"
            : isFocused
              ? "#ffffff"
              : theme.color.textMuted;

        return (
          <Pressable
            key={route.key}
            accessibilityLabel={config.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            onLongPress={onLongPress}
            onPress={onPress}
            style={({ pressed }) => [
              styles.navItem,
              pressed ? styles.navItemPressed : null,
            ]}
            testID={`tab-${route.name}`}
          >
            <View
              style={[
                styles.iconWrapper,
                isFocused ? styles.iconWrapperActive : null,
              ]}
            >
              <config.Icon color={iconColor} size={20} />
              {badgeCount > 0 ? (
                <View
                  style={styles.badge}
                  testID={`tab-badge-${route.name}`}
                >
                  <Text style={styles.badgeText}>
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.navLabel,
                { color: labelColor },
                route.name === "commutes" ? styles.navLabelCommutes : null,
              ]}
            >
              {config.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  navContainer: {
    position: "absolute",
    left: SHELL_LAYOUT.navBarHorizontalInset,
    right: SHELL_LAYOUT.navBarHorizontalInset,
    height: SHELL_LAYOUT.navBarHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: PADDING_H,
    paddingVertical: PADDING_V,
    borderRadius: 999,
    borderWidth: 0,
    elevation: SHELL_ELEVATION.bottomNav,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: Platform.OS === "ios" ? 0.45 : 0,
    shadowRadius: 18,
    zIndex: SHELL_Z_INDEX.bottomNav,
  },
  glider: {
    position: "absolute",
    top: PADDING_V,
    left: PADDING_H,
    borderRadius: 999,
    overflow: "hidden",
  },
  gliderHighContrast: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
    borderWidth: 1,
  },
  navItem: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 3,
    zIndex: 2,
  },
  navItemPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.85,
  },
  iconWrapper: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  iconWrapperActive: {
    transform: [{ scale: 1.05 }],
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 999,
    backgroundColor: "#ef4444",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.90)",
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 11,
    textAlign: "center",
  },
  navLabel: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 11,
  },
  navLabelCommutes: {
    fontSize: 9,
  },
});
