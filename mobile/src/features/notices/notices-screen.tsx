import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { useRegionalTripChanges, useSurfaceNotices } from "@/api/notices";
import type { RegionalTripChange, SurfaceNoticeDetail } from "@/api/notices-schema";
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

export function NoticesScreen() {
  const { network, setNetwork } = useNetwork();
  const [viewMode, setViewMode] = useState<"notices" | "trip-changes">("notices");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { theme } = useTheme();

  const isFocused = useScreenFocused();
  const isAppActive = useAppActive();

  const noticesQuery = useSurfaceNotices(
    network,
    categoryFilter,
    searchQuery,
    isFocused && isAppActive && (network === "ttc" || viewMode === "notices"),
  );

  const tripChangesQuery = useRegionalTripChanges(
    undefined,
    searchQuery,
    isFocused && isAppActive && network === "regional" && viewMode === "trip-changes",
  );

  const handleNetworkChange = useCallback((next: NetworkId) => {
    setNetwork(next);
  }, [setNetwork]);

  const activeQuery = network === "regional" && viewMode === "trip-changes"
    ? tripChangesQuery
    : noticesQuery;

  const isPending = activeQuery.isPending;
  const isRefetching = activeQuery.isRefetching;
  const error = activeQuery.error;
  const refetch = activeQuery.refetch;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
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
            testID="notices-back-button"
          >
            <BackArrowIcon color={theme.color.text} />
            <Text style={[styles.backText, { color: theme.color.text }]}>Back</Text>
          </Pressable>
        </View>

        <ProductHeader
          eyebrow="SERVICE NOTICES & CHANGES"
          subtitle="Surface detours, bus/streetcar notices, and regional trip changes."
          title="Service Notices"
        />

        {/* Network Switcher */}
        <View style={styles.controlsRow}>
          <NetworkSwitcher value={network} onChange={handleNetworkChange} />
        </View>

        {/* Regional Sub-Tabs: Service Notices vs Trip Changes */}
        {network === "regional" ? (
          <View style={styles.subTabsRow}>
            {(["notices", "trip-changes"] as const).map((mode) => {
              const selected = viewMode === mode;
              const label = mode === "notices" ? "Service Notices" : "Trip Changes";
              return (
                <Pressable
                  key={mode}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setViewMode(mode)}
                  style={[
                    styles.subTab,
                    {
                      borderColor: selected ? theme.color.focus : theme.color.border,
                      backgroundColor: selected ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                    },
                  ]}
                  testID={`subtab-${mode}`}
                >
                  <Text
                    style={[
                      styles.subTabText,
                      { color: selected ? theme.color.text : theme.color.textMuted },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Search Bar */}
        <View
          style={[
            styles.searchContainer,
            { backgroundColor: theme.color.surface, borderColor: theme.color.border },
          ]}
        >
          <SearchIcon color={theme.color.textQuiet} />
          <TextInput
            accessibilityLabel="Search service notices"
            clearButtonMode="while-editing"
            onChangeText={setSearchQuery}
            placeholder={
              network === "regional" && viewMode === "trip-changes"
                ? "Search trip, corridor, or destination…"
                : "Search route, stop, or keyword…"
            }
            placeholderTextColor={theme.color.textQuiet}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.color.text }]}
            testID="notices-search-input"
            value={searchQuery}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              onPress={() => {
                setSearchQuery("");
                Keyboard.dismiss();
              }}
              style={styles.clearButton}
              testID="notices-search-clear"
            >
              <Text style={[styles.clearText, { color: theme.color.textQuiet }]}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Category Filters (when in notices mode) */}
        {network === "ttc" || viewMode === "notices" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: categoryFilter === "all" }}
              onPress={() => setCategoryFilter("all")}
              style={[
                styles.filterChip,
                {
                  borderColor: categoryFilter === "all" ? theme.color.focus : theme.color.border,
                  backgroundColor: categoryFilter === "all" ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                },
              ]}
              testID="filter-category-all"
            >
              <Text style={[styles.filterChipText, { color: categoryFilter === "all" ? theme.color.text : theme.color.textMuted }]}>
                All
              </Text>
            </Pressable>
            {noticesQuery.data?.categories.map((cat) => {
              const selected = categoryFilter === cat.category;
              return (
                <Pressable
                  key={cat.category}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setCategoryFilter(cat.category)}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: selected ? theme.color.focus : theme.color.border,
                      backgroundColor: selected ? theme.color.surfaceRaised : theme.color.surfaceOverlay,
                    },
                  ]}
                  testID={`filter-category-${cat.category}`}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: selected ? theme.color.text : theme.color.textMuted },
                    ]}
                  >
                    {cat.label} ({cat.count})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Content Lists */}
        {isPending ? (
          <LoadingState message="Loading service notices…" />
        ) : error ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Failed to load notices."}
            onRetry={() => {
              void refetch();
            }}
          />
        ) : network === "regional" && viewMode === "trip-changes" ? (
          <RegionalTripChangesList
            changes={tripChangesQuery.data?.changes ?? []}
            fresh={tripChangesQuery.data?.fresh ?? false}
            source={tripChangesQuery.data?.source ?? "Metrolinx"}
          />
        ) : (
          <SurfaceNoticesList
            fresh={noticesQuery.data?.fresh ?? false}
            notices={noticesQuery.data?.notices ?? []}
            source={noticesQuery.data?.source ?? "TTC GTFS-RT"}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function SurfaceNoticesList({
  notices,
  fresh,
  source,
}: {
  notices: SurfaceNoticeDetail[];
  fresh: boolean;
  source: string;
}) {
  const { theme } = useTheme();

  if (notices.length === 0) {
    return (
      <EmptyState
        message="No surface notices or detours match the current selection."
        title="No Active Notices"
      />
    );
  }

  return (
    <View style={styles.listContainer}>
      <View
        style={[
          styles.summaryBanner,
          { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border },
        ]}
      >
        <Text style={[styles.summaryTitle, { color: theme.color.text }]}>
          {notices.length} Notice{notices.length === 1 ? "" : "s"} Reported
        </Text>
        <Text style={[styles.summaryMeta, { color: theme.color.textQuiet }]}>
          SOURCE: {source.toUpperCase()} {fresh ? "· LIVE" : "· CACHED"}
        </Text>
      </View>

      {notices.map((notice) => (
        <SurfaceNoticeCard key={notice.id} notice={notice} />
      ))}
    </View>
  );
}

function SurfaceNoticeCard({ notice }: { notice: SurfaceNoticeDetail }) {
  const { theme } = useTheme();
  const catColor = notice.category === "detour" ? theme.line.delay : theme.line.planned;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.color.surface, borderColor: theme.color.border },
      ]}
      testID={`notice-card-${notice.id}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.routesRow}>
          {notice.routeIds.slice(0, 4).map((routeId) => (
            <View
              key={routeId}
              style={[styles.routePill, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.border }]}
            >
              <Text style={[styles.routePillText, { color: theme.color.text }]}>{routeId}</Text>
            </View>
          ))}
          {notice.routeIds.length > 4 ? (
            <Text style={[styles.moreRoutesText, { color: theme.color.textQuiet }]}>
              +{notice.routeIds.length - 4} more
            </Text>
          ) : null}
        </View>
        <View style={[styles.categoryPill, { backgroundColor: `${catColor}20`, borderColor: catColor }]}>
          <Text style={[styles.categoryPillText, { color: catColor }]}>
            {notice.category.toUpperCase()}
          </Text>
        </View>
      </View>

      <Text style={[styles.cardTitle, { color: theme.color.text }]}>{notice.title}</Text>
      {notice.description ? (
        <Text style={[styles.cardDesc, { color: theme.color.textMuted }]}>{notice.description}</Text>
      ) : null}

      {notice.location ? (
        <View style={styles.metaRow}>
          <Text style={[styles.metaKey, { color: theme.color.textQuiet }]}>LOCATION:</Text>
          <Text style={[styles.metaVal, { color: theme.color.text }]}>{notice.location}</Text>
        </View>
      ) : null}

      {notice.cause ? (
        <View style={styles.metaRow}>
          <Text style={[styles.metaKey, { color: theme.color.textQuiet }]}>CAUSE:</Text>
          <Text style={[styles.metaVal, { color: theme.color.textMuted }]}>{notice.cause}</Text>
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={[styles.cardSource, { color: theme.color.textQuiet }]}>
          {notice.source} · Updated {notice.updatedAt}
        </Text>
      </View>
    </View>
  );
}

function RegionalTripChangesList({
  changes,
  fresh,
  source,
}: {
  changes: RegionalTripChange[];
  fresh: boolean;
  source: string;
}) {
  const { theme } = useTheme();

  if (changes.length === 0) {
    return (
      <EmptyState
        message="No scheduled train cancellations, skipped stops, or added stops reported."
        title="No Active Trip Changes"
      />
    );
  }

  return (
    <View style={styles.listContainer}>
      <View
        style={[
          styles.summaryBanner,
          { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border },
        ]}
      >
        <Text style={[styles.summaryTitle, { color: theme.color.text }]}>
          {changes.length} Trip Change{changes.length === 1 ? "" : "s"}
        </Text>
        <Text style={[styles.summaryMeta, { color: theme.color.textQuiet }]}>
          SOURCE: {source.toUpperCase()} {fresh ? "· LIVE" : "· CACHED"}
        </Text>
      </View>

      {changes.map((change) => (
        <RegionalTripChangeCard key={change.id} change={change} />
      ))}
    </View>
  );
}

function RegionalTripChangeCard({ change }: { change: RegionalTripChange }) {
  const { theme } = useTheme();
  const isCancellation = change.kind === "cancellation";
  const kindColor = isCancellation
    ? theme.line.suspension
    : change.kind === "skipped-stop"
      ? theme.line.delay
      : "#3b82f6";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.color.surface, borderColor: theme.color.border },
      ]}
      testID={`trip-change-card-${change.id}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.corridorIdentity}>
          <LineBadge
            color="#22c55e"
            lineId={change.lineId}
            lineNumber={change.lineNumber}
            size={22}
          />
          <Text style={[styles.corridorName, { color: theme.color.text }]}>{change.lineName}</Text>
        </View>
        <View style={[styles.categoryPill, { backgroundColor: `${kindColor}20`, borderColor: kindColor }]}>
          <Text style={[styles.categoryPillText, { color: kindColor }]}>
            {change.kind.replace("-", " ").toUpperCase()}
          </Text>
        </View>
      </View>

      <Text style={[styles.cardTitle, { color: theme.color.text }]}>{change.title}</Text>
      <Text style={[styles.destinationLine, { color: theme.color.textMuted }]}>
        Towards {change.destination} {change.tripNumber ? `· Trip #${change.tripNumber}` : ""}
      </Text>

      {change.scheduleMatched ? (
        <View style={[styles.matchedBadge, { backgroundColor: "rgba(34,197,94,0.15)", borderColor: "#22c55e" }]}>
          <Text style={[styles.matchedBadgeText, { color: "#22c55e" }]}>✓ SCHEDULE-MATCHED</Text>
        </View>
      ) : (
        <View style={[styles.matchedBadge, { backgroundColor: "rgba(245,158,11,0.15)", borderColor: "#f59e0b" }]}>
          <Text style={[styles.matchedBadgeText, { color: "#f59e0b" }]}>UNMATCHED ADVISORY</Text>
        </View>
      )}

      {change.affectedStops.length > 0 ? (
        <View style={styles.stopsBlock}>
          <Text style={[styles.stopsHeader, { color: theme.color.textQuiet }]}>AFFECTED STOPS:</Text>
          <Text style={[styles.stopsList, { color: theme.color.text }]}>
            {change.affectedStops.map((s) => s.stationName).join(" → ")}
          </Text>
        </View>
      ) : null}

      {change.cause ? (
        <View style={styles.metaRow}>
          <Text style={[styles.metaKey, { color: theme.color.textQuiet }]}>CAUSE:</Text>
          <Text style={[styles.metaVal, { color: theme.color.textMuted }]}>{change.cause}</Text>
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={[styles.cardSource, { color: theme.color.textQuiet }]}>
          {change.sourceSystems.join(", ")}
        </Text>
      </View>
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

function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
      <Path d="M20 20l-3.5-3.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
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
  subTabsRow: { flexDirection: "row", gap: 8 },
  subTab: {
    minHeight: 40,
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  subTabText: { fontSize: 13, fontWeight: "800" },
  searchContainer: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, minHeight: 44 },
  clearButton: { padding: 6 },
  clearText: { fontSize: 14, fontWeight: "800" },
  filterScroll: { gap: 8, paddingVertical: 2 },
  filterChip: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipText: { fontSize: 12, fontWeight: "800" },
  listContainer: { gap: 12 },
  summaryBanner: { borderWidth: 1, borderRadius: 6, padding: 12, gap: 4 },
  summaryTitle: { fontSize: 14, fontWeight: "800" },
  summaryMeta: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  card: { borderWidth: 1, borderRadius: 6, padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  routesRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 },
  routePill: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  routePillText: { fontSize: 11, fontWeight: "900" },
  moreRoutesText: { fontSize: 11, fontWeight: "700" },
  corridorIdentity: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  corridorName: { fontSize: 14, fontWeight: "800" },
  categoryPill: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  categoryPillText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  cardTitle: { fontSize: 14, fontWeight: "800", lineHeight: 19 },
  cardDesc: { fontSize: 12, lineHeight: 17 },
  destinationLine: { fontSize: 12, fontWeight: "700" },
  matchedBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  matchedBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  stopsBlock: { gap: 3, paddingTop: 2 },
  stopsHeader: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  stopsList: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingTop: 2 },
  metaKey: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 1 },
  metaVal: { flex: 1, fontSize: 12, lineHeight: 16 },
  cardFooter: { paddingTop: 4 },
  cardSource: { fontSize: 10, fontWeight: "600" },
});
