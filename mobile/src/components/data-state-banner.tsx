import { StyleSheet, Text, View } from "react-native";

import type { Dashboard } from "@/api/dashboard-schema";
import { useTheme } from "@/theme/theme-provider";

export interface DataStateBannerProps {
  dashboard: Dashboard;
  cachedAt: number;
  hasRefreshError: boolean;
  showingCachedData: boolean;
}

export function DataStateBanner({
  dashboard,
  cachedAt,
  hasRefreshError,
  showingCachedData,
}: DataStateBannerProps) {
  const { theme, mode } = useTheme();
  const live = dashboard.status.generatedAt.live;

  const tone =
    mode === "high-contrast"
      ? "#ffffff"
      : showingCachedData
        ? theme.line.delay
        : live
          ? theme.line.normal
          : theme.line.planned;

  const title = showingCachedData
    ? "Showing cached data"
    : live
      ? "Fresh source data"
      : "Source is not live";

  const detail = showingCachedData
    ? `${hasRefreshError ? "Refresh failed. " : "Refresh pending. "}Cached ${new Date(cachedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
    : dashboard.message;

  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityRole="summary"
      role="summary"
      style={[
        styles.container,
        {
          backgroundColor:
            mode === "high-contrast" ? "#000000" : theme.color.surface,
          borderColor: tone,
          borderRadius: theme.radius.medium,
          borderWidth: mode === "high-contrast" ? 2 : 1,
        },
      ]}
      testID="data-state-banner"
    >
      <View style={[styles.indicator, { backgroundColor: tone }]} />
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <View style={[styles.dot, { backgroundColor: tone }]} />
          <Text
            style={[
              styles.title,
              {
                color:
                  mode === "high-contrast" ? "#ffffff" : theme.color.text,
              },
            ]}
          >
            {title}
          </Text>
        </View>
        <Text
          style={[
            styles.detail,
            {
              color:
                mode === "high-contrast" ? "#ffffff" : theme.color.textMuted,
            },
          ]}
        >
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  indicator: {
    width: 4,
    height: "100%",
    borderRadius: 2,
    minHeight: 36,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
  },
  detail: {
    fontSize: 12,
    lineHeight: 17,
  },
});
