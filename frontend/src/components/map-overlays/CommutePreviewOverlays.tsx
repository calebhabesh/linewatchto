import type { CSSProperties } from "react";
import type { MapCommuteEndpoint, MapCommutePreview } from "./commute-preview-model";
import type { MapOverlayPlane } from "./overlay-plane";
import { outsetStationPill } from "./station-alert-model";

/**
 * The previewed commute route: a soft glow and the route, with a white dot at
 * each end. Drawn under station artwork. CSS sizes multiply by the map's
 * overlay unit, as for alerts.
 */
export function MapCommutePreviewRoute({ preview }: { preview: MapCommutePreview | null }) {
  if (!preview?.pathD) return null;
  return (
    <g
      aria-label={preview.label}
      className="commute-path-preview-layer"
      data-commute-path-preview={preview.id}
    >
      <path className="asset-alert-path-glow commute-path-preview-glow" d={preview.pathD} />
      <path className="asset-alert-path commute-path-preview-path" d={preview.pathD} />
      {preview.endpoints.map((endpoint) => endpoint.pill ? (
        <rect
          key={endpoint.key}
          className="commute-path-preview-endpoint"
          x={endpoint.pill.x}
          y={endpoint.pill.y}
          width={endpoint.pill.width}
          height={endpoint.pill.height}
          rx={endpoint.pill.rx}
          ry={endpoint.pill.ry}
          transform={endpoint.pill.transform}
        />
      ) : (
        <circle
          key={endpoint.key}
          className="commute-path-preview-endpoint"
          cx={endpoint.center.x}
          cy={endpoint.center.y}
          r={endpoint.dotRadius}
        />
      ))}
    </g>
  );
}

/**
 * A green flash over each end's station, above station artwork; a past
 * alert's span marks its ends with a still green blip instead. A pill
 * (Union) swells its own outline by a fixed distance instead of scaling,
 * which would stretch a long pill far past the station.
 */
export function MapCommuteEndpointFlashes({
  preview,
  plane,
}: {
  preview: MapCommutePreview | null;
  plane: MapOverlayPlane;
}) {
  if (!preview) return null;
  return (
    <g aria-hidden="true" pointerEvents="none">
      {preview.endpoints.map((endpoint) => (
        <CommuteEndpointFlash key={endpoint.key} endpoint={endpoint} unit={plane.unit} still={preview.endpointStyle === "static"} previewId={preview.id} />
      ))}
    </g>
  );
}

/** How far a pill's flash starts inside and swells past its outline, in overlay units. */
const PILL_FLASH_FROM = -25;
const PILL_FLASH_TO = 15;

/** A still blip's reach past its station's dot, as a share of the beacon's radius, and a pill's, in overlay units. */
const BLIP_RADIUS_SCALE = 1.3;
const PILL_BLIP_OUTSET = 15;

function CommuteEndpointFlash({
  endpoint,
  unit,
  still = false,
  previewId,
}: {
  endpoint: MapCommuteEndpoint;
  unit: number;
  still?: boolean;
  previewId: string;
}) {
  const shared = {
    "data-map-highlight-id": endpoint.stationId,
    "data-commute-path-endpoint": endpoint.role,
    // The camera frames the ends with the route: a one-station preview has no route.
    "data-commute-path-preview-endpoint": previewId,
  };
  if (still) {
    if (!endpoint.pill) {
      return (
        <circle
          {...shared}
          className="station-endpoint-blip"
          cx={endpoint.center.x}
          cy={endpoint.center.y}
          r={endpoint.flashRadius * BLIP_RADIUS_SCALE}
        />
      );
    }
    const box = outsetStationPill(endpoint.pill, PILL_BLIP_OUTSET * unit);
    return (
      <rect
        {...shared}
        className="station-endpoint-blip"
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={box.rx}
        ry={box.ry}
        transform={endpoint.pill.transform}
      />
    );
  }
  if (!endpoint.pill) {
    return (
      <circle
        {...shared}
        className="station-commute-green-flash"
        cx={endpoint.center.x}
        cy={endpoint.center.y}
        r={endpoint.flashRadius}
      />
    );
  }
  const frame = (distance: number) => outsetStationPill(endpoint.pill!, distance * unit);
  const from = frame(PILL_FLASH_FROM);
  const to = frame(PILL_FLASH_TO);
  const style: Record<string, string> = {};
  for (const [name, box] of [["from", from], ["to", to]] as const) {
    style[`--flash-${name}-x`] = `${box.x}px`;
    style[`--flash-${name}-y`] = `${box.y}px`;
    style[`--flash-${name}-width`] = `${box.width}px`;
    style[`--flash-${name}-height`] = `${box.height}px`;
    style[`--flash-${name}-r`] = `${Math.min(box.rx, box.width / 2, box.height / 2)}px`;
  }
  return (
    <rect
      {...shared}
      className="station-commute-green-flash station-commute-green-flash--pill"
      x={to.x}
      y={to.y}
      width={to.width}
      height={to.height}
      rx={to.rx}
      ry={to.ry}
      transform={endpoint.pill.transform}
      style={style as CSSProperties}
    />
  );
}
