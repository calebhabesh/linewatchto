import type { MapImpactKind } from "../../app/linewatch-data.ts";
import {
  clearMapImpactHover,
  mapImpactIdentityOf,
  setMapImpactHovered,
  type MapImpactHoverIdentity,
} from "./overlay-hover.ts";
import type { MapOverlayPlane } from "./overlay-plane.ts";
import { renderMapPreviewOutline } from "./preview-outline.ts";

type ImpactIdentity = { kind: MapImpactKind; id: string };

const impactKey = (identity: ImpactIdentity) => `${identity.kind}:${identity.id}`;
const sameImpact = (a: ImpactIdentity | null, b: ImpactIdentity | null) => (
  a?.kind === b?.kind && a?.id === b?.id
);

/**
 * The station alert whose ring is under a point. Another alert's ring is
 * offered before the selected one, which is drawn on top.
 */
export function mapStationAlertAtClientPoint(root: ParentNode, clientX: number, clientY: number): ImpactIdentity | null {
  const rings = [...root.querySelectorAll<SVGGeometryElement>(
    ".map-station-alert:not(.map-layer-exiting) .station-impact-ring",
  )].reverse();
  let selectedHit: ImpactIdentity | null = null;
  for (const ring of rings) {
    const screenMatrix = ring.getScreenCTM?.();
    const svg = ring.ownerSVGElement;
    if (!screenMatrix || !svg || typeof ring.isPointInStroke !== "function") continue;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    if (!ring.isPointInStroke(point.matrixTransform(screenMatrix.inverse()))) continue;
    const hit = mapImpactIdentityOf(ring);
    if (!hit || !ring.classList.contains("selected")) return hit;
    selectedHit ??= hit;
  }
  return selectedHit;
}

/**
 * The topmost line alert target under a point, even beneath a station target
 * (the most severe first, matching paint order).
 */
export function mapLineAlertAtClientPoint(root: Element, clientX: number, clientY: number): ImpactIdentity | null {
  const elements = root.ownerDocument.elementsFromPoint?.(clientX, clientY) ?? [];
  const target = elements.find((element) => (
    element.classList.contains("map-segment-hit-target") && root.contains(element)
  ));
  return target ? mapImpactIdentityOf(target) : null;
}

/**
 * The alert a pointer at this point hovers: a station alert's ring first,
 * else a line alert, which stays hovered while a station drawn on top of it
 * is crossed.
 */
export function mapHoverTargetAtClientPoint(root: Element, clientX: number, clientY: number): ImpactIdentity | null {
  return mapStationAlertAtClientPoint(root, clientX, clientY) ?? mapLineAlertAtClientPoint(root, clientX, clientY);
}

export type MapHoverControllerOptions = {
  /** The layer group previews draw their outline into. */
  previewOutlineLayer: () => SVGGElement | null;
  /** True while a drag or pinch moves the map; hover waits for it to end. */
  isPointerGestureActive?: () => boolean;
};

/** Hover, focus and preview state for one map's alert overlays. */
export interface MapHoverController {
  /** The overlay plane and each alert's line paths, for group outlines. */
  setOutlineSource(plane: MapOverlayPlane | null, pathsByImpact: Map<string, string[]>): void;
  /** A hovered chooser row raises its alert as a map hover would; null ends it. */
  setChooserHover(impact: ImpactIdentity | null): void;
  /**
   * Group previews (an open chooser with no row hovered, a hovered or focused
   * badge) outline the union of their alerts and light their station rings,
   * without raising any artwork.
   */
  setGroupPreview(impacts: ImpactIdentity[], previewed: boolean): void;
  /** Reapplies hover to overlay nodes that have just mounted. */
  restore(): void;
  /** Ends every hover (the map was pressed or scrolled). */
  clear(): void;
  dispose(): void;
}

/**
 * Both maps' hover: one alert hovered on the map, by pointer or keyboard
 * focus, or as a chooser row, is raised above the others with its outline.
 * Hover state is written straight to the DOM (`setMapImpactHovered`), so it
 * shows before the next paint without rendering the map, and survives the
 * map's own re-renders. See map-renderer-parity.md, rule 8.
 */
