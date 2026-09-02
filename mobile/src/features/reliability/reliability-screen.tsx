import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useLineReliability } from "@/api/reliability";
import type { AlertTypeBreakdown, ReliabilityMetric, TrainCancellationSummary } from "@/api/reliability-schema";
import type { NetworkId } from "@/api/dashboard-schema";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LineBadge } from "@/components/line-badge";
import { LoadingState } from "@/components/loading-state";
import { NetworkSwitcher } from "@/components/network-switcher";
import { BackIcon } from "@/components/operations-icons";
import { ProductHeader } from "@/components/product-header";
import { Screen } from "@/components/screen";
import { useAppActive } from "@/hooks/use-app-active";
import { useScreenFocused } from "@/hooks/use-screen-focused";
import { useNetwork } from "@/state/network-provider";
import { useTheme } from "@/theme/theme-provider";

export function ReliabilityScreen() {
  const { network, setNetwork } = useNetwork();
  const { theme } = useTheme();

  const isFocused = useScreenFocused();
  const isAppActive = useAppActive();

  const {
    data,
    isPending,
    isRefetching,
    error,
    refetch,
  } = useLineReliability(network, isFocused && isAppActive);

  const handleNetworkChange = useCallback((next: NetworkId) => {
    setNetwork(next);
  }, [setNetwork]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[theme.color.focus]}
            onRefresh={() => {
              void refetch();
            }}
            refreshing={isRefetching}
            tintColor={theme.color.focus}
          />
        }
      >
        {/* Back Button & Header */}
        <View style={styles.topRow}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                borderColor: theme.color.border,
              },
            ]}
            testID="reliability-back-button"
          >
            <BackIcon color={theme.color.text} size={16} />
            <Text style={[styles.backText, { color: theme.color.text }]}>Back</Text>
          </Pressable>
        </View>

        <ProductHeader
          eyebrow="30-DAY RELIABILITY METRICS"
          subtitle="Verified incident counts, median durations, and service impact time."
          title="Reliability Summaries"
        />

        {/* Network Switcher */}
        <View style={styles.controlsRow}>
          <NetworkSwitcher value={network} onChange={handleNetworkChange} />
        </View>

        {isPending ? (
          <LoadingState message="Loading 30-day reliability metrics…" />
        ) : error ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Failed to load reliability metrics."}
            onRetry={() => {
              void refetch();
            }}
          />
        ) : !data || data.metrics.length === 0 ? (
          <EmptyState
            message="No reliability history recorded yet for this network."
            title="No Metrics Available"
          />
        ) : (
          <View style={styles.metricsContainer}>
            {/* Overview & Confidence Banner */}
            <View
              style={[
                styles.overviewBanner,
                { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border },
              ]}
            >
              <View style={styles.overviewTop}>
                <View style={styles.overviewTitleBlock}>
                  <Text style={[styles.overviewTitle, { color: theme.color.text }]}>
                    {data.period.toUpperCase()} Observation Window
                  </Text>
                  <Text style={[styles.overviewSubtitle, { color: theme.color.textQuiet }]}>
                    {data.observedDays} days observed · {data.coverageLabel}
                  </Text>
                </View>
                <ConfidenceBadge confidence={data.confidence} />
              </View>
              <View style={[styles.rule, { backgroundColor: theme.color.border }]} />
              <Text style={[styles.serviceWindowNote, { color: theme.color.textMuted }]}>
                {data.message}
              </Text>
            </View>

            {/* Line / Corridor Reliability Cards */}
            <Text style={[styles.sectionHeading, { color: theme.color.text }]}>
              {network === "regional" ? "Regional Corridors" : "Rapid Transit Lines"}
            </Text>

            {data.metrics.map((metric) => (
              <LineReliabilityCard
                key={metric.id}
                metric={metric}
                network={network}
              />
            ))}

            {/* Incident Type Breakdown */}
            {data.breakdown.length > 0 ? (
              <View
                style={[
                  styles.breakdownCard,
                  { backgroundColor: theme.color.surface, borderColor: theme.color.border },
                ]}
              >
                <Text style={[styles.cardHeading, { color: theme.color.text }]}>Disruption Breakdown</Text>
                <Text style={[styles.cardSubtitle, { color: theme.color.textQuiet }]}>
                  Observed incident share by disruption classification.
                </Text>

                <View style={styles.breakdownList}>
                  {data.breakdown.map((item) => (
                    <BreakdownRow key={item.impactKind} item={item} />
                  ))}
                </View>
              </View>
            ) : null}

            {/* Train Cancellations Summary (Regional mode) */}
            {network === "regional" && data.trainCancellations ? (
              <TrainCancellationBlock summary={data.trainCancellations} />
            ) : null}

            {/* Methodology & Source Disclaimer */}
            <Text style={[styles.methodologyNote, { color: theme.color.textMuted }]}>
              LineWatchTO calculates service impact by overlapping verified alert lifecycles with GTFS scheduled daily service spans. Polling and schedule coverage are tracked separately.
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function LineReliabilityCard({
  metric,
  network,
}: {
  metric: ReliabilityMetric;
  network: NetworkId;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.color.surface, borderColor: theme.color.border },
      ]}
      testID={`reliability-card-${metric.id}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.lineIdentity}>
          <LineBadge
            color="#22c55e"
            lineId={metric.id}
            lineNumber={metric.number}
            size={26}
          />
          <View style={styles.lineNameBlock}>
            <Text style={[styles.lineName, { color: theme.color.text }]}>{metric.label}</Text>
            <Text style={[styles.lineMeta, { color: theme.color.textQuiet }]}>
              {metric.incidents} total incident{metric.incidents === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
        <ConfidenceBadge confidence={metric.confidence} />
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statBox, { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border }]}>
          <Text style={[styles.statLabel, { color: theme.color.textQuiet }]}>MEDIAN DURATION</Text>
          <Text style={[styles.statValue, { color: theme.color.text }]}>
            {metric.medianDurationMinutes !== null && metric.medianDurationMinutes !== undefined
              ? `${metric.medianDurationMinutes}m`
              : "—"}
          </Text>
        </View>

        <View style={[styles.statBox, { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border }]}>
          <Text style={[styles.statLabel, { color: theme.color.textQuiet }]}>SERVICE IMPACT</Text>
          <Text style={[styles.statValue, { color: theme.color.text }]}>
            {formatMinutes(metric.serviceImpactMinutes)}
          </Text>
        </View>

        <View style={[styles.statBox, { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border }]}>
          <Text style={[styles.statLabel, { color: theme.color.textQuiet }]}>IMPACT SHARE</Text>
          <Text
            style={[
              styles.statValue,
              { color: metric.serviceImpactPercentage > 5 ? theme.line.delay : theme.color.text },
            ]}
          >
            {metric.serviceImpactPercentage.toFixed(1)}%
          </Text>
        </View>
      </View>
    </View>
  );
}

function BreakdownRow({ item }: { item: AlertTypeBreakdown }) {
  const { theme } = useTheme();
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownTop}>
        <Text style={[styles.breakdownLabel, { color: theme.color.text }]}>{item.label}</Text>
        <Text style={[styles.breakdownCount, { color: theme.color.textMuted }]}>
          {item.incidents} ({item.percentage.toFixed(0)}%)
        </Text>
      </View>
      <View style={[styles.progressBarTrack, { backgroundColor: theme.color.surfaceOverlay }]}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${Math.min(100, Math.max(2, item.percentage))}%`,
              backgroundColor: item.impactKind === "suspension" ? theme.line.suspension : theme.line.delay,
            },
          ]}
        />
      </View>
    </View>
  );
}

