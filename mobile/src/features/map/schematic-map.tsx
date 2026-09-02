import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";

import type { Dashboard, NetworkSegment } from "@/api/dashboard-schema";
import { useTheme } from "@/theme/theme-provider";
import {
  getNetworkAspectRatio,
  getNetworkViewBox,
  type MapNetworkId,
} from "./map-plane-manifest";
import { RasterMapPlane } from "./raster-map-plane";

type Selection = {
  cardId: string;
  kind: string;
  label: string;
} | null;

export function SchematicMap({ dashboard }: { dashboard: Dashboard }) {
  const { theme, mode } = useTheme();
  const [selection, setSelection] = useState<Selection>(null);
  const ttc = dashboard.networkId === "ttc";
  const network: MapNetworkId = ttc ? "ttc" : "regional";
  const viewBox = getNetworkViewBox(network);
  const aspectRatio = getNetworkAspectRatio(network);

  const drawableSegments = useMemo(
    () => dashboard.map.segments.filter((segment) => segment.pathD.trim().length > 0),
    [dashboard.map.segments],
  );

  const impactedSegments = useMemo(
    () => drawableSegments.filter((segment) => primaryImpact(segment) !== undefined),
    [drawableSegments],
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.color.surface, borderColor: theme.color.border },
      ]}
      testID={`schematic-map-${network}`}
    >
      <View
        style={[styles.mapStage, { aspectRatio }]}
        testID="map-stage"
      >
        {/* Layer 1: Background Plane (Lakes, Geography, Base guides) */}
        <RasterMapPlane
          contentFit="contain"
          network={network}
          plane="background"
          testID={`raster-plane-${network}-background`}
          theme={mode}
        />

        {/* Layer 2: Dynamic Alert Overlay Underneath Foreground Lines */}
        <Svg
          accessibilityElementsHidden
          height="100%"
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          preserveAspectRatio="xMidYMid meet"
          style={StyleSheet.absoluteFill}
          viewBox={viewBox}
          width="100%"
        >
          <G testID="dynamic-impact-overlays">
            {impactedSegments.map((segment) => {
              const impact = primaryImpact(segment)!;
              const isSelected = selection?.cardId === impact.cardId;
              const color = impactColor(impact.kind, theme.line);
              return (
                <Path
                  key={`impact-${segment.id}`}
                  d={segment.pathD}
                  fill="none"
                  stroke={color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={isSelected ? 82 : 64}
                  testID={`impact-path-${segment.id}`}
                />
              );
            })}
          </G>
        </Svg>

        {/* Layer 3: Foreground Plane (Tracks, Line Colors, Station Ticks) */}
        <RasterMapPlane
          contentFit="contain"
          network={network}
          plane="foreground"
          testID={`raster-plane-${network}-foreground`}
          theme={mode}
        />

        {/* Layer 4: Labels Plane (Station Typography & Badges above Overlays) */}
        <RasterMapPlane
          contentFit="contain"
          network={network}
          plane="labels"
          testID={`raster-plane-${network}-labels`}
          theme={mode}
        />

        {/* Layer 5: Interactive Touch Targets & Selection Emphasis */}
        <Svg
          accessibilityLabel={`${ttc ? "TTC" : "GO and UP"} schematic service map`}
          accessibilityRole="image"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={StyleSheet.absoluteFill}
          viewBox={viewBox}
          width="100%"
        >
          <G testID="interactive-overlay-targets">
            {impactedSegments.map((segment) => {
              const impact = primaryImpact(segment)!;
              const isSelected = selection?.cardId === impact.cardId;
              return (
                <G key={`target-${segment.id}`}>
                  {/* Invisible wide touch hit target */}
                  <Path
                    d={segment.pathD}
                    fill="none"
                    onPress={() =>
                      setSelection({
                        cardId: impact.cardId,
                        kind: impact.kind,
                        label: segment.label,
                      })
                    }
                    stroke="transparent"
                    strokeLinecap="round"
                    strokeWidth={160}
                    testID={`impact-target-${segment.id}`}
                  />
                  {/* Active selection pulse/ring highlight */}
                  {isSelected ? (
                    <Path
                      d={segment.pathD}
                      fill="none"
                      pointerEvents="none"
                      stroke={theme.color.text}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={24}
                    />
                  ) : null}
                </G>
              );
            })}
          </G>
        </Svg>
      </View>

      <View style={[styles.caption, { borderTopColor: theme.color.border }]}>
        <Text style={[styles.captionText, { color: theme.color.textMuted }]}>
          {selection
            ? `${selection.kind.replaceAll("-", " ")} · ${selection.label}`
            : impactedSegments.length > 0
              ? "Tap a highlighted impact segment. Pan and pinch gestures are scaffolded as the next map slice."
              : ttc
                ? "All TTC subway and LRT lines operating normally."
                : "GO and UP regional rail network."}
        </Text>
      </View>
    </View>
  );
}

function primaryImpact(segment: NetworkSegment) {
  return segment.impacts[0];
}

function impactColor(kind: string, colors: typeof import("@/theme/tokens").themes.dark.line) {
  if (kind === "suspension") return colors.suspension;
  if (kind === "planned-closure") return colors.planned;
  if (kind === "reduced-speed-zone") return "#f59e0b";
  return colors.delay;
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 6, overflow: "hidden" },
  mapStage: { width: "100%", position: "relative", overflow: "hidden" },
  caption: { borderTopWidth: 1, minHeight: 46, paddingHorizontal: 12, paddingVertical: 9, justifyContent: "center" },
  captionText: { fontSize: 12, lineHeight: 17 },
});
