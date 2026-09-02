import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

import { useDashboard } from "@/api/dashboard";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { NetworkSwitcher } from "@/components/network-switcher";
import { Screen } from "@/components/screen";
import { useAppActive } from "@/hooks/use-app-active";
import { useNetwork } from "@/state/network-provider";
import { useTheme } from "@/theme/theme-provider";

export function StationsScreen() {
  const { network, setNetwork } = useNetwork();
  const query = useDashboard(network, useAppActive());
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const stations = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return (query.data?.map.stations ?? []).filter((station) => station.name.toLocaleLowerCase().includes(normalized));
  }, [query.data?.map.stations, search]);

  return (
    <Screen>
      <FlatList
        contentContainerStyle={styles.content}
        data={stations}
        keyExtractor={(station) => station.id}
        keyboardShouldPersistTaps="handled"
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
            <Text accessibilityRole="header" style={[styles.title, { color: theme.color.text }]}>Stations</Text>
            <NetworkSwitcher value={network} onChange={setNetwork} />
            <TextInput
              accessibilityLabel="Search stations"
              autoCapitalize="none"
              onChangeText={setSearch}
              placeholder="Search stations"
              placeholderTextColor={theme.color.textMuted}
              returnKeyType="search"
              style={[styles.input, { backgroundColor: theme.color.surface, borderColor: theme.color.border, color: theme.color.text }]}
              value={search}
            />
            {!query.data && query.isPending ? <LoadingState compact message="Loading stations…" /> : null}
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
              message={search.trim() ? `No mapped stations matched "${search.trim()}".` : undefined}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}${item.interchange ? ", interchange station" : ""}`}
            onPress={() =>
              router.push({
                pathname: "/station/[network]/[id]",
                params: { network, id: item.id },
              })
            }
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: pressed ? theme.color.surfaceRaised : theme.color.surface,
                borderColor: theme.color.border,
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: item.interchange ? theme.color.focus : theme.color.textMuted }]} />
            <Text style={[styles.stationName, { color: theme.color.text }]}>{item.name}</Text>
            {item.interchange ? <Text style={[styles.tag, { color: theme.color.textMuted }]}>INTERCHANGE</Text> : null}
            <Text style={[styles.chevron, { color: theme.color.textMuted }]}>›</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36, gap: 8 },
  header: { gap: 12, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "900" },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 6, paddingHorizontal: 14, fontSize: 16 },
  row: { minHeight: 54, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  stationName: { flex: 1, fontSize: 15, fontWeight: "700" },
  tag: { fontSize: 9, fontWeight: "800", letterSpacing: 0.7 },
  chevron: { fontSize: 18, fontWeight: "700" },
});
