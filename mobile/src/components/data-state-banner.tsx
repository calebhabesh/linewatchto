import { StyleSheet, Text, View } from "react-native";

import type { Dashboard } from "@/api/dashboard-schema";
import { useTheme } from "@/theme/theme-provider";

type Props = {
  dashboard: Dashboard;
  cachedAt: number;
  hasRefreshError: boolean;
  showingCachedData: boolean;
};

export function DataStateBanner({ dashboard, cachedAt, hasRefreshError, showingCachedData }: Props) {
  const { theme } = useTheme();
  const live = dashboard.status.generatedAt.live;
  const tone = showingCachedData ? theme.line.delay : live ? theme.line.normal : theme.line.planned;
  const title = showingCachedData ? "Showing cached data" : live ? "Fresh source data" : "Source is not live";
  const detail = showingCachedData
    ? `${hasRefreshError ? "Refresh failed. " : "Refresh pending. "}Cached ${new Date(cachedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
    : dashboard.message;

  return (
    <View accessibilityRole="summary" style={[styles.container, { borderColor: tone, backgroundColor: theme.color.surface }]}>
      <View style={[styles.indicator, { backgroundColor: tone }]} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.color.text }]}>{title}</Text>
        <Text style={[styles.detail, { color: theme.color.textMuted }]}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    flexDirection: "row",
    gap: 10,
  },
  indicator: { width: 5, borderRadius: 3 },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontWeight: "800" },
  detail: { fontSize: 12, lineHeight: 17 },
});
