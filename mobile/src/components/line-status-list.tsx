import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { LineStatus } from "@/api/dashboard-schema";
import { useTheme } from "@/theme/theme-provider";

export function LineStatusList({ lines }: { lines: LineStatus[] }) {
  const { theme } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
      {lines.map((line) => (
        <View
          key={line.id}
          accessible
          accessibilityLabel={`${line.name}: ${line.statusLabel}. ${line.summary}`}
          style={[
            styles.card,
            {
              backgroundColor: theme.color.surface,
              borderColor: theme.color.border,
              borderLeftColor: statusColor(line.status, theme.line),
            },
          ]}
        >
          <View style={[styles.badge, { backgroundColor: line.color }]}>
            <Text style={styles.badgeText}>{line.number}</Text>
          </View>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={[styles.name, { color: theme.color.text }]}>
              {line.name}
            </Text>
            <Text style={[styles.status, { color: statusColor(line.status, theme.line) }]}>{line.statusLabel}</Text>
            <Text numberOfLines={2} style={[styles.summary, { color: theme.color.textQuiet }]}>{line.summary}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function statusColor(status: LineStatus["status"], colors: import("@/theme/tokens").ThemeLineColors) {
  if (status === "suspension") return colors.suspension;
  if (status === "delay") return colors.delay;
  if (status === "planned") return colors.planned;
  return colors.normal;
}

const styles = StyleSheet.create({
  content: { gap: 8, paddingRight: 16 },
  card: {
    width: 186,
    minHeight: 86,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#090909", fontSize: 14, fontWeight: "900" },
  copy: { flex: 1, gap: 3 },
  name: { fontSize: 13, fontWeight: "700" },
  status: { fontSize: 12, fontWeight: "800" },
  summary: { fontSize: 9, lineHeight: 13 },
});
