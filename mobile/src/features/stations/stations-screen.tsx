import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDashboard } from "@/api/dashboard";
import type { Station } from "@/api/dashboard-schema";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LineBadge } from "@/components/line-badge";
import { LoadingState } from "@/components/loading-state";
import { BookmarkIcon, CloseIcon, SearchIcon } from "@/components/operations-icons";
import { ProductHeader } from "@/components/product-header";
import { Screen } from "@/components/screen";
import { useAppActive } from "@/hooks/use-app-active";
import { useNetwork } from "@/state/network-provider";
import { useSavedStations } from "@/state/saved-stations-provider";
import { useTheme } from "@/theme/theme-provider";
import {
  getLinesForStation,
  REGIONAL_LINE_FILTERS,
  stationMatchesLineFilter,
  TTC_LINE_FILTERS,
} from "./station-catalog";

const SAVED_FILTER = { id: "saved", label: "Saved", lineId: "saved" };

export function StationsScreen() {
  const { network, setNetwork } = useNetwork();
  const query = useDashboard(network, useAppActive());
  const { isSaved, toggleSaved } = useSavedStations();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState("");
  const [selectedLineFilter, setSelectedLineFilter] = useState("all");

  // Reset line filter when network changes
  const handleNetworkChange = useCallback(
    (nextNetwork: "ttc" | "regional") => {
      setSelectedLineFilter("all");
      setNetwork(nextNetwork);
    },
    [setNetwork],
  );

  const rawLineFilters = network === "regional" ? REGIONAL_LINE_FILTERS : TTC_LINE_FILTERS;
  const lineFilters = useMemo(() => [SAVED_FILTER, ...rawLineFilters], [rawLineFilters]);

  const filteredStations = useMemo(() => {
    const stations = query.data?.map.stations ?? [];
    const normalized = search.trim().toLocaleLowerCase();
    return stations.filter((station) => {
      const matchesSearch =
        normalized.length === 0 || station.name.toLocaleLowerCase().includes(normalized);
      if (selectedLineFilter === "saved") {
        return matchesSearch && isSaved(station.id, network);
      }
      const matchesFilter = stationMatchesLineFilter(network, station.id, selectedLineFilter);
      return matchesSearch && matchesFilter;
    });
  }, [query.data?.map.stations, search, network, selectedLineFilter, isSaved]);

  const handleStationPress = useCallback(
    (station: Station) => {
      Keyboard.dismiss();
      router.push({
        pathname: "/station/[network]/[id]",
        params: { network, id: station.id },
      });
    },
    [network],
  );

  const bottomPadding = Math.max(100, insets.bottom + 80);

  return (
    <Screen>
      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        data={filteredStations}
        keyExtractor={(station) => station.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl
            colors={[theme.color.focus]}
            onRefresh={() => void query.refetch()}
            refreshing={query.isRefetching}
            tintColor={theme.color.focus}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <ProductHeader
              eyebrow="STATION DIRECTORY"
              network={network}
              onNetworkChange={handleNetworkChange}
              subtitle="Search mapped stations, arrivals, accessibility, and connections."
              title="Stations"
            />

            {/* Sticky Search Input Bar */}
            <View
              style={[
                styles.searchContainer,
                {
                  backgroundColor: theme.color.surface,
                  borderColor: theme.color.border,
                },
              ]}
            >
              <SearchIcon color={theme.color.textMuted} size={18} />
              <TextInput
                accessibilityLabel="Search stations"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="never"
                onChangeText={setSearch}
                placeholder="Search stations"
                placeholderTextColor={theme.color.textMuted}
                returnKeyType="search"
                style={[styles.input, { color: theme.color.text }]}
                value={search}
              />
              {search.length > 0 ? (
                <Pressable
                  accessibilityHint="Clears the station search query"
                  accessibilityLabel="Clear station search"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setSearch("")}
                  style={styles.clearButton}
                  testID="clear-station-search"
                >
                  <CloseIcon color={theme.color.textMuted} size={16} />
                </Pressable>
              ) : null}
            </View>

            {/* Line & Saved Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScroll}
            >
              {lineFilters.map((filter) => {
                const isSelected = selectedLineFilter === filter.id;
                return (
                  <Pressable
                    key={filter.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Filter by ${filter.label}`}
                    onPress={() => setSelectedLineFilter(filter.id)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: isSelected
                          ? theme.color.focus
                          : theme.color.surface,
                        borderColor: isSelected ? theme.color.focus : theme.color.border,
                      },
                    ]}
                    testID={`line-filter-${filter.id}`}
                  >
                    {filter.id === "saved" ? (
                      <BookmarkIcon
                        color={isSelected ? "#090909" : theme.color.textMuted}
                        filled={isSelected}
                        size={14}
                      />
                    ) : null}
                    {"lineNumber" in filter && filter.lineNumber ? (
                      <View style={styles.chipBadge}>
                        <LineBadge
                          lineId={filter.lineId}
                          lineNumber={filter.lineNumber}
                          size={18}
                        />
                      </View>
                    ) : null}
                    <Text
                      style={[
                        styles.filterChipText,
                        {
                          color: isSelected ? "#090909" : theme.color.text,
                          fontWeight: isSelected ? "900" : "700",
                        },
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Results Count Summary */}
            {query.data ? (
              <View style={styles.resultCountRow}>
                <Text style={[styles.resultCountText, { color: theme.color.textMuted }]}>
                  {filteredStations.length}{" "}
                  {filteredStations.length === 1 ? "station" : "stations"}{" "}
                  {search.trim() || selectedLineFilter !== "all" ? "matching" : "mapped"}
                </Text>
              </View>
            ) : null}

            {!query.data && query.isPending ? (
              <LoadingState compact message="Loading stations…" />
            ) : null}
            {!query.data && query.error ? (
              <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          query.data ? (
            <EmptyState
              compact
              title="No matching mapped stations."
              message={
                search.trim()
                  ? `No mapped stations matched "${search.trim()}".`
                  : selectedLineFilter === "saved"
                    ? "No saved stations in your watchlist. Tap the star icon on any station to add it."
                    : selectedLineFilter !== "all"
                      ? "No stations found for the selected line filter."
                      : undefined
              }
            />
          ) : null
        }
        renderItem={({ item }) => {
          const lines = getLinesForStation(network, item.id);
          const saved = isSaved(item.id, network);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}${item.interchange ? ", interchange station" : ""}`}
              onPress={() => handleStationPress(item)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surface,
                  borderColor: theme.color.border,
                },
              ]}
              testID={`station-row-${item.id}`}
            >
              <View style={styles.stationMainInfo}>
                <View style={styles.stationNameRow}>
                  <Text style={[styles.stationName, { color: theme.color.text }]}>{item.name}</Text>
                  {item.interchange ? (
                    <View
                      style={[
                        styles.interchangeBadge,
                        {
                          borderColor: theme.color.border,
                          backgroundColor: theme.color.surfaceRaised,
                        },
                      ]}
                    >
                      <Text style={[styles.interchangeText, { color: theme.color.textMuted }]}>
                        INTERCHANGE
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Line Badges per station */}
                {lines.length > 0 ? (
                  <View style={styles.stationLineBadges}>
                    {lines.map((line) => (
                      <LineBadge
                        key={line.id}
                        lineId={line.id}
                        lineNumber={line.number}
                        size={20}
                      />
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.stationActionGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    saved
                      ? `Remove ${item.name} from saved stations`
                      : `Save ${item.name} to saved stations`
                  }
                  hitSlop={8}
                  onPress={(e) => {
                    e.stopPropagation();
                    void toggleSaved(item.id, network);
                  }}
                  style={({ pressed }) => [
                    styles.saveIconButton,
                    {
                      backgroundColor: saved
                        ? `${theme.color.focus}20`
                        : pressed
                          ? theme.color.surfaceRaised
                          : "transparent",
                      borderColor: saved ? theme.color.focus : theme.color.border,
                    },
                  ]}
                  testID={`save-station-button-${item.id}`}
                >
                  <BookmarkIcon
                    color={saved ? theme.color.focus : theme.color.textMuted}
                    filled={saved}
                    size={16}
                  />
                </Pressable>

                <Text style={[styles.chevron, { color: theme.color.textMuted }]}>›</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  header: { gap: 10, marginBottom: 8 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    gap: 8,
  },
  searchIcon: { fontSize: 14 },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  clearButton: {
    padding: 4,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  filterScroll: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 38,
    gap: 6,
  },
  chipBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipText: {
    fontSize: 12,
  },
  resultCountRow: {
    marginTop: 2,
    marginBottom: 2,
  },
  resultCountText: {
    fontSize: 11.5,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  row: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stationMainInfo: {
    flex: 1,
    gap: 6,
  },
  stationNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  stationName: {
    fontSize: 15,
    fontWeight: "800",
  },
  interchangeBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  interchangeText: {
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  stationLineBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  stationActionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  saveIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  saveIconText: {
    fontSize: 18,
    lineHeight: 20,
  },
  chevron: {
    fontSize: 20,
    fontWeight: "700",
  },
});
