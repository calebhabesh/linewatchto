/**
 * Gesture motion shared by every System Map camera: wheel zoom (mouse-wheel
 * notches ease towards their target scale; trackpad scrolls and pinches apply
 * directly) and momentum after a drag release. It owns no camera state: the
 * map's host reads and writes its camera, and commits once a gesture settles,
 * so nothing renders React while the map moves (docs/refactor-plan/09).
 *
 * A notch eases with a short CSS transform transition to its target, not with
 * per-frame writes: the compositor then scales the stage's existing raster,
 * while script-driven scale changes every frame made Chromium re-raster
 * GO/UP's large stage and overflow tile memory (about 60 warnings per zoom
 * burst against 0). Momentum only translates, so it writes every frame.
 */
import {
  mapPointFromViewportPoint,
  transformForMapPointAtViewportPoint,
  type PanZoomPoint,
  type PanZoomTransform,
} from "../../hooks/panZoomMath.ts";

export type WheelGestureKind = "notch" | "scroll" | "pinch";

export type MapWheelInput = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
};

/** One 100-pixel notch zooms by 1.1, in or out. */
export const WHEEL_ZOOM_RATE = Math.log(1.1) / 100;
/** Chrome reports a trackpad pinch as ctrl-wheel deltas of 100 × ln(1 / scale). */
export const PINCH_WHEEL_ZOOM_RATE = 1 / 100;
/** A wheel gesture keeps its first kind until this much quiet. */
export const WHEEL_GESTURE_QUIET_MS = 200;
/** The camera commits this long after the last wheel event, once any ease has landed. */
export const WHEEL_COMMIT_DELAY_MS = 100;
/** Each notch eases to its target over this long. */
export const WHEEL_EASE_MS = 180;
export const WHEEL_EASE_CURVE = "cubic-bezier(0.25, 1, 0.5, 1)";
const WHEEL_LINE_PIXELS = 40;
const WHEEL_PAGE_PIXELS = 800;
const WHEEL_MAX_EVENT_PIXELS = 500;
const WHEEL_NOTCH_MIN_PIXELS = 50;
/** Firefox on macOS reports mouse-wheel notches in multiples of this. */
const FIREFOX_MAC_NOTCH_PIXELS = 4.000244140625;

/* Drag momentum is MapLibre's pan inertia (maplibre-gl 6.11 handler_inertia.ts,
 * the Map View's defaults), so both views glide alike. Owner, 2026-11-02: the
 * earlier speed × 200 ms glide (200 px for a 1 px/ms release) was far faster
 * than the Map View (60 px). The velocity is measured over the last 60 ms up to
 * the release, so a drag held still before release slows to no glide. */
/** Pointer samples older than this at release are ignored. */
export const MOMENTUM_BUFFER_CUTOFF_MS = 160;
/** The window the release velocity is measured over. */
export const MOMENTUM_VELOCITY_WINDOW_MS = 60;
const MOMENTUM_LINEARITY = 0.3;
/** Pixels per second squared. */
const MOMENTUM_DECELERATION = 2500;
/** Glide start speed cap, pixels per second (after linearity). */
export const MOMENTUM_MAX_GLIDE_SPEED = 1400;
/** Logical pixels per millisecond. Slower releases place the map without a
 * glide (a few pixels at most), so a following press is never swallowed by
 * stopping one. Not in MapLibre. */
export const MOMENTUM_MIN_SPEED = 0.25;
const FALLBACK_FRAME_MS = 16;

export function wheelPixelDelta(input: Pick<MapWheelInput, "deltaY" | "deltaMode">): number {
  const pixels = input.deltaMode === 1
    ? input.deltaY * WHEEL_LINE_PIXELS
    : input.deltaMode === 2
      ? input.deltaY * WHEEL_PAGE_PIXELS
      : input.deltaY;
  return Math.max(-WHEEL_MAX_EVENT_PIXELS, Math.min(WHEEL_MAX_EVENT_PIXELS, pixels));
}

/** Kind of a wheel event taken alone; `MapCameraMotion` keeps a gesture's first kind. */
export function classifyWheelInput(input: MapWheelInput): WheelGestureKind {
  if (input.ctrlKey) return "pinch";
  if (input.deltaMode !== 0) return "notch";
  const magnitude = Math.abs(input.deltaY);
  if (input.deltaX === 0 && Number.isInteger(magnitude) && magnitude >= WHEEL_NOTCH_MIN_PIXELS) {
    return "notch";
  }
  if (magnitude > 0 && magnitude % FIREFOX_MAC_NOTCH_PIXELS === 0) return "notch";
  return "scroll";
}

/** Scale factor for one wheel event. Kinds differ only in easing, except a pinch's rate. */
export function wheelZoomFactor(kind: WheelGestureKind, pixelDelta: number): number {
  const rate = kind === "pinch" ? PINCH_WHEEL_ZOOM_RATE : WHEEL_ZOOM_RATE;
  return Math.exp(-pixelDelta * rate);
}

type PointerSample = { x: number; y: number; time: number };

