import { memo, type SVGProps } from "react";
import { stationName } from "../app/regional-data";
import {
  regionalStationHoverShapes,
  regionalStationSelectionShapes,
  type RegionalStationArtwork,
  type RegionalStationLabelTarget,
  type RegionalStationShape,
} from "../app/regional-station-interaction";

/*
 * GO/UP's station targets, hover rings and selection marker, drawn from the
 * authored station artwork as React elements in the map's planes, as TTC's
 * are. Station shapes are in the stations layer's coordinates (the overlay
 * plane's); callers place them with the plane's transform.
 */

function StationShape({ shape, ...props }: { shape: RegionalStationShape } & SVGProps<SVGElement>) {
  const { transform } = shape;
  if (shape.tag === "circle") {
    return <circle {...(props as SVGProps<SVGCircleElement>)} cx={shape.cx} cy={shape.cy} r={shape.r} transform={transform} />;
  }
  if (shape.tag === "ellipse") {
    return <ellipse {...(props as SVGProps<SVGEllipseElement>)} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} transform={transform} />;
  }
  return (
    <rect
      {...(props as SVGProps<SVGRectElement>)}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rx={shape.rx || undefined}
      ry={shape.ry || undefined}
      transform={transform}
    />
  );
}

/**
 * Each station's hover ring, under the station artwork. Hover is written to
 * it directly (`setMapStationHovered`), as on TTC.
 */
export const RegionalStationHoverIndicators = memo(function RegionalStationHoverIndicators({
  stations,
  selectedStationId,
}: {
  stations: RegionalStationArtwork[];
  selectedStationId: string | null;
}) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {stations.map((station) => (
        <g
          key={station.id}
          data-station-hover-id={station.id}
          data-station-hover-selected={selectedStationId === station.id ? "true" : "false"}
          className={`station-hover-indicator regional-station-hover-indicator${station.large ? " large-terminal" : ""}`}
          transform={station.transform}
        >
          {regionalStationHoverShapes(station).map((shape, index) => (
            <StationShape key={index} shape={shape} />
          ))}
        </g>
      ))}
    </g>
  );
});

/**
 * Each station's pointer and keyboard target. The map's viewport handlers
 * select it from `data-regional-station-id`.
 */
export const RegionalStationTargets = memo(function RegionalStationTargets({
  stations,
  selectedStationId,
  onHoverChange,
}: {
  stations: RegionalStationArtwork[];
  selectedStationId: string | null;
  onHoverChange: (stationId: string, hovered: boolean) => void;
}) {
  return stations.map((station) => (
    <g
      key={station.id}
      className="regional-station-hit-target"
      data-regional-station-id={station.id}
      data-regional-station-selected={selectedStationId === station.id ? "true" : undefined}
      role="button"
      tabIndex={0}
      aria-label={`${stationName(station.id)} station details`}
      transform={station.transform}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onHoverChange(station.id, true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onHoverChange(station.id, false);
      }}
      onFocus={() => onHoverChange(station.id, true)}
      onBlur={() => onHoverChange(station.id, false)}
    >
      <title>{`${stationName(station.id)} station`}</title>
      {station.shapes.map((shape, index) => (
        <StationShape
          key={index}
          shape={shape}
          fill="transparent"
          stroke="transparent"
          strokeWidth={120}
          pointerEvents="all"
        />
      ))}
    </g>
  ));
});

/** Each station name's target, in root SVG coordinates. */
export const RegionalStationLabelTargets = memo(function RegionalStationLabelTargets({
  labels,
}: {
  labels: RegionalStationLabelTarget[];
}) {
  return labels.map((label) => (
    <polygon
      key={label.stationId}
      className="regional-station-label-hit-target"
      data-regional-station-id={label.stationId}
      data-regional-station-label-id={label.stationId}
      points={label.points.map((point) => `${point.x},${point.y}`).join(" ")}
      role="button"
      tabIndex={0}
      aria-label={`${label.name} station details`}
    />
  ));
});

/** The selected station's marker, above the station artwork. */
export function RegionalStationSelection({
  station,
  introComplete,
}: {
  station: RegionalStationArtwork | null;
  introComplete: boolean;
}) {
  if (!station) return null;
  return (
    <g transform={station.transform}>
      <g
        className={`regional-station-top-selection map-selection-attention${introComplete ? " selection-intro-complete" : ""}`}
        data-regional-station-top-selected="true"
        data-regional-station-selection-id={station.id}
        data-regional-station-selected="true"
      >
        {regionalStationSelectionShapes(station).map((shape, index) => (
          <StationShape key={index} shape={shape} />
        ))}
      </g>
    </g>
  );
}
