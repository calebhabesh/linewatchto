/**
 * How the Map View's camera moves to a selection: a station, stop, route or
 * alert, surface or rail, all the same way.
 *
 * MapLibre's flight clock starts when the flight is asked for, so a flight asked
 * for inside React's commit loses the commit's time to its first drawn frame and
 * visibly jumps. A flight therefore starts two frames later: the first frame
 * paints the commit, and the flight's first frame is the one after.
 *
 * Its length follows how far the view changes, so a nearby hop and a cross-city
 * one both read as a move. MapLibre's own speed gives 0.4 s to over 2 s.
 */
import type { LngLatLike, Map as MapLibreMap, PaddingOptions } from "maplibre-gl";

type Padding = { top: number; bottom: number; left: number; right: number };

const SHORTEST_FLIGHT_MS = 700;
const LONGEST_FLIGHT_MS = 1400;
const FLIGHT_MS_PER_STEP = 250;
/** MapLibre's default is 1.42; less of a zoom-out means fewer tile levels on the way. */
const FLIGHT_CURVE = 1.2;

/**
 * The flight's length for a move of `screens` view diagonals at the current
 * zoom and `zoomDelta` levels. Distance counts by doubling, since a flight
 * zooms out for a long one.
 */
export function selectionFlightDuration(screens: number, zoomDelta: number): number {
  const steps = Math.log2(1 + Math.max(0, screens)) + Math.abs(zoomDelta) / 2;
  return Math.min(LONGEST_FLIGHT_MS, Math.round(SHORTEST_FLIGHT_MS + FLIGHT_MS_PER_STEP * steps));
}

/** Starts and stops at rest, with less of a peak in the middle than a cubic. */
export function selectionFlightEasing(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Options for a flight to this camera, for `flyTo` or `fitBounds`. */
export function selectionFlightMotion(map: MapLibreMap, center: LngLatLike | undefined, zoom: number | undefined) {
  const canvas = map.getCanvas();
  const diagonal = Math.max(1, Math.hypot(canvas.clientWidth, canvas.clientHeight));
  const from = map.project(map.getCenter());
  const to = center === undefined ? from : map.project(center);
  return {
    duration: selectionFlightDuration(Math.hypot(to.x - from.x, to.y - from.y) / diagonal, zoom === undefined ? 0 : zoom - map.getZoom()),
    curve: FLIGHT_CURVE,
    easing: selectionFlightEasing,
    essential: true,
  };
}

/**
 * `fitBounds` adds its padding to the camera's own (a phone stop or station
 * flight leaves the sheet's there); this is the part that does not cover.
 */
export function paddingBeyondHeld(wanted: Padding, held: PaddingOptions): Padding {
  return {
    top: Math.max(0, wanted.top - (held.top ?? 0)),
    bottom: Math.max(0, wanted.bottom - (held.bottom ?? 0)),
    left: Math.max(0, wanted.left - (held.left ?? 0)),
    right: Math.max(0, wanted.right - (held.right ?? 0)),
  };
}

/** Frames these bounds with a selection flight, or at once for reduced motion. */
export function fitSelectionBounds(
  map: MapLibreMap,
  bounds: [[number, number], [number, number]],
  options: { padding: Padding; maxZoom: number; reducedMotion: boolean },
): void {
  const fit = { padding: paddingBeyondHeld(options.padding, map.getPadding()), maxZoom: options.maxZoom };
  if (options.reducedMotion) {
    map.fitBounds(bounds, { ...fit, animate: false });
    return;
  }
  // Undefined when the padding leaves no room: fitBounds then does nothing either.
  const camera = map.cameraForBounds(bounds, fit);
  map.fitBounds(bounds, { ...fit, ...selectionFlightMotion(map, camera?.center, camera?.zoom) });
}

type FlightOwner = "surface" | "rail" | "station";

type FrameScheduler = {
  request: (callback: () => void) => number;
  cancel: (id: number) => void;
};

/**
 * The one flight waiting to start. A later one replaces it, so a commit that
 * frames twice flies once. Waiting counts as moving: the selection flash and
 * anything polling the camera wait for it.
 */
export function createDeferredSelectionFlight(
  frames: FrameScheduler = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  },
) {
  let frameId: number | null = null;
  let owner: FlightOwner | null = null;
  return {
    get pending() {
      return owner !== null;
    },
    /** `start` runs two frames from now; `pending` holds through it, so what it stops is not taken for its end. */
    schedule(nextOwner: FlightOwner, start: () => void) {
      if (frameId !== null) frames.cancel(frameId);
      owner = nextOwner;
      frameId = frames.request(() => {
        frameId = frames.request(() => {
          frameId = null;
          try {
            start();
          } finally {
            owner = null;
          }
        });
      });
    },
    /** Drops the waiting flight if it is this owner's, or with no owner named, whoever's. */
    cancel(onlyOwner?: FlightOwner) {
      if (onlyOwner && owner !== onlyOwner) return;
      if (frameId !== null) frames.cancel(frameId);
      frameId = null;
      owner = null;
    },
  };
}
