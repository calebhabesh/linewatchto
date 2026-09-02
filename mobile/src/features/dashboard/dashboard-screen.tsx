import { router } from "expo-router";
import { useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { useDashboard } from "@/api/dashboard";
import { AlertCard } from "@/components/alert-card";
import { DataStateBanner } from "@/components/data-state-banner";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LineStatusList } from "@/components/line-status-list";
import { LoadingState } from "@/components/loading-state";
import { NetworkSwitcher } from "@/components/network-switcher";
import { Screen } from "@/components/screen";
import { SchematicMap } from "@/features/map/schematic-map";
import { useAppActive } from "@/hooks/use-app-active";
import { useNetwork } from "@/state/network-provider";
import { useTheme } from "@/theme/theme-provider";

export function DashboardScreen() {
  const { network, setNetwork } = useNetwork();
  const appIsActive = useAppActive();
  const query = useDashboard(network, appIsActive);
  const { theme } = useTheme();
  const lineColors = useMemo(
    () => new Map(query.data?.status.lines.map((line) => [line.id, line.color]) ?? []),
    [query.data?.status.lines],
  );

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
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: theme.color.textMuted }]}>UNOFFICIAL TRANSIT DASHBOARD</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.color.text }]}>LineWatchTO</Text>
          </View>
          <NetworkSwitcher value={network} onChange={setNetwork} />
        </View>

        {!query.data && query.isPending ? (
          <LoadingState message="Loading service status…" />
        ) : null}

        {!query.data && query.error ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : null}

        {query.data ? (
          <>
            <DataStateBanner
              dashboard={query.data}
              cachedAt={query.dataUpdatedAt}
              hasRefreshError={query.isError}
              showingCachedData={query.isError || query.isStale}
            />

            <SectionTitle title="Current status" subtitle={query.data.status.generatedAt.lastPoll} />
            <LineStatusList lines={query.data.status.lines} />

            <SectionTitle title="Service map" subtitle="Schematic—not exact train positions" />
            <SchematicMap dashboard={query.data} />

            <SectionTitle
              title="Current impacts"
              subtitle={`${query.data.activeAlerts.length + query.data.delays.length + query.data.reducedSpeedZones.length} active`}
            />
            {query.data.activeAlerts.map((alert) => (
              <AlertCard
                key={`active-${alert.id}`}
                lineColor={lineColors.get(alert.lineId) ?? theme.line.suspension}
                lineNumber={alert.lineNumber}
                location={alert.location}
                source={alert.source}
                title={alert.title}
                tone="suspension"
                onPress={() =>
                  router.push({
                    pathname: "/impact/[kind]/[id]",
                    params: { kind: "suspension", id: alert.id },
                  })
                }
              />
            ))}
            {query.data.delays.map((alert) => (
              <AlertCard
                key={`delay-${alert.id}`}
                lineColor={lineColors.get(alert.lineId) ?? theme.line.delay}
                lineNumber={alert.lineNumber}
                location={alert.location}
                source={alert.source}
                title={alert.title}
                tone="delay"
                onPress={() =>
                  router.push({
                    pathname: "/impact/[kind]/[id]",
                    params: { kind: "delay", id: alert.id },
                  })
                }
              />
            ))}
            {query.data.reducedSpeedZones.map((alert) => (
              <AlertCard
                key={`rsz-${alert.id}`}
                lineColor={lineColors.get(alert.lineId) ?? theme.line.delay}
                lineNumber={alert.lineNumber}
                location={alert.location}
                source={alert.source}
                title={alert.title}
                tone="delay"
                onPress={() =>
                  router.push({
                    pathname: "/impact/[kind]/[id]",
                    params: { kind: "reduced-speed-zone", id: alert.id },
                  })
                }
              />
            ))}
            {query.data.activeAlerts.length + query.data.delays.length + query.data.reducedSpeedZones.length === 0 ? (
              <EmptyState
                title="No current impacts in this response"
                message="This does not override the source-state notice above."
              />
            ) : null}

            <SectionTitle title="Planned closures" subtitle={`${query.data.plannedClosures.length} published`} />
            {query.data.plannedClosures.slice(0, 3).map((closure) => (
              <AlertCard
                key={`planned-${closure.id}`}
                lineColor={lineColors.get(closure.lineId) ?? theme.line.planned}
                lineNumber={closure.lineNumber}
                location={closure.window || closure.location}
                source={closure.source}
                title={closure.title}
                tone="planned"
                onPress={() =>
                  router.push({
                    pathname: "/impact/[kind]/[id]",
                    params: { kind: "planned-closure", id: closure.id },
                  })
                }
              />
            ))}
            {query.data.plannedClosures.length === 0 ? (
              <EmptyState compact title="No planned closures in this response." />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.color.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.sectionSubtitle, { color: theme.color.textMuted }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  header: { gap: 14, marginBottom: 2 },
  headerCopy: { gap: 2 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.35 },
  title: { fontSize: 28, fontWeight: "900", letterSpacing: -0.7 },
  sectionHeading: { marginTop: 10, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { flexShrink: 1, fontSize: 11, textAlign: "right" },
});
