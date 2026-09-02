import { router } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text } from "react-native";

import { useDashboard } from "@/api/dashboard";
import { AlertCard } from "@/components/alert-card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { NetworkSwitcher } from "@/components/network-switcher";
import { Screen } from "@/components/screen";
import { AlertFilterBar } from "@/features/alerts/alert-filter-bar";
import {
  type AlertFilter,
  filterImpacts,
  getAvailableFilters,
} from "@/features/alerts/impact-types";
import { useAppActive } from "@/hooks/use-app-active";
import { useNetwork } from "@/state/network-provider";
import { useTheme } from "@/theme/theme-provider";

export function AlertsScreen() {
  const { network, setNetwork } = useNetwork();
  const query = useDashboard(network, useAppActive());
  const { theme } = useTheme();
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

  const activeFilterOption = filters.find((f) => f.key === activeFilter);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[theme.color.focus]}
            onRefresh={() => void query.refetch()}
            refreshing={query.isRefetching}
            tintColor={theme.color.focus}
          />
        }
      >
        <Text accessibilityRole="header" style={[styles.title, { color: theme.color.text }]}>
          Service impacts
        </Text>
        <NetworkSwitcher value={network} onChange={setNetwork} />

        {query.data ? (
          <AlertFilterBar
            filters={filters}
            activeFilter={activeFilter}
            onSelectFilter={setSelectedFilter}
          />
        ) : null}

        {!query.data && query.isPending ? <LoadingState message="Loading service impacts…" /> : null}
        {!query.data && query.error ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : null}

        {filteredImpacts.map((impact) => (
          <AlertCard
            key={`${impact.kind}-${impact.data.id}`}
            lineColor={lines.get(impact.data.lineId) ?? theme.line[impact.tone]}
            lineNumber={impact.data.lineNumber}
            location={"window" in impact.data ? impact.data.window : impact.data.location}
            source={impact.data.source}
            title={impact.data.title}
            tone={impact.tone}
            onPress={() =>
              router.push({
                pathname: "/impact/[kind]/[id]",
                params: { kind: impact.kind, id: impact.data.id },
              })
            }
          />
        ))}

        {query.data && filteredImpacts.length === 0 ? (
          <EmptyState
            title={activeFilter === "all" ? "No impacts in this response" : "No matching impacts"}
            message={
              activeFilter === "all"
                ? query.data.message
                : `No ${activeFilterOption?.label.toLowerCase() ?? "impacts"} in the active ${network === "ttc" ? "TTC" : "GO/UP"} dashboard poll.`
            }
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  title: { fontSize: 26, fontWeight: "900" },
});
