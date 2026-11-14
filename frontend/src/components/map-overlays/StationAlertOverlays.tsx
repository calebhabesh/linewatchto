import type { CSSProperties, ReactNode, SVGProps } from "react";
import type { ImpactSelection } from "../../app/linewatch-data";
import { stationImpactDirectionPath, stationImpactDirectionStrokeWidth } from "../station-impact-direction";
import {
  STATION_ALERT_PING_OVERSHOOT,
  STATION_ALERT_PING_PILL_SCALE,
  STATION_ALERT_PING_STROKE_RATIO,
  STATION_IMPACT_BEACON_STROKE_RATIO,
  stationAlertPings,
} from "../station-impact-beacon";
import type { MapOverlayPlane } from "./overlay-plane";
import {
  STATION_ALERT_HOVER_RING_GAP,
  STATION_ALERT_PILL_RING_GAP,
  STATION_ALERT_PILL_TARGET_WIDTH,
  STATION_DIRECTION_BADGE_RING_WIDTH,
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

/**
 * Every station alert's idle ring (also its pointer and keyboard target; the
 * map's viewport selects from its identity, useMapTaps.ts), shaded beacon and
 * still core, in its kind's colour. A pill hub draws its filled outline
 * instead of a ring and beacon. Nothing here moves (map-renderer-parity.md,
 * rules 3 and 12): a current suspension or delay also carries a ping ring
 * that swells from the core past the beacon's edge and fades, which only the
 * desktop motion gates in station-markers.css show.
 */
export function MapStationAlertRings({
  alerts,
  plane,
  selection,
}: {
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
        const pings = !exiting && stationAlertPings(alert.kind);
        // Hidden, not removed, while selected, so it stays on the pulse clock.
        const pingClass = `station-alert-beacon-ping${selected ? " selected" : ""}`;
        const pingStyle = (from: number, to: number) => ({
          ...(color ? { "--station-impact-glow": color } : null),
          "--station-alert-ping-from": from,
          "--station-alert-ping-to": to,
        }) as CSSProperties;
        const targetProps = {
          "aria-label": alert.label,
          className: `station-impact-ring ${alert.kind}${selected ? " selected" : ""}`,
          fill: "none",
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
                    {pings ? (
                      // The pill's own transform on a group, so the ring
                      // scales about the pill's centre in marker units.
                      <g transform={anchor.pill.transform} aria-hidden="true" pointerEvents="none">
                        <PillShape
                          className={pingClass}
                          pill={{ ...outsetStationPill(anchor.pill, STATION_ALERT_PILL_RING_GAP * plane.unit), transform: "" }}
                          style={{
                            ...pingStyle(1, STATION_ALERT_PING_PILL_SCALE),
                            strokeWidth: STATION_ALERT_PILL_TARGET_WIDTH * plane.unit / (anchor.pill.scale || 1) / 2,
                          }}
                        />
                      </g>
                    ) : null}
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
                    {pings ? (
                      <circle
                        className={pingClass}
                        style={pingStyle(
                          anchor.coreRadius / anchor.beaconRadius,
                          1 + STATION_ALERT_PING_OVERSHOOT * anchor.coreRadius / anchor.beaconRadius,
                        )}
                        cx={anchor.center.x}
                        cy={anchor.center.y}
                        r={anchor.beaconRadius}
                        strokeWidth={anchor.coreRadius * STATION_ALERT_PING_STROKE_RATIO}
                        pointerEvents="none"
                        aria-hidden="true"
                      />
                    ) : null}
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

/**
 * One arrow per alerted dot for its affected directions; the same glyph on
 * both maps. Its badge covers the dot's white, its ring inside the outline.
 */
export function MapStationDirectionGlyphs({ glyphs, plane }: { glyphs: MapStationDirectionGlyph[]; plane: MapOverlayPlane }) {
  const ringWidth = STATION_DIRECTION_BADGE_RING_WIDTH * plane.unit;
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
            <circle
              className="station-impact-direction-badge"
              r={Math.max(0, glyph.radius - ringWidth / 2)}
              style={{ strokeWidth: ringWidth }}
            />
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
