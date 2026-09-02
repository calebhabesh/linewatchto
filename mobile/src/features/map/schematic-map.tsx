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
  type ViewportKeepouts,
} from "./map-plane-manifest";
import {
  applyElasticResistance,
  clamp,
  computeDefaultMapTransform,
  computeDoubleTapTransform,
  computeMaxTranslation,
  computeStepZoomTransform,
  isTransformAtDefault,
  MAP_PAN_ZOOM_LIMITS,
  type MapTransform,
} from "./pan-zoom-math";
import { RasterMapPlane } from "./raster-map-plane";
import { TrainMarkerLayer } from "./train-marker-layer";

export type Selection = ImpactSelection | null;

export type SchematicMapProps = {
  dashboard: Dashboard;
  immersive?: boolean;
  keepouts?: ViewportKeepouts;
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
  keepouts,
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

  const defaultTransform = useMemo(
    () => computeDefaultMapTransform(stageDimensions.width, stageDimensions.height, network, { keepouts }),
    [keepouts, network, stageDimensions.height, stageDimensions.width],
  );

  // Shared values for Reanimated transform state
  const scale = useSharedValue<number>(MAP_PAN_ZOOM_LIMITS.defaultScale);
  const savedScale = useSharedValue<number>(MAP_PAN_ZOOM_LIMITS.defaultScale);
  const translateX = useSharedValue<number>(0);
  const savedTranslateX = useSharedValue<number>(0);
  const translateY = useSharedValue<number>(0);
  const savedTranslateY = useSharedValue<number>(0);
  const defaultTx = useSharedValue<number>(0);
  const defaultTy = useSharedValue<number>(0);
  const stageWidth = useSharedValue<number>(0);
  const stageHeight = useSharedValue<number>(0);

  // Pinch tracking shared values
  const pinchStartScale = useSharedValue<number>(MAP_PAN_ZOOM_LIMITS.defaultScale);
  const pinchStartTx = useSharedValue<number>(0);
  const pinchStartTy = useSharedValue<number>(0);
  const pinchPrevFocalX = useSharedValue<number>(0);
  const pinchPrevFocalY = useSharedValue<number>(0);

  const prevNetworkRef = useRef(network);
  const previousResetNonce = useRef(resetNonce);
  const hasInitializedCameraRef = useRef(false);

  // Reset transform and selection when network switches
  useEffect(() => {
    if (prevNetworkRef.current !== network) {
      prevNetworkRef.current = network;
      const def = computeDefaultMapTransform(stageDimensions.width, stageDimensions.height, network, { keepouts });
      defaultTx.value = def.translateX;
      defaultTy.value = def.translateY;
      scale.value = def.scale;
      savedScale.value = def.scale;
      translateX.value = def.translateX;
      savedTranslateX.value = def.translateX;
      translateY.value = def.translateY;
      savedTranslateY.value = def.translateY;
      setIsZoomedOrPanned(false);
      setContextSelection(null);
      onSelectionChange?.(null);
    }
  }, [
    defaultTx,
    defaultTy,
    keepouts,
    network,
    onSelectionChange,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    setContextSelection,
    stageDimensions.height,
    stageDimensions.width,
    translateX,
    translateY,
  ]);

  const updateZoomState = useCallback(
    (targetDefault?: MapTransform) => {
      const def = targetDefault ?? defaultTransform;
      const isAtDefault = isTransformAtDefault(
        { scale: scale.value, translateX: translateX.value, translateY: translateY.value },
        def,
      );
      setIsZoomedOrPanned(!isAtDefault);
    },
    [defaultTransform, scale, translateX, translateY],
  );

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

      const isAtDefault = isTransformAtDefault(
        { scale: nextScale, translateX: nextTx, translateY: nextTy },
        defaultTransform,
      );
      setIsZoomedOrPanned(!isAtDefault);
    },
    [defaultTransform, reducedMotion, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY],
  );

  const handleReset = useCallback(() => {
    const def = computeDefaultMapTransform(stageDimensions.width, stageDimensions.height, network, { keepouts });
    applyTransform(def.scale, def.translateX, def.translateY, true);
  }, [applyTransform, keepouts, network, stageDimensions.height, stageDimensions.width]);

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
      { x: defaultTx.value, y: defaultTy.value },
    );
    applyTransform(next.scale, next.translateX, next.translateY, true);
  }, [applyTransform, defaultTx, defaultTy, scale, stageDimensions.height, stageDimensions.width, translateX, translateY]);

  const handleZoomOut = useCallback(() => {
    if (stageDimensions.width <= 0 || stageDimensions.height <= 0) return;
    const next = computeStepZoomTransform(
      { scale: scale.value, translateX: translateX.value, translateY: translateY.value },
      1 / MAP_PAN_ZOOM_LIMITS.zoomStepRatio,
      stageDimensions.width,
      stageDimensions.height,
      { x: defaultTx.value, y: defaultTy.value },
    );
    applyTransform(next.scale, next.translateX, next.translateY, true);
  }, [applyTransform, defaultTx, defaultTy, scale, stageDimensions.height, stageDimensions.width, translateX, translateY]);

  const handleSelectImpact = useCallback(
    (nextSelection: Selection) => {
      setContextSelection(nextSelection);
      onSelectionChange?.(nextSelection);
    },
    [onSelectionChange, setContextSelection],
  );

  // Gesture definitions
  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      "worklet";
      pinchStartScale.value = scale.value;
      pinchStartTx.value = translateX.value;
      pinchStartTy.value = translateY.value;
      pinchPrevFocalX.value = e.focalX;
      pinchPrevFocalY.value = e.focalY;
    })
    .onChange((e) => {
      "worklet";
      if (stageWidth.value <= 0 || stageHeight.value <= 0) return;

      const rawScale = pinchStartScale.value * e.scale;
      const effectiveScale = applyElasticResistance(
        rawScale,
        MAP_PAN_ZOOM_LIMITS.minScale,
        MAP_PAN_ZOOM_LIMITS.maxScale,
        0.35,
      );

      const centerX = stageWidth.value / 2;
      const centerY = stageHeight.value / 2;
      const focalRelX = e.focalX - centerX;
      const focalRelY = e.focalY - centerY;

      const scaleRatio = effectiveScale / pinchStartScale.value;
      let newTx = pinchStartTx.value + (focalRelX - pinchStartTx.value) * (1 - scaleRatio);
      let newTy = pinchStartTy.value + (focalRelY - pinchStartTy.value) * (1 - scaleRatio);

      // Add two-finger translation offset
      const dfx = e.focalX - pinchPrevFocalX.value;
      const dfy = e.focalY - pinchPrevFocalY.value;
      newTx += dfx;
      newTy += dfy;
      pinchPrevFocalX.value = e.focalX;
      pinchPrevFocalY.value = e.focalY;

      scale.value = effectiveScale;
      translateX.value = newTx;
      translateY.value = newTy;
    })
    .onEnd(() => {
      "worklet";
      const targetScale = clamp(
        scale.value,
        MAP_PAN_ZOOM_LIMITS.minScale,
        MAP_PAN_ZOOM_LIMITS.maxScale,
      );
      if (Math.abs(scale.value - targetScale) > 0.01) {
        scale.value = withTiming(targetScale, { duration: 200 });
      }

      const { maxX, maxY } = computeMaxTranslation(
        targetScale,
        stageWidth.value,
        stageHeight.value,
      );
      const minX = defaultTx.value - maxX;
      const maxXBound = defaultTx.value + maxX;
      const minY = defaultTy.value - maxY;
      const maxYBound = defaultTy.value + maxY;

      const clampedX = clamp(translateX.value, minX, maxXBound);
      const clampedY = clamp(translateY.value, minY, maxYBound);

      if (Math.abs(translateX.value - clampedX) > 1) {
        translateX.value = withTiming(clampedX, { duration: 200 });
      }
      if (Math.abs(translateY.value - clampedY) > 1) {
        translateY.value = withTiming(clampedY, { duration: 200 });
      }

      savedScale.value = targetScale;
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .minDistance(4)
    .onChange((e) => {
      "worklet";
      if (stageWidth.value <= 0 || stageHeight.value <= 0) return;

      const { maxX, maxY } = computeMaxTranslation(
        scale.value,
        stageWidth.value,
        stageHeight.value,
      );
      const minX = defaultTx.value - maxX;
      const maxXBound = defaultTx.value + maxX;
      const minY = defaultTy.value - maxY;
      const maxYBound = defaultTy.value + maxY;

      let deltaX = e.changeX;
      let deltaY = e.changeY;

      if ((translateX.value > maxXBound && deltaX > 0) || (translateX.value < minX && deltaX < 0)) {
        deltaX *= 0.35;
      }
      if ((translateY.value > maxYBound && deltaY > 0) || (translateY.value < minY && deltaY < 0)) {
        deltaY *= 0.35;
      }

      translateX.value += deltaX;
      translateY.value += deltaY;
    })
    .onEnd((e) => {
      "worklet";
      const { maxX, maxY } = computeMaxTranslation(
        scale.value,
        stageWidth.value,
        stageHeight.value,
      );
      const minX = defaultTx.value - maxX;
      const maxXBound = defaultTx.value + maxX;
      const minY = defaultTy.value - maxY;
      const maxYBound = defaultTy.value + maxY;

      if (translateX.value < minX || translateX.value > maxXBound) {
        translateX.value = withTiming(clamp(translateX.value, minX, maxXBound), { duration: 220 });
      } else if (Math.abs(e.velocityX) > 150) {
        const targetX = clamp(translateX.value + e.velocityX * 0.18, minX, maxXBound);
        translateX.value = withTiming(targetX, { duration: 280 });
      }

      if (translateY.value < minY || translateY.value > maxYBound) {
        translateY.value = withTiming(clamp(translateY.value, minY, maxYBound), { duration: 220 });
      } else if (Math.abs(e.velocityY) > 150) {
        const targetY = clamp(translateY.value + e.velocityY * 0.18, minY, maxYBound);
        translateY.value = withTiming(targetY, { duration: 280 });
      }

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
        MAP_PAN_ZOOM_LIMITS.doubleTapScale,
        {
          scale: MAP_PAN_ZOOM_LIMITS.defaultScale,
          translateX: defaultTx.value,
          translateY: defaultTy.value,
        },
      );

      const duration = reducedMotion ? 0 : 250;
      if (duration > 0) {
        scale.value = withTiming(nextTransform.scale, { duration });
        translateX.value = withTiming(nextTransform.translateX, { duration });
        translateY.value = withTiming(nextTransform.translateY, { duration });
      } else {
        scale.value = nextTransform.scale;
        translateX.value = nextTransform.translateX;
        translateY.value = nextTransform.translateY;
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
          const def = computeDefaultMapTransform(width, height, network, { keepouts });
          defaultTx.value = def.translateX;
          defaultTy.value = def.translateY;
          if (!hasInitializedCameraRef.current) {
            hasInitializedCameraRef.current = true;
            scale.value = def.scale;
            savedScale.value = def.scale;
            translateX.value = def.translateX;
            savedTranslateX.value = def.translateX;
            translateY.value = def.translateY;
            savedTranslateY.value = def.translateY;
          }
          updateZoomState(def);
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
  colors: import("@/theme/tokens").ThemeLineColors,
): string {
  switch (kind) {
    case "suspension":
      return colors.suspension;
    case "planned-closure":
      return colors.planned;
    case "reduced-speed-zone":
      return colors.rsz ?? "#f59e0b";
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
