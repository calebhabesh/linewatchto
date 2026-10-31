"use client";

import {
  memo,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type SVGProps,
} from "react";
import type { MapPoint } from "../app/map-geometry";
import {
  mapStationHoverShapes,
  mapStationSelectionShapes,
  mapStationShapeAnchorId,
  type MapStationArtwork,
  type MapStationLabelTarget,
  type MapStationPlacement,
  type MapStationShape,
} from "../app/map-station-artwork";
import { mapOverlayUnitStyle } from "./map-overlays/overlay-plane";

/*
 * Every System Map's station targets, hover rings, selection marker and
 * station-name targets, drawn from the station artwork (app/map-station-artwork.ts)
 * as React elements in the map's planes. Shapes are in each station's own
 * coordinates, placed by its transform. Each station is a memoized component,
 * so a selection re-renders only the stations whose selection changed.
 */

function StationShape({ shape, ...props }: { shape: MapStationShape } & SVGProps<SVGElement>) {
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

const StationHoverIndicator = memo(function StationHoverIndicator({
  station,
  selected,
}: {
  station: MapStationArtwork;
  selected: boolean;
}) {
  return (
    <g
      data-station-hover-id={station.id}
      data-station-hover-selected={selected ? "true" : "false"}
      className="station-hover-indicator"
      transform={station.transform || undefined}
    >
      {mapStationHoverShapes(station).map((shape) => (
        <StationShape key={shape.id} shape={shape} data-station-anchor-id={mapStationShapeAnchorId(shape) ?? undefined} />
      ))}
    </g>
  );
});

/**
 * Each station's hover ring, under the station artwork. Hover is written to
 * it directly (`setMapStationHovered`), so it shows before the next paint.
 */
export const MapStationHoverIndicators = memo(function MapStationHoverIndicators({
  stations,
  selectedStationId,
  overlayUnit,
}: {
  stations: readonly MapStationPlacement[];
  selectedStationId: string | null;
  overlayUnit: number;
}) {
  return (
    <g aria-hidden="true" pointerEvents="none" style={mapOverlayUnitStyle({ unit: overlayUnit })}>
      {stations.map(({ artwork }) => (
        <StationHoverIndicator key={artwork.id} station={artwork} selected={selectedStationId === artwork.id} />
      ))}
    </g>
  );
});

/** How a station's own target selects it, while the maps' tap paths differ. */
export type MapStationTargetSelect = {
  onSelectStationId: (stationId: string) => void;
  shouldSuppressMapClick: () => boolean;
  suppressNextMapClick: () => void;
};

/** Reports a station's hover: by the mouse, or by focus. */
export type MapStationHoverChange = (stationId: string, hovered: boolean, via: "pointer" | "focus") => void;

function capturePointer(event: PointerEvent<Element>) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture can fail if the browser ended the pointer first.
  }
}

const StationTarget = memo(function StationTarget({
  station,
  name,
  selected,
  onHoverChange,
  select,
}: {
  station: MapStationArtwork;
  name: string;
  selected: boolean;
  onHoverChange: MapStationHoverChange;
  select?: MapStationTargetSelect;
}) {
  return (
    <g
      className={`station-hit-target${selected ? " selected" : ""}`}
      data-station-id={station.id}
      role="button"
      tabIndex={0}
      aria-label={`${name} station details`}
      transform={station.transform || undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onHoverChange(station.id, true, "pointer");
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onHoverChange(station.id, false, "pointer");
      }}
      onFocus={() => onHoverChange(station.id, true, "focus")}
      onBlur={() => onHoverChange(station.id, false, "focus")}
      {...(select ? {
        onPointerDown: capturePointer,
        onPointerUp: (event: PointerEvent<SVGGElement>) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          if (select.shouldSuppressMapClick()) return;
          select.suppressNextMapClick();
          select.onSelectStationId(station.id);
        },
        onClick: (event: MouseEvent<SVGGElement>) => {
          // Mouse and touch select on pointerup: browsers can drop the later
          // synthesized click when the camera commits between press and click.
          event.stopPropagation();
          if (event.detail !== 0 || select.shouldSuppressMapClick()) return;
          select.onSelectStationId(station.id);
        },
        onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          select.onSelectStationId(station.id);
        },
      } : {})}
    >
      {station.shapes.map((shape) => (
        <StationShape key={shape.id} shape={shape} />
      ))}
    </g>
  );
});

