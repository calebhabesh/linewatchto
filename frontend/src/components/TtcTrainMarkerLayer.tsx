import { useLayoutEffect, useMemo, useRef } from "react";
import { visualTravelDirection, type MapPoint } from "../app/map-geometry";
import type { NetworkSegment } from "../app/linewatch-data";
import {
  createEstimatedTrainMarkerTransition,
  estimatedTrainMarkerLanePoint,
  estimatedTrainMarkerMotionWaypoints,
  estimatedTrainMarkerObservationKey,
  estimatedTrainMarkerRenderKey,
  sampleEstimatedTrainMarkerMotion,
  scheduleEstimatedTrainMarkerAnimation,
  TRAIN_MARKER_ARROW_PATH,
  TRAIN_MARKER_BODY_PATH,
  TRAIN_MARKER_WINDOWS,
  type EstimatedTrainMarker,
} from "../app/train-markers";

export function EstimatedTrainMarkerLayer({
  enabled,
  markers,
  segments,
  animate,
}: {
  enabled: boolean;
  markers: EstimatedTrainMarker[];
  segments: NetworkSegment[];
  animate: boolean;
}) {
  const segmentById = useMemo(() => new Map(segments.map((segment) => [segment.id, segment])), [segments]);
  const markerNodes = enabled ? markers
    .filter((marker) => segmentById.get(marker.segmentId)?.pathD)
    .map((marker) => (
      <AnimatedTtcTrainMarker
        key={estimatedTrainMarkerRenderKey(marker)}
        marker={marker}
        segments={segments}
        segmentById={segmentById}
        animate={animate}
      />
    )) : [];

  if (markerNodes.length === 0) return null;

  return (
    <g className="estimated-train-marker-layer" pointerEvents="none">
      {markerNodes}
    </g>
  );
}

function AnimatedTtcTrainMarker({
  marker,
  segments,
  segmentById,
  animate,
}: {
  marker: EstimatedTrainMarker;
  segments: NetworkSegment[];
  segmentById: Map<string, NetworkSegment>;
  animate: boolean;
}) {
  const groupRef = useRef<SVGGElement>(null);
  const pathMetricCacheRef = useRef(new Map<string, TrainMarkerPathMetrics>());
  const motionRef = useRef<TrainMarkerMotionRuntime | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    const targetFrame = ttcTrainMarkerFrame(marker, segmentById, pathMetricCacheRef.current);
    if (!group || !targetFrame) return;
    const current = motionRef.current;
    const targetObservationKey = estimatedTrainMarkerObservationKey(marker);
    if (current?.targetObservationKey === targetObservationKey && animate) return;
    current?.cancelAnimation?.();
    if (!current || !animate) {
      group.style.opacity = "1";
      setTrainMarkerTransform(group, targetFrame);
      motionRef.current = { marker, frame: targetFrame, targetObservationKey, cancelAnimation: null };
      return;
    }

    const waypoints = estimatedTrainMarkerMotionWaypoints(current.marker, marker, segments);
    const settledMarker = waypoints.at(-1) ?? current.marker;
    const settledFrame = ttcTrainMarkerFrame(settledMarker, segmentById, pathMetricCacheRef.current)
      ?? current.frame;
    const transition = createEstimatedTrainMarkerTransition(waypoints);
    const runtime: TrainMarkerMotionRuntime = {
      ...current,
      targetObservationKey,
      cancelAnimation: null,
    };
    motionRef.current = runtime;

    let previousSample: ReturnType<typeof sampleEstimatedTrainMarkerMotion> | null = null;
    let previousMotion: ReturnType<typeof ttcTrainMarkerMotionFrame> = null;

    const update = (now: number) => {
      const { sample, opacity, done } = transition(now);
      group.style.opacity = String(opacity);
      const motion = sample === previousSample ? previousMotion : ttcTrainMarkerMotionFrame(sample, segmentById, pathMetricCacheRef.current);
      previousSample = sample;
      previousMotion = motion;
      if (!motion) {
        group.style.opacity = "1";
        setTrainMarkerTransform(group, settledFrame);
        setTtcTrainMarkerMetadata(group, settledMarker, segmentById);
        runtime.marker = settledMarker;
        runtime.frame = settledFrame;
        runtime.cancelAnimation = null;
        return false;
      }
      setTrainMarkerTransform(group, motion.frame);
      setTtcTrainMarkerMetadata(group, motion.marker, segmentById);
      runtime.marker = motion.marker;
      runtime.frame = motion.frame;
      if (done) {
        runtime.marker = settledMarker;
        runtime.frame = settledFrame;
        runtime.cancelAnimation = null;
        setTrainMarkerTransform(group, settledFrame);
        setTtcTrainMarkerMetadata(group, settledMarker, segmentById);
        return false;
      }
      return true;
    };
    if (update(performance.now())) {
      runtime.cancelAnimation = scheduleEstimatedTrainMarkerAnimation(update);
    }
    return () => {
      runtime.cancelAnimation?.();
      runtime.cancelAnimation = null;
    };
  }, [animate, marker, segmentById, segments]);

  const visualDirection = ttcMarkerVisualDirection(marker, segmentById);
  return (
    <g
      ref={groupRef}
      className={`estimated-train-marker estimated-train-marker-${marker.lineId}`}
      data-train-marker-id={marker.id}
      data-train-marker-line-id={marker.lineId}
      data-train-marker-direction={marker.direction}
      data-train-marker-segment-id={marker.segmentId}
      data-train-marker-travel-direction={visualDirection}
      pointerEvents="none"
    >
      <title>{`${lineLabelForTrainMarker(marker.lineId)} ${marker.direction} estimated train near ${marker.nextStationId}`}</title>
      <TrainMarkerGlyph />
    </g>
  );
}

