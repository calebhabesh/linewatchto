/**
 * Selection framing, keyboard focus reveal, desktop insets and the toolbar's
 * camera commands, shared by every System Map. Each map passes its camera
 * (`usePanZoom`) and its selection; nothing here differs per map.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { measureDesktopMapInsets, readDesktopLeftOcclusion } from "../../app/desktop-sidebar-state";
import {
  selectedMapElements,
  type MapSelectionState,
} from "../../app/map-selection-framing";
import {
  FOCUS_REVEAL_DURATION_MS,
  focusRevealSafeArea,
  focusRevealTranslation,
  logicalBoxFromClientRect,
  shouldRevealFocusedMapTarget,
  type MapEdgeInsets,
} from "../../app/map-focus-reveal";
import {
  readCommutePreviewInset,
  readMobileImpactInspectorInset,
  readMobileImpactInspectorTop,
  readMobilePillBottom,
  readMobileStationSubmenuTop,
} from "../../hooks/mobileMapFrame";
import {
  clampPanZoomScale,
  computeBoundedMapFrame,
  computeInsetViewportFocus,
  type MapViewportOrientation,
  type PanZoomTransform,
} from "../../hooks/panZoomMath";
export { mapFocusTargetKey } from "../../app/map-selection-framing";
import { MOBILE_VIEWPORT_QUERY } from "../../hooks/useMobilePerformanceMode";
import type { usePanZoom } from "../../hooks/usePanZoom";

/** Top inset assumed on desktop before the toolbar has been measured. */
const DESKTOP_TOP_INSET_FALLBACK = 76;
/** A selection frames at this share of the scale that would just fit it. */
export const SELECTION_FIT_COMFORT_RATIO = 0.82;
/** A commute preview frames looser still, leaving room for its route label. */
const COMMUTE_PREVIEW_COMFORT_RATIO = 0.82;
/** Zoom on a selected station, relative to the fitted scale. */
const SELECTED_STATION_ZOOM = { mobile: 3.8, desktop: 1.8 } as const;
/** A rotated-landscape map frames a selection a third of the way down. */
const ROTATED_FOCUS_Y_RATIO = 0.34;
/** Framing retries while the selected overlay mounts: 12 × 50 ms. */
const FOCUS_RETRY_LIMIT = 12;
const FOCUS_RETRY_MS = 50;
/** A layout reset waits for the panels' own transition before recentring. */
const LAYOUT_RESET_DELAY_MS = 320;

export type DesktopMapInsets = { top: number; bottom: number };

function initialDesktopMapInsets(): DesktopMapInsets {
  if (typeof window === "undefined" || window.innerWidth < 768) return { top: 0, bottom: 0 };
  const insets = measureDesktopMapInsets(
    document.querySelector<HTMLElement>(".network-map-transition-surface"),
    document.querySelector<HTMLElement>(".desktop-map-control-rail"),
  );
  return { top: insets.top || DESKTOP_TOP_INSET_FALLBACK, bottom: insets.bottom };
}

/**
 * The desktop toolbar's and legend's reach into the map viewport, kept current
 * as they resize. Call it before `usePanZoom`, whose default frame uses it.
 */
