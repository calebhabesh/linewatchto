import { memo, useMemo, type CSSProperties, type ReactNode } from "react";
import type { ImpactSelection } from "../../app/linewatch-data";
import { samplePath } from "../../app/map-geometry";
import {
  ChevronGlyphLane,
  HourglassGlyphLane,
  PlannedClosureIconLane,
  SuspensionGlyphLane,
  SuspensionNoEntryLane,
} from "./GlyphLanes";
import {
  isSelectedLineAlert,
  lineAlertHoverOutlineGroups,
  lineAlertPaintOrder,
  type MapLineAlert,
} from "./line-alert-model";
import { MAP_HOVER_OUTLINE_WIDTHS, mapOutlineEndConnectors, mapOverlayId, type MapOverlayPlane } from "./overlay-plane";

export type { MapLineAlert, MapOverlayVisualState } from "./line-alert-model";

export const RSZ_IMPACT_COLOR = "#F59E0B";
export const SUSPENSION_COLOR = "#ef4444";
export const DELAY_RAIL_COLOR = "#0ea5e9";
function lineAlertVisualId(plane: MapOverlayPlane, alert: MapLineAlert, suffix = "") {
  return mapOverlayId(plane, "overlay-visual", alert.key + suffix);
}

/** Groups alerts by line, in a fixed line order, keeping paint order within each line. */
function groupByLine(alerts: MapLineAlert[]) {
  const byLine = new Map<string, MapLineAlert[]>();
  for (const alert of lineAlertPaintOrder(alerts)) {
    const lineAlerts = byLine.get(alert.lineId);
    if (lineAlerts) lineAlerts.push(alert);
    else byLine.set(alert.lineId, [alert]);
  }
  return [...byLine].sort(([a], [b]) => a.localeCompare(b));
}

/** Keeps paint order, with the selected alert's tubes moved to the end. */
function selectedLast(alerts: MapLineAlert[], selection: ImpactSelection) {
  return [
    ...alerts.filter((alert) => !isSelectedLineAlert(alert, selection)),
    ...alerts.filter((alert) => isSelectedLineAlert(alert, selection)),
  ];
}

function layerStateClass(exiting?: boolean) {
  return exiting ? "map-layer-exiting" : "map-layer-current";
}

/*
 * Glyph lanes need no clip: every glyph is centred on the alert's path and
 * fits within the rail's half-width, so the round-capped tube already contains
 * it. A clip mask as long as the alert cost GPU memory in proportion to the
 * corridor (most of GO/UP's drawing-layer area at rest) and re-rastered at
 * every zoom step.
 */

/**
 * One alert's tube and glyphs (the resting artwork, never animated). Memoized:
 * a map re-renders on every selection, and only a tube whose alert or
 * selected state changed needs to redraw its glyph lanes.
 */
