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
 * A still green blip over each end's station, above station artwork. A pill
 * (Union) is outlined at a fixed distance instead of scaled, which would
 * stretch a long pill far past the station.
 */
export function MapCommuteEndpointBlips({
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
        <CommuteEndpointBlip key={endpoint.key} endpoint={endpoint} unit={plane.unit} previewId={preview.id} />
      ))}
    </g>
  );
}

/** A blip's reach past its station's dot, as a share of the endpoint's flash radius, and a pill's, in overlay units. */
const BLIP_RADIUS_SCALE = 1.3;
const PILL_BLIP_OUTSET = 15;

function CommuteEndpointBlip({
  endpoint,
  unit,
  previewId,
}: {
  endpoint: MapCommuteEndpoint;
  unit: number;
  previewId: string;
}) {
  const shared = {
    "data-map-highlight-id": endpoint.stationId,
    "data-commute-path-endpoint": endpoint.role,
    // The camera frames the ends with the route: a one-station preview has no route.
    "data-commute-path-preview-endpoint": previewId,
  };
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