function TrainMarkerGlyph() {
  return (
    <>
      <path
        className="estimated-train-marker-outline"
        d={TRAIN_MARKER_BODY_PATH}
      />
      <path
        className="estimated-train-marker-core"
        d={TRAIN_MARKER_BODY_PATH}
      />
      {TRAIN_MARKER_WINDOWS.map((window) => (
        <rect key={window.x} className="estimated-train-marker-window" {...window} />
      ))}
      <path className="estimated-train-marker-arrow" d={TRAIN_MARKER_ARROW_PATH} />
    </>
  );
}

type TrainMarkerPathFrame = {
  point: MapPoint;
  angle: number;
};

type TrainMarkerMotionRuntime = {
  marker: EstimatedTrainMarker;
  frame: TrainMarkerPathFrame;
  targetObservationKey: string;
  cancelAnimation: (() => void) | null;
};

type TrainMarkerPathMetrics = {
  path: SVGPathElement;
  length: number;
};

const TTC_TRAIN_MARKER_LANE_OFFSET = 20;

function ttcMarkerVisualDirection(
  marker: EstimatedTrainMarker,
  segmentById: Map<string, NetworkSegment>,
) {
  const segment = segmentById.get(marker.segmentId);
  return segment
    ? visualTravelDirection({ ...segment, travelDirection: marker.travelDirection })
    : marker.travelDirection;
}

function ttcTrainMarkerFrame(
  marker: EstimatedTrainMarker,
  segmentById: Map<string, NetworkSegment>,
  pathMetricCache: Map<string, TrainMarkerPathMetrics>,
) {
  const segment = segmentById.get(marker.segmentId);
  if (!segment?.pathD) return null;
  const visualDirection = ttcMarkerVisualDirection(marker, segmentById);
  const pathProgress = visualDirection === "reverse" ? 1 - marker.progress : marker.progress;
  return pathFrameAtProgress(segment.pathD, pathProgress, visualDirection, pathMetricCache);
}