export const MapLineAlertTube = memo(function MapLineAlertTube({
  alert,
  plane,
  selected,
  idSuffix = "",
}: {
  alert: MapLineAlert;
  plane: MapOverlayPlane;
  selected: boolean;
  idSuffix?: string;
}) {
  const { pathD, visualState, travelDirection } = alert;
  const unit = plane.unit;
  const { step } = useMemo(() => (
    (visualState === "reduced-speed-zone" || visualState === "delay-static" || visualState === "suspension") && pathD
      ? samplePath(pathD, 56 * unit)
      : { step: 56 * unit }
  ), [pathD, unit, visualState]);
  // Lanes take their step in TTC units and scale it themselves.
  const laneStep = step / unit;
  if (!pathD) return null;

  const visualId = lineAlertVisualId(plane, alert, idSuffix);
  const selectedClass = selected ? "selected" : "";
  const renderForwardLane = travelDirection !== "reverse";
  const renderReverseLane = travelDirection !== "forward";

  return (
    <g
      id={visualId}
      className={`overlay-segment-group ${alert.segmentIds.length > 1 ? "connected-corridor" : ""} ${layerStateClass(alert.exiting)}`.replace(/\s+/g, " ").trim()}
      data-map-impact-id={alert.impactId}
      data-map-impact-kind={alert.kind}
      data-map-line-id={alert.lineId}
      style={alert.exiting ? { pointerEvents: "none" } : undefined}
    >
      <path className={`asset-alert-path-glow ${visualState}`} d={pathD} />
      <path
        className={`asset-alert-path-glow interactive-glow ${visualState} ${selectedClass}`}
        d={pathD}
        style={{ pointerEvents: "none" }}
      />
      <path
        className={`asset-alert-path-hover-boundary ${visualState}`}
        d={pathD}
        style={{ pointerEvents: "none" }}
      />

      {visualState === "delay-static" ? (
        <>
          <path
            className="asset-alert-path delay-static-base pointer-events-none"
            d={pathD}
            style={{ pointerEvents: "none", stroke: DELAY_RAIL_COLOR }}
          />
          <g className="map-glyph-lane">
            {travelDirection === "bidirectional" ? (
              // A directionless delay shows one row of hourglasses, no arrows.
              <HourglassGlyphLane
                pathD={pathD}
                step={28}
                direction="forward"
                travelDirection="forward"
                onlyHourglasses
                unit={unit}
              />
            ) : (
              <>
                {renderForwardLane ? (
                  <HourglassGlyphLane pathD={pathD} step={laneStep} direction="forward" travelDirection={travelDirection} unit={unit} />
                ) : null}
                {renderReverseLane ? (
                  <HourglassGlyphLane pathD={pathD} step={laneStep} direction="reverse" travelDirection={travelDirection} unit={unit} />
                ) : null}
              </>
            )}
          </g>
        </>
      ) : null}

      {visualState === "planned-preview" ? (
        <>
          <path
            className={`asset-alert-path planned-preview pointer-events-none ${selectedClass}`}
            d={pathD}
            style={{ pointerEvents: "none" }}
          />
          <PlannedClosureIconLane pathD={pathD} travelDirection={travelDirection} unit={unit} />
        </>
      ) : null}

      {visualState === "reduced-speed-zone" ? (
        <>
          <path
            className="asset-alert-path delay-candy pointer-events-none"
            d={pathD}
            style={{ pointerEvents: "none", stroke: RSZ_IMPACT_COLOR }}
          />
          <g className="rsz-chevron-lanes" style={{ "--chevron-step": `${step}px` } as CSSProperties}>
            {renderForwardLane ? (
              <ChevronGlyphLane pathD={pathD} step={laneStep} direction="forward" travelDirection={travelDirection} unit={unit} />
            ) : null}
            {renderReverseLane ? (
              <ChevronGlyphLane pathD={pathD} step={laneStep} direction="reverse" travelDirection={travelDirection} unit={unit} />
            ) : null}
          </g>
        </>
      ) : null}

      {visualState === "suspension" ? (
        travelDirection === "bidirectional" ? (
          <>
            <path
              className="asset-alert-path suspension-candy suspension-solid pointer-events-none"
              d={pathD}
              style={{ pointerEvents: "none", stroke: SUSPENSION_COLOR }}
            />
            <g className="map-glyph-lane">
              <SuspensionNoEntryLane pathD={pathD} step={88} unit={unit} />
            </g>
          </>
        ) : (
          <>
            <path
              className="asset-alert-path suspension-candy pointer-events-none"
              d={pathD}
              style={{ pointerEvents: "none", stroke: SUSPENSION_COLOR }}
            />
            <g className="map-glyph-lane">
              <SuspensionGlyphLane
                pathD={pathD}
                step={laneStep}
                direction={travelDirection}
                travelDirection={travelDirection}
                unit={unit}
              />
            </g>
          </>
        )
      ) : null}
    </g>
  );
});

/**
 * Every line alert's tube, grouped by line. The selected alert's tubes paint
 * last, above every other alert, so a selection made under a more severe
 * alert (from the chooser) shows its own artwork beneath the flash, not the
 * alert covering it. Hover copies and the flash still paint above them.
 */
export function MapLineAlertLayer({
  alerts,
  plane,
  selection,
}: {
  alerts: MapLineAlert[];
  plane: MapOverlayPlane;
  selection: ImpactSelection;
}) {
  return (
    <>
      {groupByLine(alerts).map(([lineId, lineAlerts]) => (
        <g key={lineId} data-map-alert-line={lineId}>
          {/* Same parent, same keys: selecting moves the tube's node rather
              than remounting it, so a whole-line alert's glyph lanes are not
              rebuilt in the frame its camera flight starts. Overlapping
              alerts share a line, so last in its line is above them. */}
          {selectedLast(lineAlerts, selection).map((alert) => (
            <MapLineAlertTube
              key={alert.key}
              alert={alert}
              plane={plane}
              selected={isSelectedLineAlert(alert, selection)}
            />
          ))}
        </g>
      ))}
    </>
  );
}

