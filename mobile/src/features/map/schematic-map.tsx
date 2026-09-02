import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Path } from "react-native-svg";

import type { Dashboard, NetworkSegment } from "@/api/dashboard-schema";
import type { EstimatedTrainMarker } from "@/api/trains-schema";
import {
  type ImpactKind,
  type ImpactSelection,
  useImpactSelection,
} from "@/state/impact-selection-provider";
import { useTheme } from "@/theme/theme-provider";
import {
  getNetworkAspectRatio,
  getNetworkViewBox,
  type MapNetworkId,
} from "./map-plane-manifest";
import {
  clampScale,
  clampTranslation,
  computeDoubleTapTransform,
  computeFocalZoomTransform,
  computeResetTransform,
  computeStepZoomTransform,
  MAP_PAN_ZOOM_LIMITS,
} from "./pan-zoom-math";
import { RasterMapPlane } from "./raster-map-plane";
import { TrainMarkerLayer } from "./train-marker-layer";

export type Selection = ImpactSelection | null;

export type SchematicMapProps = {
  dashboard: Dashboard;
  immersive?: boolean;
  reducedMotion?: boolean;
  resetNonce?: number;
  selection?: Selection;
  trainMarkers?: EstimatedTrainMarker[];
  trainMarkersVisible?: boolean;
  onSelectionChange?: (selection: Selection) => void;
  onSelectionOpen?: (selection: ImpactSelection) => void;
};

