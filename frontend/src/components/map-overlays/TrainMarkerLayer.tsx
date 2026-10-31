"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import type { NetworkSegment } from "../../app/linewatch-data";
import type { MapPoint } from "../../app/map-geometry";
import {
  createEstimatedTrainMarkerTransition,
  estimatedTrainMarkerMotionWaypoints,
  estimatedTrainMarkerObservationKey,
  estimatedTrainMarkerRenderKey,
  sampleEstimatedTrainMarkerMotion,
  scheduleEstimatedTrainMarkerAnimation,
  TRAIN_MARKER_ARROW_PATH,
  TRAIN_MARKER_BODY_PATH,
  TRAIN_MARKER_WINDOWS,
  type EstimatedTrainMarker,
} from "../../app/train-markers";

/*
 * Every System Map's estimated train markers: schematic placements along the
 * map's segments, never live positions. Each marker glides from where it was
 * drawn to its next estimate (app/train-markers.ts); the map says where a
 * marker sits on its artwork (`MapTrainMarkerPlacement`).
 */

/** Where a marker sits on the map, and which way it points (degrees). */
export type MapTrainMarkerFrame = { point: MapPoint; angle: number };

/** How a map places its train markers on its artwork. */
export type MapTrainMarkerPlacement = {
  /** The marker on its segment's drawn path; null when the path can't be resolved (not drawn). */
  frame: (marker: EstimatedTrainMarker, segmentById: ReadonlyMap<string, NetworkSegment>) => MapTrainMarkerFrame | null;
  /** The way the marker travels along its drawn path, for `data-train-marker-travel-direction`. */
  travelDirection: (marker: EstimatedTrainMarker, segmentById: ReadonlyMap<string, NetworkSegment>) => string;
  /** The marker's accessible title. */
  label: (marker: EstimatedTrainMarker) => string;
  /** How much larger than TTC's this map draws its markers. */
  scale: number;
};

type MotionRuntime = {
  marker: EstimatedTrainMarker;
  frame: MapTrainMarkerFrame;
  targetObservationKey: string;
  cancelAnimation: (() => void) | null;
};

export const MapTrainMarkerLayer = memo(function MapTrainMarkerLayer({
  enabled,
  markers,
  segments,
  placement,
  animate,
}: {
  enabled: boolean;
  markers: EstimatedTrainMarker[];
  /** The map's segments with their drawn paths; markers move along them. */
  segments: NetworkSegment[];
  placement: MapTrainMarkerPlacement;
  animate: boolean;
}) {
  const segmentById = useMemo(() => new Map(segments.map((segment) => [segment.id, segment])), [segments]);
  if (!enabled) return null;
  const drawn = markers.filter((marker) => placement.frame(marker, segmentById));
  if (drawn.length === 0) return null;
  return (
    <>
      {drawn.map((marker) => (
        <AnimatedTrainMarker
          key={estimatedTrainMarkerRenderKey(marker)}
          marker={marker}
          segments={segments}
          segmentById={segmentById}
          placement={placement}
          animate={animate}
        />
      ))}
    </>
  );
});