/**
 * The selected alert's emphasis, above every other alert. While a commute is
 * previewed the selected alert's whole tube is repainted over the commute
 * instead, with no flash.
 */
export function MapLineAlertSelection({
  alerts,
  plane,
  commutePreviewActive,
  introComplete,
}: {
  /** The selected alert's tubes (one per run of segments it covers). */
  alerts: MapLineAlert[];
  plane: MapOverlayPlane;
  commutePreviewActive: boolean;
  introComplete: boolean;
}) {
  return alerts.map((alert) => (
    commutePreviewActive ? (
      <g key={`commute:${alert.key}`} data-selected-commute-impact-overlay={alert.impactId}>
        <MapLineAlertTube alert={alert} plane={plane} selected idSuffix="-commute-focus" />
      </g>
    ) : (
      <path
        key={`emphasis:${alert.key}`}
        data-selected-impact-emphasis={alert.impactId}
        data-map-highlight-id={alert.impactId}
        className={`asset-alert-path map-selection-flash map-selection-attention pointer-events-none${introComplete ? " selection-intro-complete" : ""}`}
        d={alert.pathD}
        aria-hidden="true"
      />
    )
  ));
}

function hoverIdentityAttributes(alert: MapLineAlert) {
  return {
    "data-map-hover-impact-kind": alert.kind,
    "data-map-hover-impact-id": alert.impactId,
    "data-map-hover-key": alert.key,
  };
}

/**
 * A hover copy of each alert's artwork, shown only while that alert is
 * hovered so it paints above the others and the selection's flash. The
 * selected alert's copy stays hidden: its tube is already above the others
 * (`MapLineAlertLayer`), and a copy would cover its flash. Each copy's `<use>` exists only
 * while hovered (`setMapImpactHovered` adds it): Chrome keeps every `<use>`
 * clone in step with its alert even when hidden, and the camera flags restyle
 * the alerts on every gesture (map-renderer-parity.md rule 5).
 */
export function MapLineAlertHoverCopies({
  alerts,
  plane,
  selection,
}: {
  alerts: MapLineAlert[];
  plane: MapOverlayPlane;
  selection: ImpactSelection;
}) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {alerts.map((alert) => alert.exiting ? null : (
        <g
          key={alert.key}
          className="map-impact-hover-foreground"
          {...hoverIdentityAttributes(alert)}
          data-map-hover-copy-href={`#${lineAlertVisualId(plane, alert)}`}
          data-map-hover-selected={isSelectedLineAlert(alert, selection) ? "true" : undefined}
        />
      ))}
    </g>
  );
}

function OutlineCutouts({ plane }: { plane: MapOverlayPlane }) {
  return plane.outlineCutouts.map((cutout, index) => (
    <rect
      key={index}
      className="map-impact-hover-outline-cutout"
      x={cutout.x}
      y={cutout.y}
      width={cutout.width}
      height={cutout.height}
      rx={cutout.rx}
      ry={cutout.ry}
      fill="black"
      stroke="black"
      strokeWidth={cutout.strokeWidth}
    />
  ));
}

/**
 * The hover keyline: a dark ring with a light edge around the given paths.
 * Masking every path together outlines their union, so several alerts with
 * different extents read as one shape instead of crossing capsules.
 */
