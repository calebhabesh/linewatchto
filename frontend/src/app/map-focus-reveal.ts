/**
 * Keeps a keyboard-focused map target clear of the panels and controls laid
 * over the map (WCAG 2.4.11, Focus Not Obscured). Every renderer pans by the
 * amount these helpers return when focus lands on a covered or off-screen
 * target.
 */
import type { MapViewportOrientation } from "../hooks/panZoomMath.ts";

type ScreenBox = { left: number; top: number; right: number; bottom: number };

function revealAxis(start: number, end: number, safeStart: number, safeEnd: number): number {
  if (end - start <= safeEnd - safeStart) {
    if (start < safeStart) return start - safeStart;
    if (end > safeEnd) return end - safeEnd;
    return 0;
  }
  // Too long to fit (a corridor at this zoom): leave it if part of it shows,
  // otherwise centre it.
  if (end > safeStart && start < safeEnd) return 0;
  return (start + end) / 2 - (safeStart + safeEnd) / 2;
}

/** How far to pan so `box` sits inside `safe`, per axis. */
function revealPanOffset(box: ScreenBox, safe: ScreenBox): { dx: number; dy: number } {
  return {
    dx: revealAxis(box.left, box.right, safe.left, safe.right),
    dy: revealAxis(box.top, box.bottom, safe.top, safe.bottom),
  };
}

/** Space kept between a revealed target and the covered edges. */
export const FOCUS_REVEAL_MARGIN_PX = 24;

/** Pan duration for a reveal; reduced motion pans instantly. */
export const FOCUS_REVEAL_DURATION_MS = 300;

export type MapEdgeInsets = { left: number; right: number; top: number; bottom: number };

type ClientRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/**
 * A client rect in the map's logical frame, relative to the viewport. A
 * rotated-landscape map turns 90° clockwise, so the axes swap.
 */
export function logicalBoxFromClientRect(
  rect: ClientRect,
  viewportRect: ClientRect,
  orientation: MapViewportOrientation = "standard",
): ScreenBox {
  if (orientation === "rotated-landscape") {
    return {
      left: rect.top - viewportRect.top,
      top: viewportRect.right - rect.right,
      right: rect.bottom - viewportRect.top,
      bottom: viewportRect.right - rect.left,
    };
  }
  return {
    left: rect.left - viewportRect.left,
    top: rect.top - viewportRect.top,
    right: rect.right - viewportRect.left,
    bottom: rect.bottom - viewportRect.top,
  };
}

/**
 * The part of a `width` × `height` viewport left uncovered by `insets`, less
 * the reveal margin.
 */
export function focusRevealSafeArea(
  width: number,
  height: number,
  insets: MapEdgeInsets,
  margin = FOCUS_REVEAL_MARGIN_PX,
): ScreenBox {
  return {
    left: insets.left + margin,
    top: insets.top + margin,
    right: width - insets.right - margin,
    bottom: height - insets.bottom - margin,
  };
}

/**
 * How far to move the camera translation (logical pixels, added to the
 * camera's x and y) so `box` lands inside `safe`. Null when it already does.
 */
export function focusRevealTranslation(box: ScreenBox, safe: ScreenBox): { dx: number; dy: number } | null {
  const { dx, dy } = revealPanOffset(box, safe);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;
  // Panning the view right by dx moves the content left by dx.
  return { dx: dx === 0 ? 0 : -dx, dy: dy === 0 ? 0 : -dy };
}

/**
 * Whether focus on `target` should pan the map: a keyboard focus on a target
 * inside the map's camera layer, outside the alert chooser.
 */
export function shouldRevealFocusedMapTarget(target: EventTarget | null, stage: Element | null): target is Element {
  if (!(target instanceof Element) || !stage?.contains(target)) return false;
  if (target.closest("[data-overlap-chooser]")) return false;
  try {
    return target.matches(":focus-visible");
  } catch {
    return false;
  }
}
