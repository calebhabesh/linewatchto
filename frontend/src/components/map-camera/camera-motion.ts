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

/** A glide travels its release speed × this, then stops: about 200 px for a
 * 1 px/ms release, at most 300 px. Owner tuning, 2026-10-30: 325 ms and
 * 2.5 px/ms glided too far and too fast; this is closer to Google Maps. */
export const MOMENTUM_TIME_CONSTANT_MS = 200;
export const MOMENTUM_SAMPLE_WINDOW_MS = 160;
/** A release with no movement in this window is a stop, not a fling. Busy
 * phones and test browsers deliver moves 60–70 ms apart. */
export const MOMENTUM_RELEASE_IDLE_MS = 100;
/** Logical pixels per millisecond. */
export const MOMENTUM_MIN_SPEED = 0.25;
export const MOMENTUM_MAX_SPEED = 1.5;
const MOMENTUM_STOP_SPEED = 0.02;
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

/** Release velocity of a drag, in logical pixels per millisecond, or null for no fling. */
export function releaseVelocity(samples: readonly PointerSample[], releaseTime: number): PanZoomPoint | null {
  const latest = samples.at(-1);
  if (!latest || releaseTime - latest.time > MOMENTUM_RELEASE_IDLE_MS) return null;
  const windowStart = latest.time - MOMENTUM_SAMPLE_WINDOW_MS;
  const earliest = samples.find((sample) => sample.time >= windowStart) ?? latest;
  const elapsed = latest.time - earliest.time;
  if (elapsed <= 0) return null;
  let vx = (latest.x - earliest.x) / elapsed;
  let vy = (latest.y - earliest.y) / elapsed;
  const speed = Math.hypot(vx, vy);
  if (speed < MOMENTUM_MIN_SPEED) return null;
  if (speed > MOMENTUM_MAX_SPEED) {
    vx *= MOMENTUM_MAX_SPEED / speed;
    vy *= MOMENTUM_MAX_SPEED / speed;
  }
  return { x: vx, y: vy };
}

/** Distance a glide covers in `elapsedMs` at `velocity`, decaying with the momentum time constant. */
export function glideDisplacement(velocity: number, elapsedMs: number): number {
  return velocity * MOMENTUM_TIME_CONSTANT_MS * (1 - Math.exp(-elapsedMs / MOMENTUM_TIME_CONSTANT_MS));
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
  velocity: PanZoomPoint;
  position: PanZoomPoint;
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
    const cutoff = time - MOMENTUM_SAMPLE_WINDOW_MS * 2;
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
    this.setEase(0);
    this.glide = {
      velocity,
      position: { x: camera.x, y: camera.y },
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
    const before = glide.elapsed;
    glide.elapsed += elapsed;
    const dx = glideDisplacement(glide.velocity.x, glide.elapsed) - glideDisplacement(glide.velocity.x, before);
    const dy = glideDisplacement(glide.velocity.y, glide.elapsed) - glideDisplacement(glide.velocity.y, before);
    glide.position = { x: glide.position.x + dx, y: glide.position.y + dy };
    this.host.writeCamera({ ...glide.position, scale: glide.scale });
    const speed = Math.hypot(glide.velocity.x, glide.velocity.y)
      * Math.exp(-glide.elapsed / MOMENTUM_TIME_CONSTANT_MS);
    if (speed < MOMENTUM_STOP_SPEED) {
      this.stopGlide();
      this.lastFrameTime = null;
    } else {
      this.requestFrame();
    }
  }
}