function ttcTrainMarkerMotionFrame(
  sample: ReturnType<typeof sampleEstimatedTrainMarkerMotion>,
  segmentById: Map<string, NetworkSegment>,
  pathMetricCache: Map<string, TrainMarkerPathMetrics>,
): { marker: EstimatedTrainMarker; frame: TrainMarkerPathFrame } | null {
  if (sample.from.segmentId === sample.to.segmentId
    && sample.from.fromStationId === sample.to.fromStationId
    && sample.from.toStationId === sample.to.toStationId) {
    const marker = {
      ...sample.to,
      progress: sample.from.progress + (sample.to.progress - sample.from.progress) * sample.progress,
    };
    const frame = ttcTrainMarkerFrame(marker, segmentById, pathMetricCache);
    return frame ? { marker, frame } : null;
  }
  // Motion plans deliberately contain only same-path legs. If an invalid
  // cross-path sample reaches this guard, hold the last on-track endpoint.
  const marker = sample.progress < 1 ? sample.from : sample.to;
  const frame = ttcTrainMarkerFrame(marker, segmentById, pathMetricCache);
  return frame ? { marker, frame } : null;
}

function setTrainMarkerTransform(group: SVGGElement, frame: TrainMarkerPathFrame) {
  group.setAttribute(
    "transform",
    `translate(${frame.point.x} ${frame.point.y}) rotate(${frame.angle})`,
  );
}

function setTtcTrainMarkerMetadata(
  group: SVGGElement,
  marker: EstimatedTrainMarker,
  segmentById: Map<string, NetworkSegment>,
) {
  group.dataset.trainMarkerId = marker.id;
  group.dataset.trainMarkerDirection = marker.direction;
  group.dataset.trainMarkerSegmentId = marker.segmentId;
  group.dataset.trainMarkerTravelDirection = ttcMarkerVisualDirection(marker, segmentById);
}

function pathFrameAtProgress(
  pathD: string,
  progress: number,
  visualDirection: "forward" | "reverse" | "bidirectional",
  pathMetricCache?: Map<string, TrainMarkerPathMetrics>,
): TrainMarkerPathFrame | null {
  if (typeof document === "undefined") return null;
  try {
    const metrics = trainMarkerPathMetrics(pathD, pathMetricCache);
    if (!metrics) return null;
    const { path, length } = metrics;
    if (!Number.isFinite(length) || length <= 0) return null;
    const distance = Math.max(0, Math.min(1, progress)) * length;
    const point = path.getPointAtLength(distance);
    const delta = Math.min(12, Math.max(1, length * 0.015));
    const pointAhead = path.getPointAtLength(Math.min(length, distance + delta));
    const pointBehind = path.getPointAtLength(Math.max(0, distance - delta));
    const dx = pointAhead.x - pointBehind.x;
    const dy = pointAhead.y - pointBehind.y;
    const pathAngleRad = Math.atan2(dy, dx);
    const angle = pathAngleRad * (180 / Math.PI);

    return {
      point: estimatedTrainMarkerLanePoint(
        point,
        { x: dx, y: dy },
        visualDirection,
        TTC_TRAIN_MARKER_LANE_OFFSET,
      ),
      angle: visualDirection === "reverse" ? angle + 180 : angle,
    };
  } catch {
    return null;
  }
}

function trainMarkerPathMetrics(
  pathD: string,
  pathMetricCache?: Map<string, TrainMarkerPathMetrics>,
): TrainMarkerPathMetrics | null {
  const cached = pathMetricCache?.get(pathD);
  if (cached) return cached;

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  const length = path.getTotalLength();
  const metrics = { path, length };
  pathMetricCache?.set(pathD, metrics);
  return metrics;
}

function lineLabelForTrainMarker(lineId: string) {
  switch (lineId) {
    case "line-1":
      return "Line 1";
    case "line-2":
      return "Line 2";
    case "line-4":
      return "Line 4";
    case "line-5":
      return "Line 5";
    case "line-6":
      return "Line 6";
    default:
      return "Train";
  }
}