function AnimatedTrainMarker({
  marker,
  segments,
  segmentById,
  placement,
  animate,
}: {
  marker: EstimatedTrainMarker;
  segments: NetworkSegment[];
  segmentById: ReadonlyMap<string, NetworkSegment>;
  placement: MapTrainMarkerPlacement;
  animate: boolean;
}) {
  const groupRef = useRef<SVGGElement>(null);
  const motionRef = useRef<MotionRuntime | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    const targetFrame = placement.frame(marker, segmentById);
    if (!group || !targetFrame) return;
    const draw = (frame: MapTrainMarkerFrame, shown: EstimatedTrainMarker, opacity: number) => {
      group.style.opacity = String(opacity);
      group.setAttribute(
        "transform",
        `translate(${frame.point.x} ${frame.point.y}) rotate(${frame.angle})${placement.scale === 1 ? "" : ` scale(${placement.scale})`}`,
      );
      group.dataset.trainMarkerId = shown.id;
      group.dataset.trainMarkerDirection = shown.direction;
      group.dataset.trainMarkerSegmentId = shown.segmentId;
      group.dataset.trainMarkerTravelDirection = placement.travelDirection(shown, segmentById);
    };
    const current = motionRef.current;
    const targetObservationKey = estimatedTrainMarkerObservationKey(marker);
    if (current?.targetObservationKey === targetObservationKey && animate) return;
    current?.cancelAnimation?.();
    if (!current || !animate) {
      draw(targetFrame, marker, 1);
      motionRef.current = { marker, frame: targetFrame, targetObservationKey, cancelAnimation: null };
      return;
    }

    const waypoints = estimatedTrainMarkerMotionWaypoints(current.marker, marker, segments);
    const settledMarker = waypoints.at(-1) ?? current.marker;
    const settledFrame = placement.frame(settledMarker, segmentById) ?? current.frame;
    const transition = createEstimatedTrainMarkerTransition(waypoints);
    const runtime: MotionRuntime = { ...current, targetObservationKey, cancelAnimation: null };
    motionRef.current = runtime;

    let previousSample: ReturnType<typeof sampleEstimatedTrainMarkerMotion> | null = null;
    let previousMotion: ReturnType<typeof motionFrame> = null;
    const settle = () => {
      draw(settledFrame, settledMarker, 1);
      runtime.marker = settledMarker;
      runtime.frame = settledFrame;
      runtime.cancelAnimation = null;
    };
    const update = (now: number) => {
      const { sample, opacity, done } = transition(now);
      const motion = sample === previousSample ? previousMotion : motionFrame(sample, segmentById, placement);
      previousSample = sample;
      previousMotion = motion;
      if (!motion || done) {
        settle();
        return false;
      }
      draw(motion.frame, motion.marker, opacity);
      runtime.marker = motion.marker;
      runtime.frame = motion.frame;
      return true;
    };
    if (update(performance.now())) {
      runtime.cancelAnimation = scheduleEstimatedTrainMarkerAnimation(update);
    }
    return () => {
      runtime.cancelAnimation?.();
      runtime.cancelAnimation = null;
    };
  }, [animate, marker, placement, segmentById, segments]);

  return (
    <g
      ref={groupRef}
      className={`estimated-train-marker estimated-train-marker-${marker.lineId}`}
      data-marker-key={estimatedTrainMarkerRenderKey(marker)}
      data-train-marker-id={marker.id}
      data-train-marker-line-id={marker.lineId}
      data-train-marker-direction={marker.direction}
      data-train-marker-segment-id={marker.segmentId}
      data-train-marker-travel-direction={placement.travelDirection(marker, segmentById)}
      pointerEvents="none"
    >
      <title>{placement.label(marker)}</title>
      <path className="estimated-train-marker-shadow" d={TRAIN_MARKER_BODY_PATH} />
      <path className="estimated-train-marker-shadow estimated-train-marker-shadow-mid" d={TRAIN_MARKER_BODY_PATH} />
      <path className="estimated-train-marker-shadow estimated-train-marker-shadow-near" d={TRAIN_MARKER_BODY_PATH} />
      <path className="estimated-train-marker-outline" d={TRAIN_MARKER_BODY_PATH} />
      <path className="estimated-train-marker-core" d={TRAIN_MARKER_BODY_PATH} />
      {TRAIN_MARKER_WINDOWS.map((window) => (
        <rect key={window.x} className="estimated-train-marker-window" {...window} />
      ))}
      <path className="estimated-train-marker-arrow" d={TRAIN_MARKER_ARROW_PATH} />
    </g>
  );
}

/**
 * A motion sample on the map. Motion plans hold only same-path legs; never
 * interpolate between paths (that draws a chord through empty map space), so
 * an invalid cross-path sample holds an endpoint on its path instead.
 */
function motionFrame(
  sample: ReturnType<typeof sampleEstimatedTrainMarkerMotion>,
  segmentById: ReadonlyMap<string, NetworkSegment>,
  placement: MapTrainMarkerPlacement,
): { marker: EstimatedTrainMarker; frame: MapTrainMarkerFrame } | null {
  const samePath = sample.from.segmentId === sample.to.segmentId
    && sample.from.fromStationId === sample.to.fromStationId
    && sample.from.toStationId === sample.to.toStationId;
  const marker = samePath
    ? { ...sample.to, progress: sample.from.progress + (sample.to.progress - sample.from.progress) * sample.progress }
    : sample.progress < 1 ? sample.from : sample.to;
  const frame = placement.frame(marker, segmentById);
  return frame ? { marker, frame } : null;
}
