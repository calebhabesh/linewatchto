import { router } from "expo-router";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDashboard } from "@/api/dashboard";
import { useEstimatedTrains } from "@/api/trains";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import {
  MapLineRail,
  MapStatusPeek,
  MapTopChrome,
} from "@/features/dashboard/map-dashboard-chrome";
import { SelectedImpactPreview } from "@/features/dashboard/selected-impact-preview";
import { SchematicMap } from "@/features/map/schematic-map";
import { useAppActive } from "@/hooks/use-app-active";
import { useImpactSelection } from "@/state/impact-selection-provider";
import { useNetwork } from "@/state/network-provider";
import { useTrainMarkersPreference } from "@/state/train-markers-provider";
import { useTheme } from "@/theme/theme-provider";
import { isRegionalRailClosed, isSubwayClosed } from "@/utils/operating-hours";
import { useShellOptional } from "./shell-provider";

export interface OperationsShellProps {
  testID?: string;
}

export const OperationsShell = memo(function OperationsShell({
  testID = "operations-shell",
}: OperationsShellProps) {
  const { network, setNetwork } = useNetwork();
  const { selection, clearSelection } = useImpactSelection();
  const { enabled: trainsEnabled, toggleEnabled: toggleTrains } = useTrainMarkersPreference();
  const appIsActive = useAppActive();
  const query = useDashboard(network, appIsActive);
  const isClosed = network === "regional" ? isRegionalRailClosed() : isSubwayClosed();
  const trainsQuery = useEstimatedTrains(network, trainsEnabled && appIsActive, !isClosed);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const shell = useShellOptional();

  const resetNonce = shell?.resetNonce ?? 0;
  const triggerMapReset = shell?.triggerMapReset ?? (() => {});
  const activeTab = shell?.activeTab ?? "index";
  const isMapTab = activeTab === "index";

  const peekBottomOffset = Math.max(96, insets.bottom + 84);
  const mapKeepouts = React.useMemo(
    () => ({
      top: insets.top + 48,
      bottom: peekBottomOffset + 130,
      left: 44,
      right: 48,
    }),
    [insets.top, peekBottomOffset],
  );

  return (
    <View
      accessibilityLabel="LineWatchTO Operations Shell"
      style={[styles.container, { backgroundColor: theme.color.background }]}
      testID={testID}
    >
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
        <View style={styles.mapLayer} testID="persistent-map-layer">
          {/* Layer 0: The Persistent Schematic Map — never unmounts across tab switches */}
          <SchematicMap
            dashboard={query.data}
            immersive
            keepouts={mapKeepouts}
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

          {/* Layer 1: Persistent Map Overlays & Chrome */}
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

          {/* Layer 2: Map-tab-specific peeks (only visible when Map tab is active) */}
          {isMapTab ? (
            <>
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
                onCenterMap={triggerMapReset}
                onOpenStatus={() => router.push("/(tabs)/alerts")}
                showingCachedData={query.isError || query.isStale}
                trainsCount={trainsQuery.data?.markers?.length}
                trainsEnabled={trainsEnabled}
                trainsOperating={!isClosed}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  mapLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  stateShell: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
});
