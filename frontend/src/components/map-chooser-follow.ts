/**
 * Map chooser follow
 *
 * Keeps the "Choose Alert" card attached to its badge while the map camera
 * moves. Placement (`overlap-chooser-placement.ts`) only runs while the camera
 * is at rest. Between placements the card is translated by exactly how far its
 * badge moved. That is a compositor-only transform write, with no layout and
 * no React render, so the card stays glued to the map during a drag instead of
 * staying behind or jumping between candidate spots.
 *
 * The map's camera writer feeds every transform and transition it writes to
 * the stage into `writeCamera`/`setCameraTransition`, so eased camera moves are
 * mirrored with the same timing. When a new placement lands, `place` glides
 * the card from wherever it was showing to the new spot.
 */

import type { MapViewportOrientation } from "../hooks/panZoomMath.ts";

export type ChooserFollowCamera = { x: number; y: number; scale: number };
export type ChooserFollowPoint = { x: number; y: number };

/**
 * Where the badge was when the card's layout was solved, in logical viewport
 * pixels. Diagram maps also record the camera of that measurement, so later
 * camera writes can project the badge without touching the DOM.
 */
export type ChooserFollowAnchor = {
  badge: ChooserFollowPoint;
  camera?: ChooserFollowCamera;
};

export const CHOOSER_GLIDE_MS = 180;
const CHOOSER_GLIDE_EASING = "cubic-bezier(0.2, 0, 0, 1)";
// Smaller corrections than this are not worth an animation.
const CHOOSER_GLIDE_MIN_DISTANCE = 0.5;

/** A point measured under camera `from`, projected to where it is under camera `to`. */
export function projectPointToCamera(
  point: ChooserFollowPoint,
  from: ChooserFollowCamera,
  to: ChooserFollowCamera,
): ChooserFollowPoint {
  const ratio = from.scale > 0 ? to.scale / from.scale : 1;
  return {
    x: to.x + (point.x - from.x) * ratio,
    y: to.y + (point.y - from.y) * ratio,
  };
}

/** True when the badge centre is on screen, so a fresh placement can sit beside it. */
export function chooserBadgeInView(
  badge: ChooserFollowPoint,
  viewportSize: { width: number; height: number },
): boolean {
  return badge.x >= 0 && badge.y >= 0 && badge.x <= viewportSize.width && badge.y <= viewportSize.height;
}

