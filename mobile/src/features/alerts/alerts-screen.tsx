import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDashboard } from "@/api/dashboard";
import { AlertCard } from "@/components/alert-card";
import { DataStateBanner } from "@/components/data-state-banner";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LineStatusList } from "@/components/line-status-list";
import { LoadingState } from "@/components/loading-state";
import { ProductHeader } from "@/components/product-header";
import { Screen } from "@/components/screen";
import { AlertFilterBar } from "@/features/alerts/alert-filter-bar";
import {
  type AlertFilter,
  type ImpactItem,
  filterImpacts,
  getAvailableFilters,
} from "@/features/alerts/impact-types";
import { useAppActive } from "@/hooks/use-app-active";
import { useImpactSelection } from "@/state/impact-selection-provider";
import { useNetwork } from "@/state/network-provider";
import { useTheme } from "@/theme/theme-provider";

export function AlertsScreen() {
  const { network, setNetwork } = useNetwork();
  const query = useDashboard(network, useAppActive());
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isSelected, setSelection } = useImpactSelection();
  const [selectedFilter, setSelectedFilter] = useState<AlertFilter>("all");

  // Regional mode has no Reduced Speed Zones: fallback to 'all' if selected
  const activeFilter =
    network === "regional" && selectedFilter === "reduced-speed-zone" ? "all" : selectedFilter;

  const lines = useMemo(
    () => new Map(query.data?.status.lines.map((line) => [line.id, line.color]) ?? []),
    [query.data?.status.lines],
  );

  const filters = useMemo(() => getAvailableFilters(query.data, network), [query.data, network]);
  const filteredImpacts = useMemo(
    () => filterImpacts(query.data, activeFilter, network),
    [query.data, activeFilter, network],
  );

  const currentDisruptions = useMemo(
    () => filteredImpacts.filter((i) => i.kind !== "planned-closure"),
    [filteredImpacts],
  );

  const plannedClosures = useMemo(
    () => filteredImpacts.filter((i) => i.kind === "planned-closure"),
    [filteredImpacts],
  );

  const activeFilterOption = filters.find((f) => f.key === activeFilter);

  const handleImpactPress = useCallback(
    (impact: ImpactItem) => {
      setSelection({
        cardId: impact.data.id,
        kind: impact.kind,
        label: "window" in impact.data ? impact.data.window : impact.data.location,
        sourceNetwork: network,
      });
      router.push({
        pathname: "/impact/[kind]/[id]",
        params: { kind: impact.kind, id: impact.data.id },
      });
    },
    [network, setSelection],
  );

  const renderImpactCard = (impact: ImpactItem) => {
    const startedAt = "startedAt" in impact.data ? impact.data.startedAt : null;
    const updatedAt = "updatedAt" in impact.data ? impact.data.updatedAt : null;
    const shuttle = "shuttle" in impact.data ? Boolean(impact.data.shuttle) : false;

    return (
      <AlertCard
        key={`${impact.kind}-${impact.data.id}`}
        lineId={impact.data.lineId}
        lineColor={lines.get(impact.data.lineId) ?? theme.line[impact.tone]}
        lineNumber={impact.data.lineNumber}
        location={"window" in impact.data ? impact.data.window : impact.data.location}
        onPress={() => handleImpactPress(impact)}
        selected={isSelected(impact.data.id)}
        shuttle={shuttle}
        source={impact.data.source}
        startedAt={startedAt}
        testID={`alert-card-${impact.data.id}`}
        title={impact.data.title}
        tone={impact.tone}
        updatedAt={updatedAt}
      />
    );
  };

  const bottomPadding = Math.max(100, insets.bottom + 80);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        refreshControl={
          <RefreshControl
            colors={[theme.color.focus]}
            onRefresh={() => void query.refetch()}
            refreshing={query.isRefetching}
            tintColor={theme.color.focus}
          />
        }
      >
        <ProductHeader
          eyebrow="NETWORK OPERATIONS"
          network={network}
          onNetworkChange={setNetwork}
          subtitle="Dashboard-visible disruptions and published planned closures."
          title="Service impacts"
        />

        {query.data ? (
          <DataStateBanner
            cachedAt={query.dataUpdatedAt}
            dashboard={query.data}
            hasRefreshError={query.isError}
            showingCachedData={query.isError || query.isStale}
          />
        ) : null}

        {query.data ? (
          <View style={styles.statusSection}>
            <View style={styles.sectionHeading}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.color.text }]}>
                Line status
              </Text>
              <Text style={[styles.sectionMeta, { color: theme.color.textQuiet }]}>
                {query.data.status.generatedAt.lastPoll}
              </Text>
            </View>
            <LineStatusList lines={query.data.status.lines} />
          </View>
        ) : null}

        {query.data ? (
          <AlertFilterBar
            activeFilter={activeFilter}
            filters={filters}
            onSelectFilter={setSelectedFilter}
          />
        ) : null}

        {!query.data && query.isPending ? <LoadingState message="Loading service impacts…" /> : null}
        {!query.data && query.error ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : null}

        {query.data && activeFilter === "all" ? (
          <>
            {/* Current Disruptions Section */}
            <View style={styles.groupSection}>
              <View style={styles.groupHeaderRow}>
                <Text accessibilityRole="header" style={[styles.groupTitle, { color: theme.color.text }]}>
                  Current Disruptions
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    {
                      backgroundColor:
                        currentDisruptions.length > 0
                          ? `${theme.line.delay}25`
                          : theme.color.surfaceRaised,
                      borderColor:
                        currentDisruptions.length > 0 ? theme.line.delay : theme.color.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.countText,
                      {
                        color:
                          currentDisruptions.length > 0 ? theme.line.delay : theme.color.textMuted,
                      },
                    ]}
                  >
                    {currentDisruptions.length}
                  </Text>
                </View>
              </View>

              {currentDisruptions.length === 0 ? (
                <EmptyState
                  compact
                  title="No active service disruptions reported."
                  message="Rapid transit corridors are operating without active alerts or delay advisories."
                />
              ) : (
                currentDisruptions.map((impact) => renderImpactCard(impact))
              )}
            </View>

            {/* Planned Closures Section */}
            <View style={styles.groupSection}>
              <View style={styles.groupHeaderRow}>
                <Text accessibilityRole="header" style={[styles.groupTitle, { color: theme.color.text }]}>
                  Planned Closures
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    {
                      backgroundColor:
                        plannedClosures.length > 0
                          ? `${theme.line.planned}25`
                          : theme.color.surfaceRaised,
                      borderColor:
                        plannedClosures.length > 0 ? theme.line.planned : theme.color.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.countText,
                      {
                        color:
                          plannedClosures.length > 0 ? theme.line.planned : theme.color.textMuted,
                      },
                    ]}
                  >
                    {plannedClosures.length}
                  </Text>
                </View>
              </View>

              {plannedClosures.length === 0 ? (
                <EmptyState
                  compact
                  title="No planned closures in this response."
                  message="No upcoming rapid transit maintenance closures are currently scheduled."
                />
              ) : (
                plannedClosures.map((impact) => renderImpactCard(impact))
              )}
            </View>
          </>
        ) : query.data ? (
          <View style={styles.groupSection}>
            <View style={styles.groupHeaderRow}>
              <Text accessibilityRole="header" style={[styles.groupTitle, { color: theme.color.text }]}>
                {activeFilterOption?.label ?? "Service Impacts"}
              </Text>
              <View
                style={[
                  styles.countBadge,
                  { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.border },
                ]}
              >
                <Text style={[styles.countText, { color: theme.color.text }]}>
                  {filteredImpacts.length}
                </Text>
              </View>
            </View>

            {filteredImpacts.length === 0 ? (
              <EmptyState
                title="No matching impacts"
                message={`No ${activeFilterOption?.label.toLowerCase() ?? "impacts"} in the active ${network === "ttc" ? "TTC" : "GO/UP"} dashboard poll.`}
              />
            ) : (
              filteredImpacts.map((impact) => renderImpactCard(impact))
            )}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  statusSection: { gap: 8, marginTop: 2 },
  sectionHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "900" },
  sectionMeta: { flexShrink: 1, fontSize: 9, fontWeight: "800", letterSpacing: 0.35, textTransform: "uppercase" },
  groupSection: { gap: 10, marginTop: 4 },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 2,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  countBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    height: 22,
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
});