/**
 * Release velocity of a drag, in logical pixels per millisecond, or null for no
 * fling. Like MapLibre: samples within the velocity window before the release
 * (never fewer than the last two still in the buffer), measured up to the
 * release time.
 */
export function releaseVelocity(samples: readonly PointerSample[], releaseTime: number): PanZoomPoint | null {
  const recent = samples.filter((sample) => releaseTime - sample.time <= MOMENTUM_BUFFER_CUTOFF_MS);
  if (recent.length < 2) return null;
  const windowStart = releaseTime - MOMENTUM_VELOCITY_WINDOW_MS;
  let first = recent.length - 2;
  while (first > 0 && recent[first - 1].time >= windowStart) first--;
  const earliest = recent[first];
  const latest = recent[recent.length - 1];
  const elapsed = releaseTime - earliest.time;
  if (elapsed <= 0) return null;
  const vx = (latest.x - earliest.x) / elapsed;
  const vy = (latest.y - earliest.y) / elapsed;
  if (Math.hypot(vx, vy) < MOMENTUM_MIN_SPEED) return null;
  return { x: vx, y: vy };
}

/** MapLibre's inertia ease, `bezier(0, 0, 0.3, 1)`: progress (0–1) at time fraction `x`. */
export function glideEase(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // x(t) = 0.9(1-t)t² + t³, y(t) = 3(1-t)t² + t³; both rise monotonically on [0, 1].
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2;
    if (0.9 * (1 - t) * t * t + t * t * t < x) lo = t; else hi = t;
  }
  const t = (lo + hi) / 2;
  return 3 * (1 - t) * t * t + t * t * t;
}

/** The glide a release velocity starts: its direction, total distance (px) and duration (ms). */
export function glidePlan(velocity: PanZoomPoint): { distance: PanZoomPoint; durationMs: number } {
  const releaseSpeed = Math.hypot(velocity.x, velocity.y) * 1000;
  if (releaseSpeed === 0) return { distance: { x: 0, y: 0 }, durationMs: 0 };
  const speed = Math.min(releaseSpeed * MOMENTUM_LINEARITY, MOMENTUM_MAX_GLIDE_SPEED);
  const durationS = speed / (MOMENTUM_DECELERATION * MOMENTUM_LINEARITY);
  const amount = speed * (durationS / 2);
  return {
    distance: { x: (velocity.x / Math.hypot(velocity.x, velocity.y)) * amount, y: (velocity.y / Math.hypot(velocity.x, velocity.y)) * amount },
    durationMs: durationS * 1000,
  };
}

export type MapCameraMotionHost = {
  /** The camera as last written. */
  readCamera: () => PanZoomTransform;
  /** Writes the stage transform (and the chooser follower); no React state. */
  writeCamera: (camera: PanZoomTransform) => void;
  /** Sets the stage's transform transition (and the follower's): an ease of `ms`, or none for 0. */
  setCameraEase: (ms: number) => void;
  clampScale: (scale: number) => number;
  /** Mouse-wheel notches ease; otherwise each notch applies at once. */
  easeWheelZoom: () => boolean;
  /** A drag release glides. */
  momentum: () => boolean;
  /** First wheel event of a zoom: interrupt flights, set zoom mode, drop the transform transition. */
  onZoomStart: () => void;
  /** The zoom has settled: commit the camera and leave zoom mode. */
  onZoomEnd: () => void;
  /** A glide has stopped or was stopped: commit the camera and end the gesture. */
  onGlideEnd: () => void;
};

type FrameScheduler = {
  request: (callback: (time: number) => void) => number;
  cancel: (handle: number) => void;
  setTimer: (callback: () => void, delayMs: number) => number;
  clearTimer: (handle: number) => void;
};

const browserScheduler: FrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
  setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimer: (handle) => window.clearTimeout(handle),
};

type ZoomSession = {
  kind: WheelGestureKind;
  lastEventTime: number;
  /** Time the last notch's ease lands. */
  easeUntil: number;
};

type Glide = {
  start: PanZoomPoint;
  distance: PanZoomPoint;
  durationMs: number;
  scale: number;
  elapsed: number;
};

export class MapCameraMotion {
  private readonly host: MapCameraMotionHost;
  private readonly scheduler: FrameScheduler;
  private zoom: ZoomSession | null = null;
  private glide: Glide | null = null;
  private samples: PointerSample[] = [];
  private frame: number | null = null;
  private lastFrameTime: number | null = null;
  private commitTimer: number | null = null;
  /** The transition last set on the host, or null when unknown. */
  private ease: number | null = null;

  constructor(host: MapCameraMotionHost, scheduler: FrameScheduler = browserScheduler) {
    this.host = host;
    this.scheduler = scheduler;
  }

  isZooming(): boolean {
    return this.zoom !== null;
  }

  isGliding(): boolean {
    return this.glide !== null;
  }

