import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, ReactNode, SVGProps } from "react";
import type { ImpactSelection } from "../../app/linewatch-data";
import { stationImpactDirectionPath, stationImpactDirectionStrokeWidth } from "../station-impact-direction";
import { STATION_IMPACT_BEACON_STROKE_RATIO } from "../station-impact-beacon";
import type { MapOverlayPlane } from "./overlay-plane";
import {
  STATION_ALERT_HOVER_RING_GAP,
  STATION_ALERT_PILL_RING_GAP,
  STATION_ALERT_PILL_TARGET_WIDTH,
  isSelectedStationAlert,
  outsetStationPill,
  stationAlertColor,
  type MapStationAlert,
  type MapStationAlertAnchor,
  type MapStationDirectionGlyph,
  type MapStationPill,
} from "./station-alert-model";

function layerClass(exiting: boolean | undefined) {
  return exiting ? "map-layer-exiting" : "map-layer-current";
}

function alertIdentityAttributes(alert: MapStationAlert) {
  return {
    "data-map-impact-kind": alert.kind,
    "data-map-impact-id": alert.impactId,
    "data-map-station-id": alert.stationId,
  };
}

function PillShape({ pill, ...props }: { pill: MapStationPill } & Omit<SVGProps<SVGRectElement>, "ref">) {
  return (
    <rect
      x={pill.x}
      y={pill.y}
      width={pill.width}
      height={pill.height}
      rx={pill.rx}
      ry={pill.ry}
      transform={pill.transform}
      {...props}
    />
  );
}

/**
 * The anchor's idle ring grown by `gap` TTC units: a circle, or for a pill its
 * shape at the ring's distance.
 */
function AnchorOutline({
  anchor,
  gap,
  unit,
  ...props
}: { anchor: MapStationAlertAnchor; gap: number; unit: number } & Omit<SVGProps<SVGElement>, "ref">): ReactNode {
  if (anchor.pill) {
    return <PillShape pill={outsetStationPill(anchor.pill, (STATION_ALERT_PILL_RING_GAP + gap) * unit)} {...(props as SVGProps<SVGRectElement>)} />;
  }
  return <circle cx={anchor.center.x} cy={anchor.center.y} r={anchor.ringRadius + gap * unit} {...(props as SVGProps<SVGCircleElement>)} />;
}

type StationAlertTargetHandlers = {
  /** TTC selects here; GO/UP leaves it out and selects from its viewport's pointer handlers. */
  onSelect?: (selection: NonNullable<ImpactSelection>) => void;
  shouldSuppressMapClick?: () => boolean;
  suppressNextMapClick?: () => void;
};

/**
 * Every station alert's idle ring (also its pointer and keyboard target),
 * shaded beacon and still core, in its kind's colour. A pill hub draws its
 * filled outline instead of a ring and beacon. Nothing here animates
 * (map-renderer-parity.md, rule 12).
 */