export function useDesktopMapInsets(
  viewportRef: RefObject<HTMLElement | null>,
  railRef: RefObject<HTMLElement | null>,
  chromeVisible: boolean,
): DesktopMapInsets {
  const [insets, setInsets] = useState(initialDesktopMapInsets);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const surface = viewport.closest<HTMLElement>(".network-map-transition-surface");
    const rail = railRef.current
      ?? viewport.closest(".linewatch-shell")?.querySelector<HTMLElement>(".desktop-map-control-rail")
      ?? null;
    const measure = () => {
      const next = measureDesktopMapInsets(viewport, rail);
      setInsets((current) => (
        current.top === next.top && current.bottom === next.bottom ? current : next
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (surface) observer.observe(surface);
    if (rail) observer.observe(rail);
    const legend = document.querySelector<HTMLElement>(".desktop-map-legend");
    if (legend) observer.observe(legend);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [chromeVisible, railRef, viewportRef]);
  return insets;
}

/**
 * Logical-viewport edges covered by the pill, sheets, toolbar, legend,
 * sidebar, or a commute preview. Selection framing and keyboard focus keep
 * clear of them.
 */
export function readMapOccludedInsets(
  viewport: HTMLElement,
  logicalHeight: number,
  isMobile: boolean,
  desktopInsets: DesktopMapInsets,
  { selection, selectedStationId, commutePathPreview }: MapSelectionState,
) {
  const focusPadding = isMobile ? 24 : 40;
  const topPillBottom = isMobile ? readMobilePillBottom(viewport) : 0;
  const mobileStationTop = isMobile && selectedStationId
    ? readMobileStationSubmenuTop(viewport, logicalHeight)
    : logicalHeight;
  const mobileImpactTop = isMobile && selection
    ? readMobileImpactInspectorTop(viewport, logicalHeight)
    : logicalHeight;
  const insets: MapEdgeInsets = {
    left: focusPadding,
    right: focusPadding,
    top: isMobile
      ? Math.max(focusPadding, topPillBottom)
      : Math.max(desktopInsets.top + 16, focusPadding),
    bottom: isMobile
      ? Math.max(focusPadding, logicalHeight - (selectedStationId ? mobileStationTop : mobileImpactTop))
      : Math.max(desktopInsets.bottom, focusPadding, readMobileImpactInspectorInset(viewport) + focusPadding),
  };
  if (commutePathPreview && !selection && !selectedStationId) {
    insets.bottom = Math.max(insets.bottom, readCommutePreviewInset(viewport));
  }
  if (!isMobile) {
    insets.left = Math.max(insets.left, readDesktopLeftOcclusion(viewport, 24));
  }
  return { insets, topPillBottom, mobileStationTop };
}

type Box = { x: number; y: number; width: number; height: number };

function logicalBoxes(elements: Element[], viewportRect: DOMRect, orientation: MapViewportOrientation): Box[] {
  return elements.flatMap((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return [];
    return [orientation === "rotated-landscape"
      ? {
          x: rect.top - viewportRect.top,
          y: viewportRect.width - (rect.right - viewportRect.left),
          width: rect.height,
          height: rect.width,
        }
      : {
          x: rect.left - viewportRect.left,
          y: rect.top - viewportRect.top,
          width: rect.width,
          height: rect.height,
        }];
  });
}

type MapCamera = Pick<
  ReturnType<typeof usePanZoom>,
  | "containerRef"
  | "mapRef"
  | "readCamera"
  | "currentRenderedTransform"
  | "logicalViewportSize"
  | "defaultTransformForViewport"
  | "animateTransformTo"
  | "moveToDefaultCamera"
  | "clearCameraAdjustment"
  | "isGestureActive"
  | "recenter"
  | "recenterWithFeedback"
  | "refitIfCameraUntouched"
  | "zoomIn"
  | "zoomOut"
>;

type MapFramingOptions = MapSelectionState & {
  camera: MapCamera;
  /** The camera and the map's drawn content are ready to frame. */
  ready: boolean;
  /** Changes when content that framing measures appears (geometry, rasters). */
  contentKey: string;
  /** From `mapFocusTargetKey`. */
  focusTargetKey: string | null;
  desktopInsets: DesktopMapInsets;
  viewportOrientation: MapViewportOrientation;
  mobilePerformanceMode: boolean;
  preserveCameraOnSelectionClear: boolean;
  cameraCommandsEnabled: boolean;
  layoutResetSignal?: number;
  recenterSignal?: number;
  zoomInSignal?: number;
  zoomOutSignal?: number;
};

/** Runs an edge-triggered toolbar command once per new signal value. */
function useCameraCommand(signal: number | undefined, ready: boolean, enabled: boolean, run: () => void) {
  // A remount must not replay the command the shell still stores.
  const lastSignalRef = useRef(signal);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    if (signal === undefined || signal === lastSignalRef.current || !ready) return;
    lastSignalRef.current = signal;
    if (enabledRef.current) run();
  }, [ready, run, signal]);
}

