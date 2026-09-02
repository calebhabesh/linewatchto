import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useAccessibilityOutages, type AccessibilityAssetFilter } from "@/api/accessibility";
import type { AccessibilityOutageDetail, AccessibilityOutageLineGroup } from "@/api/accessibility-schema";
import type { NetworkId } from "@/api/dashboard-schema";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LineBadge } from "@/components/line-badge";
import { LoadingState } from "@/components/loading-state";
import { NetworkSwitcher } from "@/components/network-switcher";
import { ProductHeader } from "@/components/product-header";
import { Screen } from "@/components/screen";
import { useAppActive } from "@/hooks/use-app-active";
import { useScreenFocused } from "@/hooks/use-screen-focused";
import { useNetwork } from "@/state/network-provider";
import { useTheme } from "@/theme/theme-provider";

export function AccessibilityOutagesScreen() {
  const { network, setNetwork } = useNetwork();
  const [assetFilter, setAssetFilter] = useState<AccessibilityAssetFilter>("all");
  const { theme } = useTheme();

  const isFocused = useScreenFocused();
  const isAppActive = useAppActive();

  const {
    data,
    isPending,
    isRefetching,
    error,
    refetch,
  } = useAccessibilityOutages(network, assetFilter, isFocused && isAppActive);

  const handleNetworkChange = useCallback((next: NetworkId) => {
    setNetwork(next);
  }, [setNetwork]);

  const totalOutages = data?.groups.reduce(
    (acc, group) => acc + group.stations.reduce((sAcc, s) => sAcc + s.outages.length, 0),
    0,
  ) ?? 0;

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
        {/* Navigation Back & Header */}
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
            testID="accessibility-back-button"
          >
            <BackArrowIcon color={theme.color.text} />
            <Text style={[styles.backText, { color: theme.color.text }]}>Back</Text>
          </Pressable>
        </View>

        <ProductHeader
          eyebrow="FACILITY STATUS"
          subtitle="Live elevator and escalator outages grouped by line/corridor and station."
          title="Accessibility Outages"
        />

        {/* Controls: Network & Filter */}
        <View style={styles.controlsRow}>
          <NetworkSwitcher value={network} onChange={handleNetworkChange} />
        </View>

        <View style={styles.filterRow}>
          {(["all", "elevator", "escalator"] as const).map((filter) => {
            const selected = assetFilter === filter;
            const label = filter === "all" ? "All Outages" : filter === "elevator" ? "Elevators" : "Escalators";
            return (
              <Pressable
                key={filter}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setAssetFilter(filter)}
                style={[
                  styles.filterChip,
                  {
                    borderColor: selected ? theme.color.focus : theme.color.border,
                    backgroundColor: selected ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                  },
                ]}
                testID={`filter-asset-${filter}`}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: selected ? theme.color.text : theme.color.textMuted },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* State Banners & Content */}
        {isPending ? (
          <LoadingState message="Loading accessibility outages…" />
        ) : error ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Failed to load accessibility outages."}
            onRetry={() => {
              void refetch();
            }}
          />
        ) : totalOutages === 0 ? (
          <EmptyState
            message="No elevator or escalator disruptions are currently reported for this selection."
            title="All Facilities in Service"
          />
        ) : (
          <View style={styles.outagesContainer}>
            {/* Freshness / Summary Banner */}
            <View
              style={[
                styles.summaryBanner,
                { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border },
              ]}
            >
              <View style={styles.summaryTop}>
                <View style={[styles.statusDot, { backgroundColor: theme.line.delay }]} />
                <Text style={[styles.summaryTitle, { color: theme.color.text }]}>
                  {totalOutages} Active Outage{totalOutages === 1 ? "" : "s"}
                </Text>
              </View>
              <Text style={[styles.summaryMeta, { color: theme.color.textQuiet }]}>
                SOURCE: {data?.source.toUpperCase()} {data?.fresh ? "· LIVE" : "· CACHED"}
              </Text>
            </View>

            {/* Groups */}
            {data?.groups.map((group) => (
              <LineOutageGroup
                key={group.lineId}
                group={group}
                network={network}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function LineOutageGroup({ group, network }: { group: AccessibilityOutageLineGroup; network: NetworkId }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.groupCard, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
      {/* Line Header */}
      <View style={styles.groupHeader}>
        <LineBadge
          color={group.color}
          lineId={group.lineId}
          lineNumber={group.lineNumber}
          size={26}
        />
        <View style={styles.groupHeaderText}>
          <Text style={[styles.groupLineName, { color: theme.color.text }]}>{group.lineName}</Text>
          <Text style={[styles.groupLineMeta, { color: theme.color.textQuiet }]}>
            {group.stations.length} station{group.stations.length === 1 ? "" : "s"} affected
          </Text>
        </View>
      </View>

      {/* Stations */}
      <View style={styles.stationsList}>
        {group.stations.map((station) => (
          <View key={station.stationId} style={styles.stationBlock}>
            <Pressable
              accessibilityHint="Opens station details"
              accessibilityLabel={`View ${station.stationName} details`}
              accessibilityRole="button"
              onPress={() => {
                router.push({
                  pathname: "/station/[network]/[id]",
                  params: { network, id: station.stationId },
                });
              }}
              style={({ pressed }) => [
                styles.stationHeader,
                {
                  backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                  borderColor: theme.color.border,
                },
              ]}
              testID={`station-outage-row-${station.stationId}`}
            >
              <Text style={[styles.stationTitle, { color: theme.color.text }]}>{station.stationName}</Text>
              <Text style={[styles.stationCountPill, { color: theme.line.delay }]}>
                {station.count} outage{station.count === 1 ? "" : "s"} ›
              </Text>
            </Pressable>

            {/* Outage Items */}
            <View style={styles.outageItemsList}>
              {station.outages.map((outage) => (
                <OutageDetailItem key={outage.id} outage={outage} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function OutageDetailItem({ outage }: { outage: AccessibilityOutageDetail }) {
  const { theme } = useTheme();
  const isElevator = outage.assetType.toLowerCase().includes("elevator");
  const badgeColor = isElevator ? "#3b82f6" : "#f59e0b";

  return (
    <View
      style={[
        styles.outageCard,
        { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border },
      ]}
      testID={`outage-item-${outage.id}`}
    >
      <View style={styles.outageBadgeRow}>
        <View style={[styles.assetBadge, { backgroundColor: `${badgeColor}25`, borderColor: badgeColor }]}>
          <Text style={[styles.assetBadgeText, { color: badgeColor }]}>
            {outage.assetType.toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.outageUpdated, { color: theme.color.textQuiet }]}>
          {outage.updatedAt ? `Updated ${outage.updatedAt}` : "Active"}
        </Text>
      </View>
      <Text style={[styles.outageTitle, { color: theme.color.text }]}>{outage.title}</Text>
      {outage.description ? (
        <Text style={[styles.outageDesc, { color: theme.color.textMuted }]}>{outage.description}</Text>
      ) : null}
      {outage.cause ? (
        <View style={styles.causeRow}>
          <Text style={[styles.causeLabel, { color: theme.color.textQuiet }]}>CAUSE:</Text>
          <Text style={[styles.causeText, { color: theme.color.textMuted }]}>{outage.cause}</Text>
        </View>
      ) : null}
    </View>
  );
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
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: {
    minHeight: 38,
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  filterChipText: { fontSize: 12, fontWeight: "800" },
  outagesContainer: { gap: 12 },
  summaryBanner: { borderWidth: 1, borderRadius: 6, padding: 12, gap: 4 },
  summaryTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  summaryTitle: { fontSize: 14, fontWeight: "800" },
  summaryMeta: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  groupCard: { borderWidth: 1, borderRadius: 6, padding: 14, gap: 12 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  groupHeaderText: { flex: 1, gap: 1 },
  groupLineName: { fontSize: 15, fontWeight: "800" },
  groupLineMeta: { fontSize: 11, fontWeight: "600" },
  stationsList: { gap: 10 },
  stationBlock: { gap: 6 },
  stationHeader: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stationTitle: { fontSize: 13, fontWeight: "800" },
  stationCountPill: { fontSize: 11, fontWeight: "800" },
  outageItemsList: { gap: 6, paddingLeft: 4 },
  outageCard: { borderWidth: 1, borderRadius: 6, padding: 10, gap: 5 },
  outageBadgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  assetBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  assetBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  outageUpdated: { fontSize: 10, fontWeight: "600" },
  outageTitle: { fontSize: 13, fontWeight: "800", lineHeight: 17 },
  outageDesc: { fontSize: 12, lineHeight: 16 },
  causeRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2 },
  causeLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  causeText: { flex: 1, fontSize: 11, lineHeight: 15 },
});