export const SchematicMap = memo(function SchematicMap({
  dashboard,
  immersive = false,
  reducedMotion: reducedMotionProp,
  resetNonce = 0,
  selection: selectionProp,
  trainMarkers = [],
  trainMarkersVisible = false,
  onSelectionChange,
  onSelectionOpen,
}: SchematicMapProps) {
  const { theme, mode } = useTheme();
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = reducedMotionProp ?? systemReducedMotion ?? false;

  const { selection: contextSelection, setSelection: setContextSelection } = useImpactSelection();
  const selection = selectionProp !== undefined ? selectionProp : contextSelection;

  const [stageDimensions, setStageDimensions] = useState({ width: 0, height: 0 });
  const [isZoomedOrPanned, setIsZoomedOrPanned] = useState(false);

  const ttc = dashboard.networkId === "ttc";
  const network: MapNetworkId = ttc ? "ttc" : "regional";
  const viewBox = getNetworkViewBox(network);
  const aspectRatio = getNetworkAspectRatio(network);

  // Shared values for Reanimated transform state
  const scale = useSharedValue<number>(MAP_PAN_ZOOM_LIMITS.defaultScale);
  const savedScale = useSharedValue<number>(MAP_PAN_ZOOM_LIMITS.defaultScale);
  const translateX = useSharedValue<number>(0);
  const savedTranslateX = useSharedValue<number>(0);
  const translateY = useSharedValue<number>(0);
  const savedTranslateY = useSharedValue<number>(0);
  const stageWidth = useSharedValue<number>(0);
  const stageHeight = useSharedValue<number>(0);

  const prevNetworkRef = useRef(network);
  const previousResetNonce = useRef(resetNonce);

  // Reset transform and selection when network switches
  useEffect(() => {
    if (prevNetworkRef.current !== network) {
      prevNetworkRef.current = network;
      scale.value = MAP_PAN_ZOOM_LIMITS.defaultScale;
      savedScale.value = MAP_PAN_ZOOM_LIMITS.defaultScale;
      translateX.value = 0;
      savedTranslateX.value = 0;
      translateY.value = 0;
      savedTranslateY.value = 0;
      setIsZoomedOrPanned(false);
      setContextSelection(null);
      onSelectionChange?.(null);
    }
  }, [network, onSelectionChange, savedScale, savedTranslateX, savedTranslateY, scale, setContextSelection, translateX, translateY]);

  const updateZoomState = useCallback(() => {
    const isAtDefault =
      Math.abs(scale.value - MAP_PAN_ZOOM_LIMITS.defaultScale) < 0.05 &&
      Math.abs(translateX.value) < 2 &&
      Math.abs(translateY.value) < 2;
    setIsZoomedOrPanned(!isAtDefault);
  }, [scale, translateX, translateY]);

  const applyTransform = useCallback(
    (nextScale: number, nextTx: number, nextTy: number, animate = true) => {
      const duration = animate && !reducedMotion ? 250 : 0;

      if (duration > 0) {
        scale.value = withTiming(nextScale, { duration });
        translateX.value = withTiming(nextTx, { duration });
        translateY.value = withTiming(nextTy, { duration });
      } else {
        scale.value = nextScale;
        translateX.value = nextTx;
        translateY.value = nextTy;
      }

      savedScale.value = nextScale;
      savedTranslateX.value = nextTx;
      savedTranslateY.value = nextTy;

      const isAtDefault =
        Math.abs(nextScale - MAP_PAN_ZOOM_LIMITS.defaultScale) < 0.05 &&
        Math.abs(nextTx) < 2 &&
        Math.abs(nextTy) < 2;
      setIsZoomedOrPanned(!isAtDefault);
    },
    [reducedMotion, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY],
  );

  const handleReset = useCallback(() => {
    const reset = computeResetTransform();
    applyTransform(reset.scale, reset.translateX, reset.translateY, true);
  }, [applyTransform]);

  useEffect(() => {
    if (previousResetNonce.current === resetNonce) return;
    previousResetNonce.current = resetNonce;
    handleReset();
  }, [handleReset, resetNonce]);

  const handleZoomIn = useCallback(() => {
    if (stageDimensions.width <= 0 || stageDimensions.height <= 0) return;
    const next = computeStepZoomTransform(
      { scale: scale.value, translateX: translateX.value, translateY: translateY.value },
      MAP_PAN_ZOOM_LIMITS.zoomStepRatio,
      stageDimensions.width,
      stageDimensions.height,
    );
    applyTransform(next.scale, next.translateX, next.translateY, true);
  }, [applyTransform, scale, stageDimensions.height, stageDimensions.width, translateX, translateY]);

  const handleZoomOut = useCallback(() => {
    if (stageDimensions.width <= 0 || stageDimensions.height <= 0) return;
    const next = computeStepZoomTransform(
      { scale: scale.value, translateX: translateX.value, translateY: translateY.value },
      1 / MAP_PAN_ZOOM_LIMITS.zoomStepRatio,
      stageDimensions.width,
      stageDimensions.height,
    );
    applyTransform(next.scale, next.translateX, next.translateY, true);
  }, [applyTransform, scale, stageDimensions.height, stageDimensions.width, translateX, translateY]);

  const handleSelectImpact = useCallback(
    (nextSelection: Selection) => {
      setContextSelection(nextSelection);
      onSelectionChange?.(nextSelection);
    },
    [onSelectionChange, setContextSelection],
  );

  // Gesture definitions
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      "worklet";
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      "worklet";
      const rawScale = savedScale.value * e.scale;
      const newScale = clampScale(rawScale);

      if (stageWidth.value <= 0 || stageHeight.value <= 0) {
        scale.value = newScale;
        return;
      }

      const transform = computeFocalZoomTransform(
        {
          scale: savedScale.value,
          translateX: savedTranslateX.value,
          translateY: savedTranslateY.value,
        },
        { x: e.focalX, y: e.focalY },
        newScale,
        stageWidth.value,
        stageHeight.value,
      );

      scale.value = transform.scale;
      translateX.value = transform.translateX;
      translateY.value = transform.translateY;
    })
    .onEnd(() => {
      "worklet";
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .minDistance(8)
    .onStart(() => {
      "worklet";
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      "worklet";
      const newTx = savedTranslateX.value + e.translationX;
      const newTy = savedTranslateY.value + e.translationY;

      const clamped = clampTranslation(
        newTx,
        newTy,
        scale.value,
        stageWidth.value,
        stageHeight.value,
      );

      translateX.value = clamped.translateX;
      translateY.value = clamped.translateY;
    })
    .onEnd(() => {
      "worklet";
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(300)
    .onEnd((e) => {
      "worklet";
      const nextTransform = computeDoubleTapTransform(
        {
          scale: scale.value,
          translateX: translateX.value,
          translateY: translateY.value,
        },
        { x: e.x, y: e.y },
        stageWidth.value,
        stageHeight.value,
      );

      if (reducedMotion) {
        scale.value = nextTransform.scale;
        translateX.value = nextTransform.translateX;
        translateY.value = nextTransform.translateY;
      } else {
        scale.value = withTiming(nextTransform.scale, { duration: 250 });
        translateX.value = withTiming(nextTransform.translateX, { duration: 250 });
        translateY.value = withTiming(nextTransform.translateY, { duration: 250 });
      }

      savedScale.value = nextTransform.scale;
      savedTranslateX.value = nextTransform.translateX;
      savedTranslateY.value = nextTransform.translateY;
    });

  const composedGesture = Gesture.Exclusive(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const drawableSegments = useMemo(
    () => dashboard.map.segments.filter((segment) => segment.pathD.trim().length > 0),
    [dashboard.map.segments],
  );

  const impactedSegments = useMemo(
    () => drawableSegments.filter((segment) => primaryImpact(segment) !== undefined),
    [drawableSegments],
  );

  const stationMap = useMemo(
    () => new Map(dashboard.map.stations.map((station) => [station.id, station])),
    [dashboard.map.stations],
  );

  const stationNodeImpacts = useMemo(
    () => (dashboard.map.stationNodeImpacts ?? []).filter((impact) => stationMap.has(impact.stationId)),
    [dashboard.map.stationNodeImpacts, stationMap],
  );

  const lineColors = useMemo(() => {
    const colors: Record<string, string> = {};
    for (const line of dashboard.status.lines) {
      colors[line.id] = line.color;
      colors[line.route] = line.color;
    }
    return colors;
  }, [dashboard.status.lines]);

  return (
    <View
      style={[
        styles.container,
        immersive && styles.containerImmersive,
        {
          backgroundColor: immersive ? theme.color.background : theme.color.surface,
          borderColor: theme.color.border,
        },
      ]}
      testID={`schematic-map-${network}`}
    >
      <View
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setStageDimensions({ width, height });
          stageWidth.value = width;
          stageHeight.value = height;
          updateZoomState();
        }}
        style={[styles.mapStage, immersive ? styles.mapStageImmersive : { aspectRatio }]}
        testID="map-stage"
      >
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.canvas, animatedStyle]} testID="animated-map-canvas">
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
                {/* Segment Overlays */}
                {impactedSegments.map((segment) => {
                  const impact = primaryImpact(segment)!;
                  const isSelected = selection?.cardId === impact.cardId;
                  const color = impactColor(impact.kind, theme.line);
                  return (
                    <Path
                      key={`impact-segment-${segment.id}`}
                      d={segment.pathD}
                      fill="none"
                      stroke={color}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={isSelected ? (ttc ? 82 : 140) : (ttc ? 64 : 110)}
                      testID={`impact-path-${segment.id}`}
                    />
                  );
                })}

                {/* Station Node Impact Rings */}
                {stationNodeImpacts.map((impact) => {
                  const station = stationMap.get(impact.stationId)!;
                  const isSelected = selection?.cardId === impact.cardId;
                  const color = impactColor(impact.kind, theme.line);
                  const ringRadius = ttc ? (isSelected ? 90 : 75) : (isSelected ? 165 : 140);
                  const strokeWidth = ttc ? (isSelected ? 44 : 36) : (isSelected ? 75 : 60);
                  return (
                    <Circle
                      key={`impact-station-${impact.stationId}-${impact.cardId}`}
                      cx={station.x}
                      cy={station.y}
                      fill="none"
                      r={ringRadius}
                      stroke={color}
                      strokeWidth={strokeWidth}
                      testID={`impact-station-ring-${impact.stationId}`}
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

            {/* Layer 4.5: Estimated Train Markers */}
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
              <TrainMarkerLayer
                lineColors={lineColors}
                markers={trainMarkers}
                network={network}
                segments={drawableSegments}
                stations={dashboard.map.stations}
                visible={trainMarkersVisible}
              />
            </Svg>

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
                {/* Segment Targets */}
                {impactedSegments.map((segment) => {
                  const impact = primaryImpact(segment)!;
                  const isSelected = selection?.cardId === impact.cardId;
                  return (
                    <G key={`target-segment-${segment.id}`}>
                      {/* Wide touch hit target */}
                      <Path
                        d={segment.pathD}
                        fill="none"
                        onPress={() =>
                          handleSelectImpact({
                            cardId: impact.cardId,
                            kind: impact.kind,
                            label: segment.label,
                            segmentId: segment.id,
                            sourceNetwork: network,
                          })
                        }
                        stroke="transparent"
                        strokeLinecap="round"
                        strokeWidth={ttc ? 160 : 280}
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
                          strokeWidth={ttc ? 24 : 40}
                          testID={`impact-highlight-${segment.id}`}
                        />
                      ) : null}
                    </G>
                  );
                })}

                {/* Station Node Targets */}
                {stationNodeImpacts.map((impact) => {
                  const station = stationMap.get(impact.stationId)!;
                  const isSelected = selection?.cardId === impact.cardId;
                  const hitRadius = ttc ? 160 : 280;
                  const highlightRadius = ttc ? 110 : 200;
                  return (
                    <G key={`target-station-${impact.stationId}-${impact.cardId}`}>
                      {/* Wide station touch target */}
                      <Circle
                        cx={station.x}
                        cy={station.y}
                        fill="transparent"
                        onPress={() =>
                          handleSelectImpact({
                            cardId: impact.cardId,
                            kind: impact.kind,
                            label: `${station.name} (${impact.title})`,
                            stationId: impact.stationId,
                            sourceNetwork: network,
                          })
                        }
                        stroke="transparent"
                        r={hitRadius}
                        testID={`impact-station-target-${impact.stationId}`}
                      />
                      {/* Active selection highlight circle */}
                      {isSelected ? (
                        <Circle
                          cx={station.x}
                          cy={station.y}
                          fill="none"
                          pointerEvents="none"
                          r={highlightRadius}
                          stroke={theme.color.text}
                          strokeWidth={ttc ? 20 : 36}
                          testID={`impact-station-highlight-${impact.stationId}`}
                        />
                      ) : null}
                    </G>
                  );
                })}
              </G>
            </Svg>
          </Animated.View>
        </GestureDetector>

        {/* Accessible Floating Map Controls (Zoom In, Zoom Out, Reset View) */}
        <View style={[styles.controlsOverlay, immersive && styles.controlsOverlayImmersive]} testID="map-controls-overlay">
          {isZoomedOrPanned ? (
            <Pressable
              accessibilityHint="Resets map zoom and panning back to default fit"
              accessibilityLabel="Reset map view"
              accessibilityRole="button"
              onPress={handleReset}
              style={({ pressed }) => [
                styles.controlButton,
                styles.resetButton,
                {
                  backgroundColor: theme.color.surfaceRaised,
                  borderColor: theme.color.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              testID="map-control-reset"
            >
              <Text style={[styles.controlText, styles.resetButtonText, { color: theme.color.text }]}>
                ⟲ Reset
              </Text>
            </Pressable>
          ) : null}

          <View style={[styles.zoomButtonGroup, { borderColor: theme.color.border }]}>
            <Pressable
              accessibilityLabel="Zoom in"
              accessibilityRole="button"
              onPress={handleZoomIn}
              style={({ pressed }) => [
                styles.controlButton,
                styles.zoomButton,
                {
                  backgroundColor: theme.color.surfaceRaised,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              testID="map-control-zoom-in"
            >
              <Text style={[styles.controlText, { color: theme.color.text }]}>+</Text>
            </Pressable>

            <View style={[styles.zoomDivider, { backgroundColor: theme.color.border }]} />

            <Pressable
              accessibilityLabel="Zoom out"
              accessibilityRole="button"
              onPress={handleZoomOut}
              style={({ pressed }) => [
                styles.controlButton,
                styles.zoomButton,
                {
                  backgroundColor: theme.color.surfaceRaised,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              testID="map-control-zoom-out"
            >
              <Text style={[styles.controlText, { color: theme.color.text }]}>−</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {!immersive && (
        <View style={[styles.caption, { borderTopColor: theme.color.border }]}>
          <Text style={[styles.captionText, { color: theme.color.textMuted }]}>
            {selection
              ? `${selection.kind.replaceAll("-", " ")} · ${selection.label ?? selection.cardId}`
              : impactedSegments.length > 0 || stationNodeImpacts.length > 0
                ? "Tap a highlighted impact for details. Pinch or double-tap to zoom, drag to pan."
                : ttc
                  ? "All TTC subway and LRT lines operating normally. Pinch to zoom."
                  : "GO and UP regional rail network. Pinch to zoom."}
          </Text>
        </View>
      )}
    </View>
  );
});

function primaryImpact(segment: NetworkSegment) {
  return segment.impacts[0];
}

export function impactColor(
  kind: ImpactKind | string,
  colors: typeof import("@/theme/tokens").themes.dark.line,
): string {
  switch (kind) {
    case "suspension":
      return colors.suspension;
    case "planned-closure":
      return colors.planned;
    case "reduced-speed-zone":
      return "#f59e0b";
    case "delay":
    default:
      return colors.delay;
  }
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 6, overflow: "hidden" },
  containerImmersive: { flex: 1, borderWidth: 0, borderRadius: 0 },
  mapStage: { width: "100%", position: "relative", overflow: "hidden" },
  mapStageImmersive: { flex: 1 },
  canvas: { width: "100%", height: "100%" },
  controlsOverlay: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 10,
  },
  controlsOverlayImmersive: { top: "auto", bottom: 210, flexDirection: "column-reverse", alignItems: "flex-end" },
  controlButton: {
    justifyContent: "center",
    alignItems: "center",
  },
  resetButton: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 30,
  },
  resetButtonText: {
    fontSize: 11,
    fontWeight: "700",
  },
  zoomButtonGroup: {
    flexDirection: "column",
    borderWidth: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  zoomButton: {
    width: 32,
    height: 30,
  },
  zoomDivider: {
    height: 1,
    width: "100%",
  },
  controlText: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  caption: {
    borderTopWidth: 1,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: "center",
  },
  captionText: { fontSize: 12, lineHeight: 17 },
  selectionChip: {
    position: "absolute",
    left: 70,
    right: 82,
    top: 66,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: "center",
  },
  selectionChipText: { fontSize: 11, lineHeight: 15, fontWeight: "800", textTransform: "capitalize" },
  selectionArrow: { fontSize: 8, fontWeight: "900", letterSpacing: 0.65, marginTop: 2 },
});
