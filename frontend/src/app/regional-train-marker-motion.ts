/**
 * Moves GO/UP estimated train markers along their authored corridor paths
 * between snapshots. Shared by both System Map renderers: the SVG renderer
 * writes each frame to an SVG group, the MapLibre renderer to a GeoJSON point.
 */
import type { NetworkSegment } from "./linewatch-data.ts";
import type { PreparedMapGeometry } from "./map-geometry-data.ts";
import {
  regionalTrainMarkerFrame,
  type RegionalTrainMarkerFrame,
} from "./regional-map-geometry.ts";
import {
  createEstimatedTrainMarkerTransition,
  estimatedTrainMarkerMotionWaypoints,
  estimatedTrainMarkerObservationKey,
  estimatedTrainMarkerRenderKey,
  sampleEstimatedTrainMarkerMotion,
  scheduleEstimatedTrainMarkerAnimation,
  type EstimatedTrainMarker,
} from "./train-markers.ts";

export type RegionalTrainMarkerMotionRuntime = {
  marker: EstimatedTrainMarker;
  frame: RegionalTrainMarkerFrame;
  targetObservationKey: string;
  cancelAnimation: (() => void) | null;
};

/** Receives each drawn frame: where the marker is, how opaque, and which observation it shows. */
export type RegionalTrainMarkerSink = (
  frame: RegionalTrainMarkerFrame,
  opacity: number,
  marker: EstimatedTrainMarker,
) => void;

export function cancelRegionalTrainMarkerMotion(runtime: RegionalTrainMarkerMotionRuntime | undefined) {
  runtime?.cancelAnimation?.();
  if (runtime) runtime.cancelAnimation = null;
}

function regionalTrainMarkerMotionFrame(
  sample: ReturnType<typeof sampleEstimatedTrainMarkerMotion>,
  segmentById: Map<string, NetworkSegment>,
  geometry: PreparedMapGeometry,
): { marker: EstimatedTrainMarker; frame: RegionalTrainMarkerFrame } | null {
  if (sample.from.segmentId === sample.to.segmentId
    && sample.from.fromStationId === sample.to.fromStationId
    && sample.from.toStationId === sample.to.toStationId) {
    const marker = {
      ...sample.to,
      progress: sample.from.progress + (sample.to.progress - sample.from.progress) * sample.progress,
    };
    const segment = segmentById.get(marker.segmentId);
    const frame = segment ? regionalTrainMarkerFrame(geometry, segment, marker) : null;
    return frame ? { marker, frame } : null;
  }
  // Never interpolate coordinates between paths: that draws a chord through
  // empty map space. Invalid samples hold an authored-path endpoint instead.
  const marker = sample.progress < 1 ? sample.from : sample.to;
  const segment = segmentById.get(marker.segmentId);
  const frame = segment ? regionalTrainMarkerFrame(geometry, segment, marker) : null;
  return frame ? { marker, frame } : null;
}

/**
 * Places `marker`, or animates it from where its runtime last drew it.
 * Returns false when the marker's segment path can't be resolved (it is not
 * drawn).
 */
export function animateRegionalTrainMarker(
  sink: RegionalTrainMarkerSink,
  marker: EstimatedTrainMarker,
  segments: NetworkSegment[],
  geometry: PreparedMapGeometry,
  runtimes: Map<string, RegionalTrainMarkerMotionRuntime>,
  animate: boolean,
): boolean {
  const markerKey = estimatedTrainMarkerRenderKey(marker);
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const targetSegment = segmentById.get(marker.segmentId);
  const targetFrame = targetSegment
    ? regionalTrainMarkerFrame(geometry, targetSegment, marker)
    : null;
  if (!targetFrame) return false;

  const current = runtimes.get(markerKey);
  const targetObservationKey = estimatedTrainMarkerObservationKey(marker);
  if (current?.targetObservationKey === targetObservationKey && animate) return true;
  cancelRegionalTrainMarkerMotion(current);
  if (!current || !animate) {
    sink(targetFrame, 1, marker);
    runtimes.set(markerKey, {
      marker,
      frame: targetFrame,
      targetObservationKey,
      cancelAnimation: null,
    });
    return true;
  }

  const waypoints = estimatedTrainMarkerMotionWaypoints(current.marker, marker, segments);
  const settledMarker = waypoints.at(-1) ?? current.marker;
  const settledSegment = segmentById.get(settledMarker.segmentId);
  const settledFrame = settledSegment
    ? regionalTrainMarkerFrame(geometry, settledSegment, settledMarker) ?? current.frame
    : current.frame;
  const transition = createEstimatedTrainMarkerTransition(waypoints);
  const runtime: RegionalTrainMarkerMotionRuntime = {
    ...current,
    targetObservationKey,
    cancelAnimation: null,
  };
  runtimes.set(markerKey, runtime);

  let previousSample: ReturnType<typeof sampleEstimatedTrainMarkerMotion> | null = null;
  let previousMotion: ReturnType<typeof regionalTrainMarkerMotionFrame> = null;

  const settle = () => {
    runtime.marker = settledMarker;
    runtime.frame = settledFrame;
    runtime.cancelAnimation = null;
    sink(settledFrame, 1, settledMarker);
  };
  const update = (now: number) => {
    const { sample, opacity, done } = transition(now);
    const motion = sample === previousSample ? previousMotion : regionalTrainMarkerMotionFrame(sample, segmentById, geometry);
    previousSample = sample;
    previousMotion = motion;
    if (!motion || done) {
      settle();
      return false;
    }
    sink(motion.frame, opacity, motion.marker);
    runtime.marker = motion.marker;
    runtime.frame = motion.frame;
    return true;
  };
  if (update(performance.now())) {
    runtime.cancelAnimation = scheduleEstimatedTrainMarkerAnimation(update);
  }
  return true;
}