export function MapHoverOutline({
  maskId,
  paths,
  plane,
  visualState = "",
}: {
  maskId: string;
  paths: string[];
  plane: MapOverlayPlane;
  visualState?: string;
}) {
  const pathKey = paths.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the paths' content
  const outlinePaths = useMemo(() => [...paths, ...mapOutlineEndConnectors(paths, plane.outlineDots)], [pathKey, plane.outlineDots]);
  const outerMaskId = `${maskId}-outer`;
  const bounds = plane.maskBounds;
  const width = (value: number) => value * plane.unit;
  const maskStrokes = (className: string, stroke: string, strokeWidth: number) => outlinePaths.map((d, index) => (
    <path
      key={`${className}:${index}`}
      className={className}
      d={d}
      fill="none"
      stroke={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      style={{ strokeWidth }}
    />
  ));
  const mask = (id: string, cutoutClass: string, cutoutWidth: number): ReactNode => (
    <mask id={id} maskUnits="userSpaceOnUse" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height}>
      {maskStrokes("map-impact-hover-outline-mask-outer", "white", width(MAP_HOVER_OUTLINE_WIDTHS.outer))}
      {maskStrokes(cutoutClass, "black", cutoutWidth)}
      <OutlineCutouts plane={plane} />
    </mask>
  );
  const outlineStrokes = (className: string, maskRef: string, style: CSSProperties) => (
    <g mask={`url(#${maskRef})`}>
      {outlinePaths.map((d, index) => (
        <path key={index} className={`map-impact-hover-outline ${className} ${visualState}`.trim()} d={d} style={style} />
      ))}
    </g>
  );
  return (
    <>
      <defs>
        {mask(maskId, "map-impact-hover-outline-mask-cutout", width(MAP_HOVER_OUTLINE_WIDTHS.inner))}
        {mask(outerMaskId, "map-impact-hover-outline-mask-divider", width(MAP_HOVER_OUTLINE_WIDTHS.divider))}
      </defs>
      {outlineStrokes("map-impact-hover-outline-core", maskId, {
        stroke: "rgba(15, 23, 42, 0.98)",
        strokeWidth: width(MAP_HOVER_OUTLINE_WIDTHS.outer),
      })}
      {outlineStrokes("map-impact-hover-outline-edge", outerMaskId, {
        stroke: "rgba(248, 250, 252, 0.98)",
        strokeWidth: width(MAP_HOVER_OUTLINE_WIDTHS.outer),
      })}
    </>
  );
}

/**
 * Each alert's hover outline, drawn in the top plane above station artwork
 * and shown with its hover copies. An alert drawn as several stretches (one
 * per line it crosses) gets one outline around their union: hover raises every
 * stretch together, and one pair of masks per alert instead of one per
 * stretch kept a network-wide alert's hover within a frame on GO/UP (plan 11
 * phase 4).
 */
export function MapLineAlertHoverOutlines({ alerts, plane }: { alerts: MapLineAlert[]; plane: MapOverlayPlane }) {
  const groups = useMemo(() => lineAlertHoverOutlineGroups(alerts), [alerts]);
  return (
    <g aria-hidden="true" className="map-impact-hover-foreground-layer" pointerEvents="none">
      {groups.map(({ key, stretches }) => {
        const [first] = stretches;
        const visualState = stretches.every((alert) => alert.visualState === first.visualState) ? first.visualState : "";
        return (
          <g
            key={key}
            className="map-impact-hover-foreground"
            data-map-hover-impact-kind={first.kind}
            data-map-hover-impact-id={first.impactId}
            data-map-hover-key={stretches.map((alert) => alert.key).join(" ")}
          >
            <MapHoverOutline
              maskId={mapOverlayId(plane, "impact-hover-outline", key)}
              paths={stretches.map((alert) => alert.pathD)}
              plane={plane}
              visualState={visualState}
            />
          </g>
        );
      })}
    </g>
  );
}


/**
 * An alert's pointer and keyboard target. It selects nothing itself: the
 * map's viewport selects from its `data-map-impact-*` identity
 * (useMapTaps.ts). Hover and focus are found by the map's hover controller
 * (map-hover-controller.ts).
 */
export function MapLineAlertTarget({ alert }: { alert: MapLineAlert }) {
  const { exiting } = alert;
  return (
    <path
      aria-label={alert.label}
      className="map-segment-hit-target"
      d={alert.pathD}
      data-map-impact-kind={alert.kind}
      data-map-impact-id={alert.impactId}
      data-overlay-interaction-target={`${alert.kind}:${alert.impactId}:${alert.key}`}
      pointerEvents={exiting ? "none" : "stroke"}
      role="button"
      style={exiting ? { pointerEvents: "none" } : undefined}
      tabIndex={exiting ? -1 : 0}
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** Every alert's target, the most severe on top. */
export function MapLineAlertTargets({ alerts }: { alerts: MapLineAlert[] }) {
  return lineAlertPaintOrder(alerts).map((alert) => (
    <MapLineAlertTarget key={alert.key} alert={alert} />
  ));
}