export function installMapHoverController(root: HTMLElement, options: MapHoverControllerOptions): MapHoverController {
  let pointerImpact: ImpactIdentity | null = null;
  let focusImpact: ImpactIdentity | null = null;
  let chooserImpact: ImpactIdentity | null = null;
  const previewed = new Set<string>();
  let plane: MapOverlayPlane | null = null;
  let pathsByImpact = new Map<string, string[]>();

  const mapImpact = () => pointerImpact ?? focusImpact;

  // Raises an alert while any owner holds it; a group preview alone only
  // lights its station rings.
  const apply = (impact: ImpactIdentity) => {
    const owner: MapImpactHoverIdentity | null = sameImpact(chooserImpact, impact)
      ? { ...impact, activationKey: `chooser:${impactKey(impact)}` }
      : sameImpact(mapImpact(), impact)
        ? { ...impact, activationKey: `map:${impactKey(impact)}` }
        : null;
    setMapImpactHovered(root, owner ?? impact, Boolean(owner));
    if (!owner && previewed.has(impactKey(impact))) {
      setMapImpactHovered(root, impact, true, "station-rings");
    }
  };

  const renderOutline = () => {
    const layer = options.previewOutlineLayer();
    if (!layer) return;
    if (!plane) {
      layer.querySelectorAll(".map-impact-preview-outline").forEach((outline) => outline.remove());
      return;
    }
    renderMapPreviewOutline(layer, [...previewed].sort(), pathsByImpact, plane);
  };

  const setMapOwners = (nextPointer: ImpactIdentity | null, nextFocus: ImpactIdentity | null) => {
    const previous = mapImpact();
    pointerImpact = nextPointer;
    focusImpact = nextFocus;
    const next = mapImpact();
    if (sameImpact(previous, next)) return;
    if (previous) apply(previous);
    if (next) apply(next);
  };

  const finePointer = () => (
    typeof window === "undefined" || window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );

  const handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || options.isPointerGestureActive?.()) return;
    const target = event.target instanceof Element ? event.target : null;
    const onMap = target && root.contains(target) && !target.closest(".overlap-indicator, [data-overlap-chooser]");
    setMapOwners(onMap ? mapHoverTargetAtClientPoint(root, event.clientX, event.clientY) : null, focusImpact);
  };

  const hoverTargetOf = (target: EventTarget | null) => {
    if (!(target instanceof Element) || target.closest(".overlap-indicator, [data-overlap-chooser]")) return null;
    return mapImpactIdentityOf(target);
  };
  const handleFocusIn = (event: FocusEvent) => {
    if (!finePointer()) return;
    setMapOwners(pointerImpact, hoverTargetOf(event.target));
  };
  const handleFocusOut = (event: FocusEvent) => {
    if (!root.contains(event.relatedTarget as Node | null)) setMapOwners(pointerImpact, null);
  };
  const handlePress = () => setMapOwners(null, focusImpact);

  root.ownerDocument.addEventListener("pointermove", handlePointerMove);
  root.addEventListener("focusin", handleFocusIn);
  root.addEventListener("focusout", handleFocusOut);
  root.addEventListener("pointerdown", handlePress);
  root.addEventListener("wheel", handlePress, { passive: true });

  const restore = () => {
    renderOutline();
    for (const key of previewed) {
      const separator = key.indexOf(":");
      apply({ kind: key.slice(0, separator) as MapImpactKind, id: key.slice(separator + 1) });
    }
    for (const owner of [mapImpact(), chooserImpact]) {
      if (owner) apply(owner);
    }
  };

  return {
    setOutlineSource(nextPlane, nextPaths) {
      plane = nextPlane;
      pathsByImpact = nextPaths;
      renderOutline();
    },
    setChooserHover(impact) {
      const previous = chooserImpact;
      chooserImpact = impact ? { kind: impact.kind, id: impact.id } : null;
      if (previous) apply(previous);
      if (chooserImpact) apply(chooserImpact);
    },
    setGroupPreview(impacts, isPreviewed) {
      for (const impact of impacts) {
        if (isPreviewed) previewed.add(impactKey(impact));
        else previewed.delete(impactKey(impact));
        apply(impact);
      }
      renderOutline();
    },
    restore,
    clear() {
      pointerImpact = null;
      focusImpact = null;
      chooserImpact = null;
      previewed.clear();
      clearMapImpactHover(root);
      renderOutline();
    },
    dispose() {
      root.ownerDocument.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("focusin", handleFocusIn);
      root.removeEventListener("focusout", handleFocusOut);
      root.removeEventListener("pointerdown", handlePress);
      root.removeEventListener("wheel", handlePress);
      previewed.clear();
      renderOutline();
    },
  };
}
