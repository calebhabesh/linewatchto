"use client";

import { memo, type CSSProperties, type PointerEvent, type SVGProps } from "react";
import type { MapBounds, MapPoint } from "../app/map-geometry";
import {
  mapStationHoverShapes,
  mapStationSelectionShapes,
  mapStationShapeAnchorId,
  type MapStationArtwork,
  type MapStationLabelHover,
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

/** Reports a station's hover: by the mouse, or by focus. */
export type MapStationHoverChange = (stationId: string, hovered: boolean, via: "pointer" | "focus") => void;

const StationTarget = memo(function StationTarget({
  station,
  name,
  selected,
  onHoverChange,
}: {
  station: MapStationArtwork;
  name: string;
  selected: boolean;
  onHoverChange: MapStationHoverChange;
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
    >
      {station.shapes.map((shape) => (
        <StationShape key={shape.id} shape={shape} />
      ))}
    </g>
  );
});

/**
 * Each station's pointer and keyboard target, the shape of its dots grown by
 * the map's hit padding (map units; `touch` on coarse pointers). The map's
 * viewport selects from `data-station-id` (map-overlays/useMapTaps.ts).
 */
export const MapStationTargets = memo(function MapStationTargets({
  stations,
  selectedStationId,
  hitPadding,
  onHoverChange,
}: {
  stations: readonly MapStationPlacement[];
  selectedStationId: string | null;
  hitPadding: { readonly pointer: number; readonly touch: number };
  onHoverChange: MapStationHoverChange;
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

/** Reports a station name's mouse hover. */
export type MapStationLabelHoverChange = (stationId: string, hovered: boolean) => void;

function labelPoints(points: readonly MapPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Each station name's target, in root SVG coordinates. Pointer only: the
 * station's own target is its keyboard stop and accessible button. The map's
 * viewport selects from `data-station-label-id` (map-overlays/useMapTaps.ts).
 */
export const MapStationLabelTargets = memo(function MapStationLabelTargets({
  labels,
  onHoverChange,
}: {
  labels: readonly MapStationLabelTarget[];
  onHoverChange: MapStationLabelHoverChange;
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
          onPointerEnter={(event: PointerEvent<SVGPolygonElement>) => {
            if (event.pointerType === "mouse") onHoverChange(stationId, true);
          }}
          onPointerOver={(event: PointerEvent<SVGPolygonElement>) => {
            if (event.pointerType === "mouse") onHoverChange(stationId, true);
          }}
          onPointerLeave={(event: PointerEvent<SVGPolygonElement>) => {
            if (event.pointerType === "mouse") onHoverChange(stationId, false);
          }}
        />
      ))}
    </g>
  );
});

/**
 * Where the hovered name's glyphs come from: an artwork element by id
 * (`<use>`), or a copy of a prepared glyph source's markup.
 */
export type MapStationLabelCutout = { href: string } | { markup: string };

const WHITE_ALPHA = "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0";

/**
 * The hovered station name, lifted above the map: the label texture's pixels
 * inside the name's box, masked to its glyphs so a neighbouring name never
 * enters the copy. The label plane cuts the same glyphs out underneath it.
 */
export function MapStationLabelHoverCopy({
  idPrefix,
  hover,
  cutout,
  dilate,
  active,
  labelsSource,
  viewBox,
}: {
  /** Keeps the copy's ids apart from the other maps'. */
  idPrefix: string;
  hover: MapStationLabelHover;
  cutout: MapStationLabelCutout;
  dilate: number;
  /** False while the copy lingers after the hover ends. */
  active: boolean;
  /** The label texture's URL. */
  labelsSource: string;
  viewBox: MapBounds;
}) {
  const ids = {
    clip: `${idPrefix}-hovered-station-label-clip`,
    whiteAlpha: `${idPrefix}-hovered-label-white-alpha`,
    targetAlpha: `${idPrefix}-hovered-label-target-alpha`,
    targetMask: `${idPrefix}-hovered-station-target-mask`,
    labelMask: `${idPrefix}-hovered-station-label-mask`,
  };
  const { bounds, center } = hover;
  const image = {
    href: labelsSource,
    x: viewBox.x,
    y: viewBox.y,
    width: viewBox.width,
    height: viewBox.height,
    preserveAspectRatio: "xMidYMid meet",
  };
  return (
    <g
      aria-hidden="true"
      className="raster-station-label-text-hover"
      data-hover-active={active}
      // transform-box: view-box measures from the view box's origin.
      style={{ transformOrigin: `${center.x - viewBox.x}px ${center.y - viewBox.y}px` }}
    >
      <defs>
        <clipPath id={ids.clip} clipPathUnits="userSpaceOnUse">
          <polygon points={labelPoints(hover.points)} />
        </clipPath>
        <filter id={ids.whiteAlpha} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={WHITE_ALPHA} />
        </filter>
        <filter id={ids.targetAlpha} colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius={dilate} result="expandedTargetAlpha" />
          <feColorMatrix in="expandedTargetAlpha" type="matrix" values={WHITE_ALPHA} />
        </filter>
        <mask id={ids.targetMask} maskUnits="userSpaceOnUse" {...bounds}>
          {"href" in cutout ? (
            <use href={cutout.href} filter={`url(#${ids.targetAlpha})`} visibility="visible" />
          ) : (
            <g filter={`url(#${ids.targetAlpha})`} dangerouslySetInnerHTML={{ __html: cutout.markup }} />
          )}
        </mask>
        <mask id={ids.labelMask} maskUnits="userSpaceOnUse" {...bounds}>
          <g mask={`url(#${ids.targetMask})`}>
            <image {...image} clipPath={`url(#${ids.clip})`} filter={`url(#${ids.whiteAlpha})`} />
          </g>
        </mask>
      </defs>
      <image {...image} mask={`url(#${ids.labelMask})`} />
    </g>
  );
}