export function MapStationAlertRings({
  alerts,
  plane,
  selection,
  onSelect,
  shouldSuppressMapClick = () => false,
  suppressNextMapClick,
}: StationAlertTargetHandlers & {
  alerts: MapStationAlert[];
  plane: MapOverlayPlane;
  selection: ImpactSelection;
}) {
  return (
    <g>
      {alerts.map((alert) => {
        const { exiting } = alert;
        const selected = isSelectedStationAlert(alert, selection);
        const color = stationAlertColor(alert.kind);
        const glow = (radius: number) => `drop-shadow(0 0 ${radius * plane.unit}px ${color})`;
        const select = () => onSelect?.({ kind: alert.kind, id: alert.impactId });
        const targetProps = {
          "aria-label": alert.label,
          className: `station-impact-ring ${alert.kind}${selected ? " selected" : ""}`,
          fill: "none",
          onPointerDown: (event: PointerEvent<SVGElement>) => {
            if (!onSelect || exiting || (event.pointerType === "mouse" && event.button !== 0)) return;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Pointer capture can fail if the browser ended the pointer first.
            }
          },
          onPointerUp: (event: PointerEvent<SVGElement>) => {
            if (!onSelect || exiting || (event.pointerType === "mouse" && event.button !== 0)) return;
            if (shouldSuppressMapClick()) return;
            suppressNextMapClick?.();
            select();
          },
          onClick: (event: MouseEvent<SVGElement>) => {
            if (!onSelect) return;
            event.stopPropagation();
            // Pointer activation is handled on pointerup so a map-camera
            // update cannot retarget the synthesized click to the station.
            if (exiting || event.detail !== 0 || shouldSuppressMapClick()) return;
            select();
          },
          onKeyDown: (event: KeyboardEvent<SVGElement>) => {
            if (!onSelect || exiting || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault();
            select();
          },
          pointerEvents: exiting ? "none" : "stroke",
          role: "button",
          tabIndex: exiting ? -1 : 0,
        } as const;

        return (
          <g
            key={alert.key}
            className={`map-station-alert ${layerClass(exiting)}`}
            style={exiting ? { pointerEvents: "none" } : undefined}
            {...alertIdentityAttributes(alert)}
          >
            {alert.anchors.map((anchor) => (
              <g key={anchor.id} className="map-station-alert-anchor" data-map-station-anchor-id={anchor.id}>
                {anchor.pill ? (
                  <>
                    <PillShape
                      {...targetProps}
                      className={`${targetProps.className} station-impact-ring--pill`}
                      pill={outsetStationPill(anchor.pill, STATION_ALERT_PILL_RING_GAP * plane.unit)}
                      style={{ strokeWidth: STATION_ALERT_PILL_TARGET_WIDTH * plane.unit / (anchor.pill.scale || 1) }}
                    />
                    <PillShape
                      className="station-impact-dot-red-glow station-impact-core--pill"
                      pill={anchor.pill}
                      pointerEvents="none"
                      style={{
                        ...(color ? { fill: color, filter: glow(6) } : null),
                        stroke: anchor.pill.stroke,
                        strokeWidth: anchor.pill.strokeWidth,
                      }}
                    />
                  </>
                ) : (
                  <>
                    <circle
                      {...targetProps}
                      cx={anchor.center.x}
                      cy={anchor.center.y}
                      r={anchor.ringRadius}
                      style={color ? { stroke: color, filter: glow(6), "--station-impact-glow": color } as CSSProperties : undefined}
                    />
                    <circle
                      className="station-impact-dot-red-beacon"
                      style={color ? { "--station-impact-glow": color } as CSSProperties : undefined}
                      cx={anchor.center.x}
                      cy={anchor.center.y}
                      r={anchor.beaconRadius}
                      strokeWidth={anchor.coreRadius * STATION_IMPACT_BEACON_STROKE_RATIO}
                      pointerEvents="none"
                    />
                    <circle
                      className="station-impact-dot-red-glow"
                      style={color ? { fill: color, filter: glow(6), "--station-impact-glow": color } as CSSProperties : undefined}
                      cx={anchor.center.x}
                      cy={anchor.center.y}
                      r={anchor.coreRadius}
                      pointerEvents="none"
                    />
                  </>
                )}
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** One arrow per alerted dot for its affected directions; the same glyph on both maps. */
export function MapStationDirectionGlyphs({ glyphs }: { glyphs: MapStationDirectionGlyph[] }) {
  return (
    <g>
      {glyphs.map((glyph) => (
        <g
          key={glyph.key}
          className={layerClass(glyph.exiting)}
          style={glyph.exiting ? { pointerEvents: "none" } : undefined}
        >
          <g
            aria-hidden="true"
            className="station-impact-direction-glyph"
            data-map-station-anchor-id={glyph.anchorId}
            pointerEvents="none"
            style={{ "--station-impact-direction-stroke": `${stationImpactDirectionStrokeWidth(glyph.radius)}px` } as CSSProperties}
            transform={`translate(${glyph.center.x} ${glyph.center.y})`}
          >
            <circle className="station-impact-direction-badge" r={glyph.radius} />
            <path className="station-impact-direction-arrow" d={stationImpactDirectionPath(glyph.direction, glyph.radius)} />
          </g>
        </g>
      ))}
    </g>
  );
}

/**
 * Above the station artwork: the selected alert's flash (TTC's intro, then
 * breathing) and every alert's hover priority ring, which hover state shows
 * (`setMapImpactHovered`).
 */
export function MapStationAlertForeground({
  alerts,
  plane,
  selection,
  commutePreviewActive,
  introComplete,
}: {
  alerts: MapStationAlert[];
  plane: MapOverlayPlane;
  selection: ImpactSelection;
  /** A commute preview owns the selection emphasis while it shows. */
  commutePreviewActive: boolean;
  introComplete: boolean;
}) {
  return (
    <g>
      {alerts.map((alert) => {
        if (alert.exiting) return null;
        const flashing = !commutePreviewActive && isSelectedStationAlert(alert, selection);
        return (
          <g key={`foreground:${alert.key}`}>
            {alert.anchors.map((anchor) => (
              <g key={anchor.id}>
                {flashing ? (
                  <AnchorOutline
                    anchor={anchor}
                    gap={0}
                    unit={plane.unit}
                    data-map-highlight-id={alert.impactId}
                    data-station-impact-selection-id={alert.impactId}
                    className={`station-selection-flash map-selection-attention${introComplete ? " selection-intro-complete" : ""}`}
                  />
                ) : null}
                <AnchorOutline
                  anchor={anchor}
                  gap={STATION_ALERT_HOVER_RING_GAP}
                  unit={plane.unit}
                  data-map-hover-impact-kind={alert.kind}
                  data-map-hover-impact-id={alert.impactId}
                  className="station-impact-hover-priority"
                />
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}