  /** One wheel event at a logical viewport point. Returns false when it changes nothing. */
  wheel(input: MapWheelInput, viewportPoint: PanZoomPoint, time: number): boolean {
    const pixelDelta = wheelPixelDelta(input);
    if (pixelDelta === 0) return false;
    this.stopGlide();

    let session = this.zoom;
    if (!session) {
      this.host.onZoomStart();
      this.ease = null;
      session = { kind: classifyWheelInput(input), lastEventTime: time, easeUntil: time };
      this.zoom = session;
    } else if (input.ctrlKey) {
      session.kind = "pinch";
    } else if (time - session.lastEventTime > WHEEL_GESTURE_QUIET_MS) {
      session.kind = classifyWheelInput(input);
    }
    session.lastEventTime = time;

    // Zoom around the map point under the pointer on the target camera, so
    // successive notches compound and a moved pointer re-anchors.
    const camera = this.host.readCamera();
    const anchor = mapPointFromViewportPoint(camera, viewportPoint);
    const scale = this.host.clampScale(camera.scale * wheelZoomFactor(session.kind, pixelDelta));
    // A scroll or pinch while a notch is still easing eases too, rather than
    // jumping from the eased frame to its own target.
    const eases = this.host.easeWheelZoom() && (session.kind === "notch" || time < session.easeUntil);
    this.setEase(eases ? WHEEL_EASE_MS : 0);
    this.host.writeCamera(transformForMapPointAtViewportPoint(anchor, viewportPoint, scale));
    if (eases) session.easeUntil = time + WHEEL_EASE_MS;

    if (this.commitTimer !== null) this.scheduler.clearTimer(this.commitTimer);
    this.commitTimer = this.scheduler.setTimer(() => {
      this.commitTimer = null;
      if (this.zoom) this.finishZoom();
    }, Math.max(WHEEL_COMMIT_DELAY_MS, session.easeUntil - time));
    return true;
  }

  /** Records a drag position (logical viewport point) for release velocity. */
  trackPointer(point: PanZoomPoint, time: number) {
    this.samples.push({ x: point.x, y: point.y, time });
    const cutoff = time - MOMENTUM_BUFFER_CUTOFF_MS;
    while (this.samples.length > 2 && this.samples[0].time < cutoff) this.samples.shift();
  }

  resetPointerTrack() {
    this.samples = [];
  }

  /** A drag ended. Starts a glide and returns true when the pointer was still moving. */
  release(time: number): boolean {
    const velocity = this.host.momentum() ? releaseVelocity(this.samples, time) : null;
    this.samples = [];
    if (!velocity) return false;
    const camera = this.host.readCamera();
    const { distance, durationMs } = glidePlan(velocity);
    this.setEase(0);
    this.glide = {
      start: { x: camera.x, y: camera.y },
      distance,
      durationMs,
      scale: camera.scale,
      elapsed: 0,
    };
    this.requestFrame();
    return true;
  }

  /** Stops a glide where it is drawn and commits it. Returns whether one was running. */
  stopGlide(): boolean {
    if (!this.glide) return false;
    this.glide = null;
    this.cancelFrameIfIdle();
    this.host.onGlideEnd();
    return true;
  }

  /** Ends a zoom and commits it; an ease in flight lands on its target. */
  stopZoom() {
    if (!this.zoom) return;
    this.finishZoom();
  }

  stop() {
    this.stopGlide();
    this.stopZoom();
  }

  /** Drops all motion without committing (unmount). */
  dispose() {
    this.zoom = null;
    this.glide = null;
    this.ease = null;
    this.samples = [];
    if (this.frame !== null) this.scheduler.cancel(this.frame);
    this.frame = null;
    this.lastFrameTime = null;
    if (this.commitTimer !== null) this.scheduler.clearTimer(this.commitTimer);
    this.commitTimer = null;
  }

  private setEase(ms: number) {
    if (this.ease === ms) return;
    this.ease = ms;
    this.host.setCameraEase(ms);
  }

  private finishZoom() {
    this.zoom = null;
    this.ease = null;
    if (this.commitTimer !== null) this.scheduler.clearTimer(this.commitTimer);
    this.commitTimer = null;
    this.cancelFrameIfIdle();
    this.host.onZoomEnd();
  }

  private requestFrame() {
    if (this.frame !== null) return;
    this.frame = this.scheduler.request((time) => this.step(time));
  }

  private cancelFrameIfIdle() {
    if (this.glide) return;
    if (this.frame !== null) this.scheduler.cancel(this.frame);
    this.frame = null;
    this.lastFrameTime = null;
  }

  private step(time: number) {
    this.frame = null;
    const elapsed = this.lastFrameTime === null ? FALLBACK_FRAME_MS : Math.min(64, time - this.lastFrameTime);
    this.lastFrameTime = time;
    const glide = this.glide;
    if (!glide) {
      this.lastFrameTime = null;
      return;
    }
    glide.elapsed += elapsed;
    const progress = glideEase(glide.elapsed / glide.durationMs);
    this.host.writeCamera({
      x: glide.start.x + glide.distance.x * progress,
      y: glide.start.y + glide.distance.y * progress,
      scale: glide.scale,
    });
    if (glide.elapsed >= glide.durationMs) {
      this.stopGlide();
      this.lastFrameTime = null;
    } else {
      this.requestFrame();
    }
  }
}
