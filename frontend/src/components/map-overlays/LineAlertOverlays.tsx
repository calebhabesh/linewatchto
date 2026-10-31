import { useMemo, type CSSProperties, type ReactNode } from "react";
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
  lineAlertPaintOrder,
  type MapLineAlert,
} from "./line-alert-model";
import { MAP_HOVER_OUTLINE_WIDTHS, mapOverlayId, type MapOverlayPlane } from "./overlay-plane";

export type { MapLineAlert, MapOverlayVisualState } from "./line-alert-model";

export const RSZ_IMPACT_COLOR = "#F59E0B";
const SUSPENSION_COLOR = "#ef4444";
const DELAY_RAIL_COLOR = "#0ea5e9";
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

/** One alert's tube and glyphs (the resting artwork, never animated). */
export function MapLineAlertTube({
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
    (visualState === "reduced-speed-zone" || visualState === "delay-static") && pathD
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
                step={48}
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
}

/** Every line alert's tube, grouped by line. */
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
          {lineAlerts.map((alert) => (
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
 * hovered so it paints above the others. Idle copies stay out of rendering
 * (map-renderer-parity.md rule 5).
 */
export function MapLineAlertHoverCopies({ alerts, plane }: { alerts: MapLineAlert[]; plane: MapOverlayPlane }) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {alerts.map((alert) => alert.exiting ? null : (
        <g key={alert.key} className="map-impact-hover-foreground" {...hoverIdentityAttributes(alert)}>
          <use href={`#${lineAlertVisualId(plane, alert)}`} />
        </g>
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
  const outerMaskId = `${maskId}-outer`;
  const bounds = plane.maskBounds;
  const width = (value: number) => value * plane.unit;
  const maskStrokes = (className: string, stroke: string, strokeWidth: number) => paths.map((d, index) => (
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
      {paths.map((d, index) => (
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
 * and shown with its hover copy.
 */
export function MapLineAlertHoverOutlines({ alerts, plane }: { alerts: MapLineAlert[]; plane: MapOverlayPlane }) {
  return (
    <g aria-hidden="true" className="map-impact-hover-foreground-layer" pointerEvents="none">
      {alerts.map((alert) => alert.exiting ? null : (
        <g key={alert.key} className="map-impact-hover-foreground" {...hoverIdentityAttributes(alert)}>
          <MapHoverOutline
            maskId={mapOverlayId(plane, "impact-hover-outline", alert.key)}
            paths={[alert.pathD]}
            plane={plane}
            visualState={alert.visualState}
          />
        </g>
      ))}
    </g>
  );
}


/**
 * An alert's pointer and keyboard target. TTC handles activation here; GO/UP
 * leaves `onSelect` out and activates from its viewport's pointer handlers,
 * which read the target's `data-map-impact-*` identity. Hover and focus are
 * found by the map's hover controller (map-hover-controller.ts).
 */
export function MapLineAlertTarget({
  alert,
  onSelect,
  shouldSuppressMapClick = () => false,
  suppressNextMapClick,
}: {
  alert: MapLineAlert;
  onSelect?: (selection: NonNullable<ImpactSelection>) => void;
  shouldSuppressMapClick?: () => boolean;
  suppressNextMapClick?: () => void;
}) {
  const { exiting } = alert;
  const select = () => onSelect?.({ kind: alert.kind, id: alert.impactId });

  return (
    <path
      aria-label={alert.label}
      className="map-segment-hit-target"
      d={alert.pathD}
      data-map-impact-kind={alert.kind}
      data-map-impact-id={alert.impactId}
      data-overlay-interaction-target={`${alert.kind}:${alert.impactId}:${alert.key}`}
      onClick={(event) => {
        if (!onSelect) return;
        // Pointer activation is owned by pointerup below. A map-camera commit or
        // the desktop panel opening can otherwise retarget/drop the later
        // synthesized click after the user has visibly pressed this path.
        event.stopPropagation();
        if (exiting || event.detail !== 0 || shouldSuppressMapClick()) return;
        select();
      }}
      onKeyDown={(event) => {
        if (!onSelect || exiting || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        select();
      }}
      onPointerDown={(event) => {
        if (!onSelect || exiting || (event.pointerType === "mouse" && event.button !== 0)) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture can fail if the browser ended the pointer first.
        }
      }}
      onPointerUp={(event) => {
        if (!onSelect || exiting || (event.pointerType === "mouse" && event.button !== 0)) return;
        if (shouldSuppressMapClick()) return;
        suppressNextMapClick?.();
        select();
      }}
      pointerEvents={exiting ? "none" : "stroke"}
      role="button"
      style={exiting ? { pointerEvents: "none" } : undefined}
      tabIndex={exiting ? -1 : 0}
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** Every alert's target, the most severe on top. */
export function MapLineAlertTargets(props: Omit<Parameters<typeof MapLineAlertTarget>[0], "alert"> & {
  alerts: MapLineAlert[];
}) {
  const { alerts, ...targetProps } = props;
  return lineAlertPaintOrder(alerts).map((alert) => (
    <MapLineAlertTarget key={alert.key} alert={alert} {...targetProps} />
  ));
}