/**
 * Each station's pointer and keyboard target, the shape of its dots grown by
 * the map's hit padding (map units; `touch` on coarse pointers). Without
 * `select`, the map's viewport selects from `data-station-id`.
 */
export const MapStationTargets = memo(function MapStationTargets({
  stations,
  selectedStationId,
  hitPadding,
  onHoverChange,
  select,
}: {
  stations: readonly MapStationPlacement[];
  selectedStationId: string | null;
  hitPadding: { readonly pointer: number; readonly touch: number };
  onHoverChange: MapStationHoverChange;
  select?: MapStationTargetSelect;
}) {
  const style = {
    "--station-hit-padding": `${hitPadding.pointer}px`,
    "--station-touch-hit-padding": `${hitPadding.touch}px`,
  } as CSSProperties;
  return (
    <g aria-label="Station hit targets" style={style}>
      {stations.map(({ artwork, name }) => (
        <StationTarget
          key={artwork.id}
          station={artwork}
          name={name}
          selected={selectedStationId === artwork.id}
          onHoverChange={onHoverChange}
          select={select}
        />
      ))}
    </g>
  );
});

/** The selected station's marker, above the station artwork. Key it by station so its intro replays. */
export function MapStationSelection({
  station,
  introComplete,
}: {
  station: MapStationArtwork | null;
  introComplete: boolean;
}) {
  if (!station) return null;
  return (
    <g transform={station.transform || undefined} pointerEvents="none">
      <g
        className={`station-selection-flash map-selection-attention${introComplete ? " selection-intro-complete" : ""}`}
        data-map-selected-station-id={station.id}
        data-map-highlight-id={station.id}
        data-station-selection-foreground={station.id}
      >
        {mapStationSelectionShapes(station).map((shape) => (
          <StationShape key={shape.id} shape={shape} data-station-anchor-id={mapStationShapeAnchorId(shape) ?? undefined} />
        ))}
      </g>
    </g>
  );
}

/** How a station name's target reports hover and selects, while the maps' paths differ. */
export type MapStationLabelInteraction = MapStationTargetSelect & {
  onLabelHoverChange: (stationId: string, hovered: boolean) => void;
};

function labelPoints(points: readonly MapPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Each station name's target, in root SVG coordinates. Pointer only: the
 * station's own target is its keyboard stop and accessible button. Without
 * `interaction`, the map's viewport handles hover and taps from
 * `data-station-label-id`.
 */
export const MapStationLabelTargets = memo(function MapStationLabelTargets({
  labels,
  interaction,
}: {
  labels: readonly MapStationLabelTarget[];
  interaction?: MapStationLabelInteraction;
}) {
  return (
    <g aria-label="Station label hit targets">
      {labels.map(({ stationId, points }) => (
        <polygon
          key={stationId}
          aria-hidden="true"
          data-station-label-id={stationId}
          className="station-label-hit-target"
          points={labelPoints(points)}
          focusable="false"
          {...(interaction ? {
            onPointerEnter: (event: PointerEvent<SVGPolygonElement>) => {
              if (event.pointerType === "mouse") interaction.onLabelHoverChange(stationId, true);
            },
            onPointerOver: (event: PointerEvent<SVGPolygonElement>) => {
              if (event.pointerType === "mouse") interaction.onLabelHoverChange(stationId, true);
            },
            onPointerLeave: (event: PointerEvent<SVGPolygonElement>) => {
              if (event.pointerType === "mouse") interaction.onLabelHoverChange(stationId, false);
            },
            onPointerDown: capturePointer,
            onPointerUp: (event: PointerEvent<SVGPolygonElement>) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              try {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              } catch {
                // Pointer capture may already be released by the browser during cancellation.
              }
            },
            onClick: (event: MouseEvent<SVGPolygonElement>) => {
              event.stopPropagation();
              if (interaction.shouldSuppressMapClick()) return;
              interaction.suppressNextMapClick();
              interaction.onSelectStationId(stationId);
            },
          } : {})}
        />
      ))}
    </g>
  );
});