/** A logical offset as a CSS offset of the card's portal, which is rotated with the map. */
export function physicalChooserOffset(
  offset: ChooserFollowPoint,
  orientation: MapViewportOrientation,
): ChooserFollowPoint {
  return orientation === "rotated-landscape" ? { x: -offset.y, y: offset.x } : offset;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function chooserFollowTransform(
  offset: ChooserFollowPoint,
  orientation: MapViewportOrientation,
): string {
  const translate = `translate3d(${round(offset.x)}px, ${round(offset.y)}px, 0px)`;
  return orientation === "rotated-landscape" ? `${translate} rotate(90deg)` : translate;
}

export type ChooserFollowElement = {
  style: { transform: string; transition: string; translate: string };
};

export type ChooserFollowEnvironment = {
  /**
   * The element's rendered offset for one property, including any running
   * transition: the translation of `transform`, or the `translate` property.
   */
  readOffset: (element: ChooserFollowElement, property: "transform" | "translate") => ChooserFollowPoint | null;
  /** Commits pending style so the next write starts a transition from it. */
  flushStyle: (element: ChooserFollowElement) => void;
};

function parseTranslate(value: string): ChooserFollowPoint {
  if (!value || value === "none") return { x: 0, y: 0 };
  const [x = "0", y = "0"] = value.trim().split(/\s+/);
  return { x: Number.parseFloat(x) || 0, y: Number.parseFloat(y) || 0 };
}

const browserEnvironment: ChooserFollowEnvironment = {
  readOffset: (element, property) => {
    if (typeof window === "undefined" || !(element instanceof Element)) return null;
    const style = window.getComputedStyle(element);
    if (property === "translate") return parseTranslate(style.translate);
    if (!style.transform || style.transform === "none") return { x: 0, y: 0 };
    const matrix = new DOMMatrixReadOnly(style.transform);
    return { x: matrix.m41, y: matrix.m42 };
  },
  flushStyle: (element) => {
    if (typeof window === "undefined" || !(element instanceof Element)) return;
    void window.getComputedStyle(element).transform;
  },
};

const add = (first: ChooserFollowPoint, second: ChooserFollowPoint) => ({
  x: first.x + second.x,
  y: first.y + second.y,
});
const subtract = (first: ChooserFollowPoint, second: ChooserFollowPoint) => ({
  x: first.x - second.x,
  y: first.y - second.y,
});
const samePoint = (first: ChooserFollowPoint, second: ChooserFollowPoint) =>
  Math.abs(first.x - second.x) < 0.01 && Math.abs(first.y - second.y) < 0.01;
const ZERO = { x: 0, y: 0 };
const GLIDE_TRANSITION = `translate ${CHOOSER_GLIDE_MS}ms ${CHOOSER_GLIDE_EASING}`;

/**
 * The card's portal carries two independent offsets:
 * - `transform` follows the badge. It receives the same writes and the same
 *   transition as the map's camera stage, so the two stay in lockstep through
 *   eases, retargets, and interruptions without any bookkeeping here.
 * - `translate` holds a glide toward a new placement, with its own
 *   transition, so camera moves never cut a glide short.
 */
export class MapChooserFollower {
  private readonly env: ChooserFollowEnvironment;
  private element: ChooserFollowElement | null = null;
  private orientation: MapViewportOrientation = "standard";
  private anchor: ChooserFollowAnchor | null = null;
  /** Physical left/top of the placed layout. */
  private box: ChooserFollowPoint | null = null;
  /** The badge's movement since placement, as a physical offset. */
  private follow: ChooserFollowPoint = ZERO;
  /** What remains of a glide, as a physical offset. */
  private glide: ChooserFollowPoint = ZERO;
  private camera: ChooserFollowCamera | null = null;
  private cameraTransition = "none";

  constructor(env: ChooserFollowEnvironment = browserEnvironment) {
    this.env = env;
  }

  /** Ref callback for the card's portal element. */
  readonly attach = (element: ChooserFollowElement | null) => {
    this.element = element;
    this.anchor = null;
    this.box = null;
    this.follow = ZERO;
    this.glide = ZERO;
    if (element) this.write(true);
  };

  /** Mirrors the transition the map just set on its camera stage. */
  setCameraTransition(transition: string) {
    this.cameraTransition = transition || "none";
    if (this.element) this.element.style.transition = this.transitionValue(false);
  }

  /** Mirrors a camera transform the map just wrote to its stage. */
  writeCamera(camera: ChooserFollowCamera) {
    this.camera = { x: camera.x, y: camera.y, scale: camera.scale };
    if (!this.anchor?.camera) return;
    this.setFollow(this.offsetForCurrentCamera());
  }

  /** Follows a badge whose live screen position the map reports directly. */
  followPoint(point: ChooserFollowPoint) {
    const anchor = this.anchor;
    if (!anchor) return;
    this.setFollow(subtract(point, anchor.badge));
  }

  /**
   * A new layout was committed at `box` (physical left/top), solved for the
   * badge at `anchor`. Call from a layout effect, before paint.
   */
  place(
    box: ChooserFollowPoint,
    anchor: ChooserFollowAnchor,
    orientation: MapViewportOrientation,
    reducedMotion: boolean,
  ) {
    const previousVisual = this.box && this.orientation === orientation
      ? add(add(this.box, this.visual("transform")), this.visual("translate"))
      : null;
    this.orientation = orientation;
    this.anchor = anchor;
    this.box = { x: box.x, y: box.y };
    // Any remaining camera ease lands with the follow already at its target;
    // the glide below covers the difference from where the card was showing.
    this.follow = physicalChooserOffset(this.offsetForCurrentCamera(), orientation);

    const start = previousVisual ? subtract(subtract(previousVisual, box), this.follow) : ZERO;
    if (reducedMotion || Math.hypot(start.x, start.y) < CHOOSER_GLIDE_MIN_DISTANCE) {
      this.glide = ZERO;
      this.write(true);
      return;
    }
    this.glide = start;
    this.write(true);
    this.glide = ZERO;
    this.write(false);
  }

  private offsetForCurrentCamera(): ChooserFollowPoint {
    const anchor = this.anchor;
    if (!anchor?.camera || !this.camera) return ZERO;
    return subtract(projectPointToCamera(anchor.badge, anchor.camera, this.camera), anchor.badge);
  }

  private setFollow(logicalOffset: ChooserFollowPoint) {
    const next = physicalChooserOffset(logicalOffset, this.orientation);
    if (samePoint(next, this.follow)) return;
    this.follow = next;
    const element = this.element;
    if (element) element.style.transform = this.transformValue();
  }

  /**
   * Where one offset is showing. Transitions can start frames late on a busy
   * main thread, so a clock cannot tell whether one is still running; read it.
   */
  private visual(property: "transform" | "translate"): ChooserFollowPoint {
    const target = property === "transform" ? this.follow : this.glide;
    if (!this.element) return target;
    return this.env.readOffset(this.element, property) ?? target;
  }

  private transitionValue(instant: boolean): string {
    const camera = this.cameraTransition === "none" || instant ? "transform 0s" : this.cameraTransition;
    return `${camera}, ${instant ? "translate 0s" : GLIDE_TRANSITION}`;
  }

  private transformValue(): string {
    return chooserFollowTransform(this.follow, this.orientation);
  }

  private write(instant: boolean) {
    const element = this.element;
    if (!element) return;
    element.style.transition = this.transitionValue(instant);
    element.style.transform = this.transformValue();
    element.style.translate = `${round(this.glide.x)}px ${round(this.glide.y)}px`;
    if (instant) {
      this.env.flushStyle(element);
      element.style.transition = this.transitionValue(false);
    }
  }
}