function TrainCancellationBlock({ summary }: { summary: TrainCancellationSummary }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardHeading, { color: theme.color.text }]}>Train Cancellations</Text>
        <ConfidenceBadge confidence={summary.confidence} />
      </View>
      <Text style={[styles.cardSubtitle, { color: theme.color.textQuiet }]}>{summary.message}</Text>

      <View style={styles.statsGrid}>
        <View style={[styles.statBox, { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border }]}>
          <Text style={[styles.statLabel, { color: theme.color.textQuiet }]}>TOTAL CANCELLED</Text>
          <Text style={[styles.statValue, { color: theme.line.suspension }]}>{summary.cancellations}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border }]}>
          <Text style={[styles.statLabel, { color: theme.color.textQuiet }]}>SCHEDULE-MATCHED</Text>
          <Text style={[styles.statValue, { color: "#22c55e" }]}>{summary.scheduleMatchedCancellations}</Text>
        </View>
      </View>
    </View>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const normalized = confidence.toLowerCase();
  const color = normalized === "high" ? "#22c55e" : normalized === "medium" ? "#f59e0b" : "#94a3b8";
  return (
    <View style={[styles.confidenceBadge, { backgroundColor: `${color}20`, borderColor: color }]}>
      <Text style={[styles.confidenceText, { color }]}>{confidence.toUpperCase()}</Text>
    </View>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = (minutes / 60).toFixed(1);
  return `${hours}h`;
}

function BackArrowIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 19l-7-7 7-7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120, gap: 12 },
  topRow: { flexDirection: "row", alignItems: "center" },
  backButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backText: { fontSize: 13, fontWeight: "700" },
  controlsRow: { marginTop: 2 },
  metricsContainer: { gap: 12 },
  overviewBanner: { borderWidth: 1, borderRadius: 6, padding: 14, gap: 8 },
  overviewTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  overviewTitleBlock: { flex: 1, gap: 2 },
  overviewTitle: { fontSize: 14, fontWeight: "800", letterSpacing: -0.2 },
  overviewSubtitle: { fontSize: 12, fontWeight: "600" },
  serviceWindowNote: { fontSize: 12, lineHeight: 16 },
  rule: { height: 1 },
  confidenceBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  confidenceText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  sectionHeading: { fontSize: 15, fontWeight: "800", letterSpacing: -0.2, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 6, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  lineIdentity: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  lineNameBlock: { flex: 1, gap: 1 },
  lineName: { fontSize: 14, fontWeight: "800" },
  lineMeta: { fontSize: 11, fontWeight: "600" },
  statsGrid: { flexDirection: "row", gap: 8 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  statLabel: { fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  statValue: { fontSize: 15, fontWeight: "900" },
  breakdownCard: { borderWidth: 1, borderRadius: 6, padding: 14, gap: 10 },
  cardHeading: { fontSize: 14, fontWeight: "800" },
  cardSubtitle: { fontSize: 12, lineHeight: 16 },
  breakdownList: { gap: 8, paddingTop: 4 },
  breakdownRow: { gap: 4 },
  breakdownTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  breakdownLabel: { fontSize: 12, fontWeight: "700" },
  breakdownCount: { fontSize: 11, fontWeight: "600" },
  progressBarTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", borderRadius: 3 },
  methodologyNote: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 4, marginBottom: 8 },
});
