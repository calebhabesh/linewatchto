import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDashboard } from "@/api/dashboard";
import { useEstimatedTrains } from "@/api/trains";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { Screen } from "@/components/screen";
import {
  MapLineRail,
  MapStatusPeek,
  MapTopChrome,
} from "@/features/dashboard/map-dashboard-chrome";
import { SchematicMap } from "@/features/map/schematic-map";
import { useAppActive } from "@/hooks/use-app-active";
import { useImpactSelection } from "@/state/impact-selection-provider";
import { useNetwork } from "@/state/network-provider";
import { useTrainMarkersPreference } from "@/state/train-markers-provider";
import { useTheme } from "@/theme/theme-provider";
import { isRegionalRailClosed, isSubwayClosed } from "@/utils/operating-hours";
import { SelectedImpactPreview } from "./selected-impact-preview";

export function DashboardScreen() {
  const { network, setNetwork } = useNetwork();
  const { selection, clearSelection } = useImpactSelection();
  const { enabled: trainsEnabled, toggleEnabled: toggleTrains } = useTrainMarkersPreference();
  const appIsActive = useAppActive();
  const query = useDashboard(network, appIsActive);
  const isClosed = network === "regional" ? isRegionalRailClosed() : isSubwayClosed();
  const trainsQuery = useEstimatedTrains(network, trainsEnabled && appIsActive, !isClosed);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [resetNonce, setResetNonce] = useState(0);

  const peekBottomOffset = Math.max(96, insets.bottom + 84);

  return (
    <Screen style={styles.screen}>
      {!query.data && query.isPending ? (
        <View style={styles.stateShell}>
          <LoadingState message="Loading service map…" />
        </View>
      ) : null}

      {!query.data && query.error ? (
        <View style={styles.stateShell}>
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        </View>
      ) : null}

      {query.data ? (
        <View style={[styles.mapShell, { backgroundColor: theme.color.background }]}>
          <SchematicMap
            dashboard={query.data}
            immersive
            onSelectionOpen={(item) =>
              router.push({
                pathname: "/impact/[kind]/[id]",
                params: { kind: item.kind, id: item.cardId },
              })
            }
            resetNonce={resetNonce}
            trainMarkers={trainsQuery.data?.markers ?? []}
            trainMarkersVisible={trainsEnabled && !isClosed}
          />
          <MapLineRail lines={query.data.status.lines} />
          <MapTopChrome
            network={network}
            onNetworkChange={setNetwork}
            onRefresh={() => {
              void query.refetch();
              if (trainsEnabled && !isClosed) {
                void trainsQuery.refetch();
              }
            }}
            onToggleTrains={toggleTrains}
            refreshing={query.isRefetching || (trainsEnabled && trainsQuery.isRefetching)}
            trainsEnabled={trainsEnabled}
          />
          {selection ? (
            <SelectedImpactPreview
              bottomOffset={peekBottomOffset + 88}
              dashboard={query.data}
              onDismiss={clearSelection}
              onOpenDetails={(item) =>
                router.push({
                  pathname: "/impact/[kind]/[id]",
                  params: { kind: item.kind, id: item.cardId },
                })
              }
              selection={selection}
            />
          ) : null}
          <MapStatusPeek
            bottomOffset={peekBottomOffset}
            cachedAt={query.dataUpdatedAt}
            dashboard={query.data}
            hasRefreshError={query.isError}
            onCenterMap={() => setResetNonce((value) => value + 1)}
            onOpenStatus={() => router.push("/(tabs)/alerts")}
            showingCachedData={query.isError || query.isStale}
            trainsCount={trainsQuery.data?.markers?.length}
            trainsEnabled={trainsEnabled}
            trainsOperating={!isClosed}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { overflow: "hidden" },
  mapShell: { flex: 1, position: "relative" },
  stateShell: { flex: 1, justifyContent: "center", padding: 20 },
});
