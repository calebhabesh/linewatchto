/*
 * The one tap path for every System Map. The map's viewport resolves what a
 * press is on when it starts and acts when the pointer is released; targets
 * only carry identity (`data-map-impact-*`, `data-station-id`,
 * `data-station-label-id`) and select nothing themselves. Selecting at release
 * rather than on the synthesized click matters: a camera commit or the details
 * panel opening between press and click can drop that click, and Android can
 * retarget it to a different station name. The click that follows a handled
 * release is consumed before any child sees it. A press that moved the camera,
 * stopped a glide or became a pinch selects nothing (the camera's
 * `shouldSuppressMapClick`). Keyboard and assistive-technology activation
 * (Enter or Space, or a click with no pointer) select the focused target.
 */
import {
  useCallback,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { ImpactSelection } from "../../app/linewatch-data";
import { mapStationAlertAtClientPoint } from "./map-hover-controller";
import { mapImpactIdentityOf } from "./overlay-hover";
import { mapStationIdAt } from "./station-hover";

export type MapTapTarget =
  | { type: "impact"; selection: NonNullable<ImpactSelection> }
  | { type: "station"; id: string };

/** Elements that handle their own presses: a release over one never clears the selection. */
const MAP_CONTROL_SELECTOR = ".overlap-indicator, button, [role='button'], [data-map-chooser-keepout]";
/** The overlap badges and the chooser apply their own drag guard to clicks. */
const MAP_CHOOSER_SELECTOR = "[data-overlap-chooser], .overlap-indicator-group";

/**
 * What a press at a point selects. On an alert, it is the alert the hover
 * outline shows: the topmost station alert ring under the point, preferring any
 * alert other than the selected one (drawn on top), else the alert pressed.
 */
export function mapTapTargetAt(
  root: ParentNode,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
): MapTapTarget | null {
  if (!(target instanceof Element)) return null;
  const impact = target.closest<SVGElement>("[data-map-impact-kind]");
  if (impact) {
    const hit = mapStationAlertAtClientPoint(root, clientX, clientY) ?? mapImpactIdentityOf(impact);
    if (hit) return { type: "impact", selection: { kind: hit.kind, id: hit.id } };
  }
  const stationId = mapStationIdAt(target);
  return stationId ? { type: "station", id: stationId } : null;
}

/** The focused target's selection, for keyboard and assistive-technology activation. */
function mapKeyboardTargetOf(target: EventTarget | null): MapTapTarget | null {
  const impact = mapImpactIdentityOf(target);
  if (impact) return { type: "impact", selection: { kind: impact.kind, id: impact.id } };
  const stationId = mapStationIdAt(target);
  return stationId ? { type: "station", id: stationId } : null;
}

type ViewportPointerHandler = (event: PointerEvent<HTMLDivElement>) => void;

export type MapTapOptions = {
  /** The shared camera's gesture handlers and flags (hooks/usePanZoom.ts). */
  camera: {
    handlePointerDown: ViewportPointerHandler;
    handlePointerMove: ViewportPointerHandler;
    handlePointerUp: ViewportPointerHandler;
    handlePointerCancel: ViewportPointerHandler;
    activePointerCount: () => number;
    shouldSuppressMapClick: () => boolean;
  };
  onSelectStationId: (stationId: string | null) => void;
  onSelectImpact: (selection: ImpactSelection) => void;
  /** Runs first on every press, before the camera sees it (the map ends its pointer hover). */
  onPress?: ViewportPointerHandler;
};

/** The viewport handlers for the shared tap path. */
export function useMapTaps({ camera, onSelectStationId, onSelectImpact, onPress }: MapTapOptions) {
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    activePointerCount,
    shouldSuppressMapClick,
  } = camera;
  const pressRef = useRef<MapTapTarget | null>(null);
  const consumeClickRef = useRef(false);
  const consumeClickTimerRef = useRef<number | null>(null);

  const setConsumeClick = useCallback((consume: boolean) => {
    consumeClickRef.current = consume;
    if (consumeClickTimerRef.current !== null) window.clearTimeout(consumeClickTimerRef.current);
    consumeClickTimerRef.current = consume
      ? window.setTimeout(() => {
        consumeClickRef.current = false;
        consumeClickTimerRef.current = null;
      }, 450)
      : null;
  }, []);

  const select = useCallback((target: MapTapTarget) => {
    if (target.type === "station") onSelectStationId(target.id);
    else onSelectImpact(target.selection);
  }, [onSelectImpact, onSelectStationId]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    onPress?.(event);
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const firstPointer = activePointerCount() === 0;
    if (firstPointer) setConsumeClick(false);
    handlePointerDown(event);
    pressRef.current = null;
    // A second finger, or a press that stops a glide, selects nothing.
    if (!firstPointer || shouldSuppressMapClick()) return;
    pressRef.current = mapTapTargetAt(event.currentTarget, event.target, event.clientX, event.clientY);
  }, [activePointerCount, handlePointerDown, onPress, setConsumeClick, shouldSuppressMapClick]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    handlePointerMove(event);
    if (shouldSuppressMapClick()) pressRef.current = null;
  }, [handlePointerMove, shouldSuppressMapClick]);

  const finishPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    // A release whose press the map never saw (a badge keeps its own presses).
    if (activePointerCount() === 0) return;
    if (event.type === "pointercancel") handlePointerCancel(event);
    else handlePointerUp(event);
    if (activePointerCount() > 0) return;
    const pressed = pressRef.current;
    pressRef.current = null;
    if (event.type !== "pointerup" || shouldSuppressMapClick()) return;
    if (pressed) {
      setConsumeClick(true);
      select(pressed);
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(`${MAP_CONTROL_SELECTOR}, [data-map-impact-kind], [data-station-id], [data-station-label-id]`)) return;
    // A tap on open map clears the selection.
    onSelectImpact(null);
    onSelectStationId(null);
  }, [activePointerCount, handlePointerCancel, handlePointerUp, onSelectImpact, onSelectStationId, select, setConsumeClick, shouldSuppressMapClick]);

  const onClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest(MAP_CHOOSER_SELECTOR)) return;
    // The click after a handled release, or after a drag, never reaches a child.
    if (event.detail === 0 || (!consumeClickRef.current && !shouldSuppressMapClick())) return;
    setConsumeClick(false);
    event.stopPropagation();
  }, [setConsumeClick, shouldSuppressMapClick]);

  const onClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    // Pointer clicks were handled at release; a click with no pointer is
    // assistive technology activating the focused target.
    if (event.detail !== 0) return;
    const target = mapKeyboardTargetOf(event.target);
    if (target) select(target);
  }, [select]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = mapKeyboardTargetOf(event.target);
    if (!target) return;
    event.preventDefault();
    select(target);
  }, [select]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: finishPointer,
    onPointerCancel: finishPointer,
    onClickCapture,
    onClick,
    onKeyDown,
  };
}
