import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useDashboard } from "@/api/dashboard";
import { Screen } from "@/components/screen";
import { findImpactInDashboard } from "@/features/alerts/impact-types";
import { useAppActive } from "@/hooks/use-app-active";
import { useNetwork } from "@/state/network-provider";
import { useTheme } from "@/theme/theme-provider";

export function ImpactDetailScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const { network } = useNetwork();
  const query = useDashboard(network, useAppActive());
  const { theme } = useTheme();

  const impact = useMemo(() => {
    if (!kind || !id) return null;
    return findImpactInDashboard(query.data, kind, id);
  }, [query.data, kind, id]);

  const line = useMemo(() => {
    if (!impact || !query.data) return null;
    return query.data.status.lines.find((l) => l.id === impact.data.lineId) ?? null;
  }, [query.data, impact]);

  const lineColor = line?.color ?? (impact ? theme.line[impact.tone] : theme.color.border);

  const kindLabel = useMemo(() => {
    if (!impact) return "";
    switch (impact.kind) {
      case "suspension":
        return "SERVICE SUSPENSION";
      case "delay":
        return "SERVICE DELAY";
      case "reduced-speed-zone":
        return "REDUCED SPEED ZONE";
      case "planned-closure":
        return "PLANNED CLOSURE";
    }
  }, [impact]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Top Navigation */}
        <View style={styles.navBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surface,
                borderColor: theme.color.border,
              },
            ]}
          >
            <Text style={[styles.backArrow, { color: theme.color.text }]}>‹</Text>
            <Text style={[styles.backText, { color: theme.color.text }]}>Back</Text>
          </Pressable>
          <Text accessibilityRole="header" style={[styles.headerTitle, { color: theme.color.textMuted }]}>
            Impact details
          </Text>
        </View>

        {!impact ? (
          <View style={[styles.notFoundCard, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
            <Text style={[styles.notFoundTitle, { color: theme.color.text }]}>Impact not found in current response</Text>
            <Text style={[styles.notFoundCopy, { color: theme.color.textMuted }]}>
              This disruption may have cleared or is no longer present in the active {network === "ttc" ? "TTC" : "GO/UP"} dashboard poll.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={[styles.actionButton, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.border }]}
            >
              <Text style={[styles.actionButtonText, { color: theme.color.text }]}>Return to alerts</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Main Header Card */}
            <View style={[styles.card, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
              <View style={styles.headerRow}>
                <View style={[styles.lineBadge, { backgroundColor: lineColor }]}>
                  <Text style={styles.lineBadgeText}>{impact.data.lineNumber}</Text>
                </View>
                <View style={styles.headerInfo}>
                  <Text style={[styles.lineName, { color: theme.color.textMuted }]}>
                    {line ? line.name : `Line ${impact.data.lineNumber}`}
                  </Text>
                  <View style={[styles.kindBadge, { backgroundColor: theme.line[impact.tone] }]}>
                    <Text style={styles.kindBadgeText}>{kindLabel}</Text>
                  </View>
                </View>
              </View>

              <Text style={[styles.title, { color: theme.color.text }]}>{impact.data.title}</Text>
              <Text style={[styles.location, { color: theme.color.textMuted }]}>
                📍 {impact.data.location}
              </Text>

              {impact.data.displayDirection ? (
                <Text style={[styles.metaText, { color: theme.color.textMuted }]}>
                  Direction: {impact.data.displayDirection}
                </Text>
              ) : null}
            </View>

            {/* Timing & Status Card */}
            <View style={[styles.card, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
              <Text style={[styles.sectionHeading, { color: theme.color.text }]}>Status & Timing</Text>

              {impact.kind === "planned-closure" ? (
                <>
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Timing status</Text>
                    <Text style={[styles.infoValue, { color: impact.data.activeNow ? theme.line.suspension : theme.line.planned }]}>
                      {impact.data.activeNow ? "ACTIVE NOW" : "UPCOMING"}
                    </Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Closure window</Text>
                    <Text style={[styles.infoValue, { color: theme.color.text }]}>{impact.data.window}</Text>
                  </View>

                  {impact.data.windowHours ? (
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Hours</Text>
                      <Text style={[styles.infoValue, { color: theme.color.text }]}>{impact.data.windowHours}</Text>
                    </View>
                  ) : null}

                  {impact.data.windowDates ? (
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Dates</Text>
                      <Text style={[styles.infoValue, { color: theme.color.text }]}>{impact.data.windowDates}</Text>
                    </View>
                  ) : null}

                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Shuttle service</Text>
                    <Text style={[styles.infoValue, { color: theme.color.text }]}>
                      {impact.data.shuttle ? "Shuttle buses running" : "No replacement bus"}
                    </Text>
                  </View>
                </>
              ) : null}

              {impact.kind === "suspension" && impact.data.shuttle !== undefined ? (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Shuttle service</Text>
                  <Text style={[styles.infoValue, { color: theme.color.text }]}>
                    {impact.data.shuttle ? "Shuttle buses requested / operating" : "No shuttle service"}
                  </Text>
                </View>
              ) : null}

              {impact.data.startedAt ? (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Started</Text>
                  <Text style={[styles.infoValue, { color: theme.color.text }]}>{impact.data.startedAt}</Text>
                </View>
              ) : null}

              {impact.data.updatedAt ? (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Updated</Text>
                  <Text style={[styles.infoValue, { color: theme.color.text }]}>{impact.data.updatedAt}</Text>
                </View>
              ) : null}

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Source system</Text>
                <Text style={[styles.infoValue, { color: theme.color.text }]}>{impact.data.source}</Text>
              </View>
            </View>

            {/* RSZ Metrics Card (TTC only) */}
            {impact.kind === "reduced-speed-zone" ? (
              <View style={[styles.card, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
                <Text style={[styles.sectionHeading, { color: theme.color.text }]}>Speed & Track Metrics</Text>
                {impact.data.reducedSpeed ? (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Reduced speed</Text>
                    <Text style={[styles.infoValue, { color: theme.line.delay }]}>{impact.data.reducedSpeed}</Text>
                  </View>
                ) : null}
                {impact.data.averageSpeed ? (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Normal speed</Text>
                    <Text style={[styles.infoValue, { color: theme.color.text }]}>{impact.data.averageSpeed}</Text>
                  </View>
                ) : null}
                {impact.data.rszLength ? (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Zone length</Text>
                    <Text style={[styles.infoValue, { color: theme.color.text }]}>{impact.data.rszLength}</Text>
                  </View>
                ) : null}
                {impact.data.stationDistance ? (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: theme.color.textMuted }]}>Station distance</Text>
                    <Text style={[styles.infoValue, { color: theme.color.text }]}>{impact.data.stationDistance}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Description & Advisory Details */}
            {impact.data.description || impact.data.cause || ("resolution" in impact.data && impact.data.resolution) ? (
              <View style={[styles.card, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
                <Text style={[styles.sectionHeading, { color: theme.color.text }]}>Details</Text>
                {impact.data.description ? (
                  <Text style={[styles.description, { color: theme.color.text }]}>{impact.data.description}</Text>
                ) : null}
                {impact.data.cause ? (
                  <View style={styles.detailBlock}>
                    <Text style={[styles.detailLabel, { color: theme.color.textMuted }]}>Cause:</Text>
                    <Text style={[styles.detailText, { color: theme.color.text }]}>{impact.data.cause}</Text>
                  </View>
                ) : null}
                {"resolution" in impact.data && impact.data.resolution ? (
                  <View style={styles.detailBlock}>
                    <Text style={[styles.detailLabel, { color: theme.color.textMuted }]}>Resolution:</Text>
                    <Text style={[styles.detailText, { color: theme.color.text }]}>{impact.data.resolution}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Source Honesty Footnote */}
            <Text style={[styles.disclaimer, { color: theme.color.textMuted }]}>
              Source: {impact.data.source}. Populated from cached LineWatchTO dashboard data. Unofficial transit reliability dashboard.
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  backArrow: { fontSize: 20, fontWeight: "700", lineHeight: 20 },
  backText: { fontSize: 13, fontWeight: "700" },
  headerTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  card: { borderWidth: 1, borderRadius: 6, padding: 16, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  lineBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  lineBadgeText: { color: "#090909", fontSize: 13, fontWeight: "900" },
  headerInfo: { flex: 1, gap: 4 },
  lineName: { fontSize: 13, fontWeight: "700" },
  kindBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  kindBadgeText: { color: "#ffffff", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  title: { fontSize: 18, fontWeight: "900", lineHeight: 24 },
  location: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  metaText: { fontSize: 13 },
  sectionHeading: { fontSize: 15, fontWeight: "800", marginBottom: 2 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: "700", textAlign: "right", flexShrink: 1 },
  description: { fontSize: 14, lineHeight: 21 },
  detailBlock: { gap: 2, marginTop: 4 },
  detailLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  detailText: { fontSize: 13, lineHeight: 18 },
  notFoundCard: { borderWidth: 1, borderRadius: 6, padding: 20, gap: 10, alignItems: "center" },
  notFoundTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  notFoundCopy: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  actionButton: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 },
  actionButtonText: { fontSize: 13, fontWeight: "700" },
  disclaimer: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 4 },
});