export function useMapFraming({
  camera,
  ready,
  contentKey,
  focusTargetKey,
  desktopInsets,
  viewportOrientation,
  mobilePerformanceMode,
  selection,
  selectedStationId,
  commutePathPreview,
  preserveCameraOnSelectionClear,
  cameraCommandsEnabled,
  layoutResetSignal,
  recenterSignal,
  zoomInSignal,
  zoomOutSignal,
}: MapFramingOptions) {
  const {
    containerRef,
    readCamera,
    currentRenderedTransform,
    logicalViewportSize,
    defaultTransformForViewport,
    animateTransformTo,
    moveToDefaultCamera,
    clearCameraAdjustment,
    isGestureActive,
    recenter,
    recenterWithFeedback,
    refitIfCameraUntouched,
    zoomIn,
    zoomOut,
  } = camera;

  // Desktop toolbar and legend changes reframe an untouched camera.
  useEffect(() => {
    refitIfCameraUntouched();
  }, [desktopInsets.bottom, desktopInsets.top, refitIfCameraUntouched]);

  const readOccludedInsets = useCallback(
    (viewport: HTMLElement, logicalHeight: number, isMobile: boolean) => readMapOccludedInsets(
      viewport,
      logicalHeight,
      isMobile,
      desktopInsets,
      { selection, selectedStationId, commutePathPreview },
    ),
    [commutePathPreview, desktopInsets, selectedStationId, selection],
  );

  /** Frames the drawn selection; false while it has not mounted yet. */
  const focusSelection = useCallback(() => {
    const viewport = containerRef.current;
    if (!viewport) return false;
    const viewportRect = viewport.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0) return false;
    const boxes = logicalBoxes(
      selectedMapElements(viewport, { selection, selectedStationId, commutePathPreview }),
      viewportRect,
      viewportOrientation,
    );
    if (boxes.length === 0) return false;
    const { width: logicalWidth, height: logicalHeight } = logicalViewportSize();
    if (logicalWidth <= 0 || logicalHeight <= 0) return false;

    const current: PanZoomTransform = currentRenderedTransform() ?? readCamera();
    const left = Math.min(...boxes.map((box) => box.x));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const top = Math.min(...boxes.map((box) => box.y));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    const mapX = ((left + right) / 2 - current.x) / current.scale;
    const mapY = ((top + bottom) / 2 - current.y) / current.scale;

    const isMobile = window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
    const fitScale = defaultTransformForViewport(logicalWidth, logicalHeight).scale || 1;
    const stationScale = clampPanZoomScale(
      fitScale * (isMobile ? SELECTED_STATION_ZOOM.mobile : SELECTED_STATION_ZOOM.desktop),
      fitScale,
    );
    const { insets, topPillBottom, mobileStationTop } = readOccludedInsets(viewport, logicalHeight, isMobile);
    const rotated = viewportOrientation === "rotated-landscape";

    let scale: number;
    let focusX: number;
    let focusY: number;
    if (selectedStationId) {
      // A station keeps its zoom and sits above a phone's station sheet.
      scale = stationScale;
      focusX = isMobile ? logicalWidth / 2 : (logicalWidth + insets.left - insets.right) / 2;
      focusY = rotated
        ? logicalHeight * ROTATED_FOCUS_Y_RATIO
        : isMobile ? (topPillBottom + mobileStationTop) / 2 : logicalHeight / 2;
    } else {
      const selectionFit = computeBoundedMapFrame(logicalWidth, logicalHeight, {
        x: (left - current.x) / current.scale,
        y: (top - current.y) / current.scale,
        width: Math.max((right - left) / current.scale, 1),
        height: Math.max((bottom - top) / current.scale, 1),
      }, insets);
      const commuteOnly = Boolean(commutePathPreview && !selection && !selectedStationId);
      scale = Math.min(stationScale, selectionFit.scale * SELECTION_FIT_COMFORT_RATIO)
        * (commuteOnly ? COMMUTE_PREVIEW_COMFORT_RATIO : 1);
      const focus = computeInsetViewportFocus(logicalWidth, logicalHeight, insets);
      focusX = focus.focusX;
      focusY = rotated ? logicalHeight * ROTATED_FOCUS_Y_RATIO : focus.focusY;
    }
    animateTransformTo({ x: focusX - mapX * scale, y: focusY - mapY * scale, scale }, fitScale);
    return true;
  }, [
    animateTransformTo,
    commutePathPreview,
    containerRef,
    currentRenderedTransform,
    defaultTransformForViewport,
    logicalViewportSize,
    readCamera,
    readOccludedInsets,
    selectedStationId,
    selection,
    viewportOrientation,
  ]);

  // Frame each new selection, and again when the layout around it changes.
  const lastFocusedTargetKeyRef = useRef<string | null>(null);
  const lastFocusLayoutKeyRef = useRef("");
  useEffect(() => {
    if (!ready || isGestureActive()) return;
    const layoutKey = [
      layoutResetSignal ?? 0,
      viewportOrientation,
      desktopInsets.top,
      desktopInsets.bottom,
      contentKey,
    ].join(":");

    if (!focusTargetKey) {
      if (lastFocusedTargetKeyRef.current === null) return;
      lastFocusedTargetKeyRef.current = null;
      lastFocusLayoutKeyRef.current = layoutKey;
      if (preserveCameraOnSelectionClear) return;
      // Clearing a selection flies back to the fitted map, which counts as untouched.
      clearCameraAdjustment();
      moveToDefaultCamera(true, false);
      return;
    }
    if (lastFocusedTargetKeyRef.current === focusTargetKey && lastFocusLayoutKeyRef.current === layoutKey) return;

    let retryTimer: number | null = null;
    let attempts = 0;
    const tryFocus = () => {
      if (focusSelection()) {
        lastFocusedTargetKeyRef.current = focusTargetKey;
        lastFocusLayoutKeyRef.current = layoutKey;
      } else if (attempts < FOCUS_RETRY_LIMIT) {
        attempts++;
        retryTimer = window.setTimeout(tryFocus, FOCUS_RETRY_MS);
      }
    };
    // The selected overlay is committed when this runs, so desktop frames at
    // once and no entrance frame slips in between. Phones wait a frame for
    // their inspector, which changes the usable viewport.
    const frame = mobilePerformanceMode ? window.requestAnimationFrame(tryFocus) : null;
    if (frame === null) tryFocus();
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [
    clearCameraAdjustment,
    contentKey,
    desktopInsets.bottom,
    desktopInsets.top,
    focusSelection,
    focusTargetKey,
    isGestureActive,
    layoutResetSignal,
    mobilePerformanceMode,
    moveToDefaultCamera,
    preserveCameraOnSelectionClear,
    ready,
    viewportOrientation,
  ]);

  // A layout reset (panels opening or closing) recentres a map with nothing selected.
  const lastLayoutResetSignalRef = useRef(layoutResetSignal ?? 0);
  useEffect(() => {
    if (!layoutResetSignal || !ready) return;
    if (lastLayoutResetSignalRef.current === layoutResetSignal) return;
    lastLayoutResetSignalRef.current = layoutResetSignal;
    if (focusTargetKey) return;
    const timer = window.setTimeout(() => {
      if (!isGestureActive()) recenter();
    }, LAYOUT_RESET_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [focusTargetKey, isGestureActive, layoutResetSignal, ready, recenter]);

  useCameraCommand(recenterSignal, ready, cameraCommandsEnabled, recenterWithFeedback);
  useCameraCommand(zoomInSignal, ready, cameraCommandsEnabled, zoomIn);
  useCameraCommand(zoomOutSignal, ready, cameraCommandsEnabled, zoomOut);

  /** Pans a keyboard-focused target out from under the panels and controls. */
  const revealFocusedMapTarget = useCallback((target: EventTarget | null) => {
    const viewport = containerRef.current;
    if (!ready || !viewport || !shouldRevealFocusedMapTarget(target, camera.mapRef.current)) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return;
    const isMobile = window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
    const box = logicalBoxFromClientRect(rect, viewport.getBoundingClientRect(), viewportOrientation);
    const { insets } = readOccludedInsets(viewport, height, isMobile);
    const offset = focusRevealTranslation(box, focusRevealSafeArea(width, height, insets));
    if (!offset) return;
    const current = currentRenderedTransform() ?? readCamera();
    animateTransformTo(
      { x: current.x + offset.dx, y: current.y + offset.dy, scale: current.scale },
      undefined,
      true,
      FOCUS_REVEAL_DURATION_MS,
    );
  }, [
    animateTransformTo,
    camera.mapRef,
    containerRef,
    currentRenderedTransform,
    logicalViewportSize,
    readCamera,
    readOccludedInsets,
    ready,
    viewportOrientation,
  ]);

  return { readOccludedInsets, revealFocusedMapTarget };
}
