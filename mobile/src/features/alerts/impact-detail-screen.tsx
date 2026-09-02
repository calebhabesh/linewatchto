import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDashboard } from "@/api/dashboard";
import { LineBadge } from "@/components/line-badge";
import { BackIcon, LocateIcon } from "@/components/operations-icons";
import { Screen } from "@/components/screen";
import { findImpactInDashboard } from "@/features/alerts/impact-types";
import { useAppActive } from "@/hooks/use-app-active";
import { useImpactSelection } from "@/state/impact-selection-provider";
import { useNetwork } from "@/state/network-provider";
import { useTheme } from "@/theme/theme-provider";

export function ImpactDetailScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const { network } = useNetwork();
  const query = useDashboard(network, useAppActive());
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setSelection } = useImpactSelection();

  const impact = useMemo(() => {
    if (!kind || !id) return null;
    return findImpactInDashboard(query.data, kind, id);
  }, [query.data, kind, id]);

  const line = useMemo(() => {
    if (!impact || !query.data) return null;
    return query.data.status.lines.find((l) => l.id === impact.data.lineId) ?? null;
  }, [query.data, impact]);

  const kindLabel = useMemo(() => {
    if (!impact) return "";
    switch (impact.kind) {
      case "suspension":
        return "ACTIVE ALERT";
      case "delay":
        return "SERVICE DELAY";
      case "reduced-speed-zone":
        return "REDUCED SPEED ZONE";
      case "planned-closure":
        return "activeNow" in impact.data && impact.data.activeNow ? "ACTIVE CLOSURE" : "PLANNED CLOSURE";
    }
  }, [impact]);

  const bottomPadding = Math.max(36, insets.bottom + 24);

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}>
        {/* Top Navigation */}
        <View style={styles.navBar}>
          <Pressable
            accessibilityHint="Navigates back to the previous screen"
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surface,
                borderColor: theme.color.border,
              },
            ]}
          >
            <BackIcon color={theme.color.text} size={16} />
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
            <View style={[styles.card, { backgroundColor: theme.color.surface, borderColor: theme.color.border, borderLeftColor: theme.line[impact.tone], borderLeftWidth: 3.5 }]}>
              <View style={styles.headerRow}>
                <LineBadge lineId={impact.data.lineId} lineNumber={impact.data.lineNumber} size={30} />
                <View style={styles.headerInfo}>
                  <Text style={[styles.lineName, { color: theme.color.textMuted }]}>
                    {line ? `${line.number} · ${line.name}` : `Line ${impact.data.lineNumber}`}
                  </Text>
                  <View style={[styles.kindBadge, { backgroundColor: `${theme.line[impact.tone]}22`, borderColor: theme.line[impact.tone] }]}>
                    <Text style={[styles.kindBadgeText, { color: theme.line[impact.tone] }]}>{kindLabel}</Text>
                  </View>
                </View>
              </View>

              <Text style={[styles.title, { color: theme.color.text }]}>{impact.data.title}</Text>
              <Text style={[styles.location, { color: theme.color.textMuted }]}>
                {impact.data.location}
              </Text>

              {impact.data.displayDirection ? (
                <Text style={[styles.metaText, { color: theme.color.textMuted }]}>
                  Direction: {impact.data.displayDirection}
                </Text>
              ) : null}

              <Pressable
                accessibilityLabel={`Show ${impact.data.title} on schematic map`}
                accessibilityRole="button"
                onPress={() => {
                  setSelection({
                    cardId: impact.data.id,
                    kind: impact.kind,
                    label: "window" in impact.data ? impact.data.window : impact.data.location,
                    sourceNetwork: network,
                  });
                  router.replace("/(tabs)");
                }}
                style={({ pressed }) => [
                  styles.viewOnMapButton,
                  {
                    backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surface,
                    borderColor: theme.color.focus,
                  },
                ]}
                testID="impact-view-on-map-button"
              >
                <LocateIcon color={theme.color.focus} size={16} />
                <Text style={[styles.viewOnMapText, { color: theme.color.focus }]}>Highlight on map</Text>
              </Pressable>
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

            {/* Related Planned Closure Link Card */}
            {"relatedPlannedClosureId" in impact.data && typeof impact.data.relatedPlannedClosureId === "string" && impact.data.relatedPlannedClosureId ? (
              <View style={[styles.card, { backgroundColor: theme.color.surface, borderColor: theme.line.planned, borderLeftWidth: 3.5, borderLeftColor: theme.line.planned }]}>
                <Text style={[styles.sectionHeading, { color: theme.color.text }]}>Related Planned Closure</Text>
                <Text style={[styles.description, { color: theme.color.textMuted }]}>
                  This active alert corresponds to a scheduled planned closure window.
                </Text>
                <Pressable
                  accessibilityHint="Navigates to the corresponding planned closure record"
                  accessibilityLabel="View related planned closure"
                  accessibilityRole="button"
                  onPress={() => {
                    const closureId = "relatedPlannedClosureId" in impact.data ? impact.data.relatedPlannedClosureId : null;
                    if (closureId) {
                      router.push({
                        pathname: "/impact/[kind]/[id]",
                        params: { kind: "planned-closure", id: closureId },
                      });
                    }
                  }}
                  style={({ pressed }) => [
                    styles.actionButton,
                    {
                      backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surface,
                      borderColor: theme.line.planned,
                    },
                  ]}
                  testID="view-related-planned-closure-button"
                >
                  <Text style={[styles.actionButtonText, { color: theme.line.planned }]}>
                    View Scheduled Closure Details ›
                  </Text>
                </Pressable>
              </View>
            ) : null}

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
  content: { padding: 16, gap: 12 },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    minHeight: 44,
  },
  backArrow: { fontSize: 20, fontWeight: "700", lineHeight: 20 },
  backText: { fontSize: 13, fontWeight: "700" },
  headerTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  card: { borderWidth: 1, borderRadius: 8, padding: 16, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerInfo: { flex: 1, gap: 4 },
  lineName: { fontSize: 13, fontWeight: "700" },
  kindBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  kindBadgeText: { fontSize: 9.5, fontWeight: "900", letterSpacing: 0.6 },
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
  notFoundCard: { borderWidth: 1, borderRadius: 8, padding: 20, gap: 10, alignItems: "center" },
  notFoundTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  notFoundCopy: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  actionButton: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8, minHeight: 44, alignItems: "center", justifyContent: "center" },
  actionButtonText: { fontSize: 13, fontWeight: "800" },
  viewOnMapButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 6,
    minHeight: 44,
  },
  viewOnMapText: { fontSize: 13, fontWeight: "800" },
  disclaimer: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 4 },
});
