"use client";

import { memo, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { MapPoint } from "../app/map-geometry";
import type { StationSummary } from "../app/station-data";
import { setMapStationHovered } from "./map-overlays/station-hover";

type StationAnchor = { id: string; point: MapPoint };

/**
 * One TTC station's hover ring, selection indicator and pointer/keyboard
 * target. Memoized per station, as GO/UP's station layers are, so selecting a
 * station re-renders only the stations whose selection changed, not all 109.
 */
export const TtcStationTarget = memo(function TtcStationTarget({
  station,
  anchors,
  isLarge,
  selected,
  mapRootRef,
  setHoveredStationLabelId,
  shouldSuppressMapClick,
  suppressNextMapClick,
  onSelectStationId,
}: {
  station: StationSummary;
  anchors: readonly StationAnchor[];
  isLarge: boolean;
  selected: boolean;
  mapRootRef: RefObject<HTMLElement | null>;
  setHoveredStationLabelId: Dispatch<SetStateAction<string | null>>;
  shouldSuppressMapClick: () => boolean;
  suppressNextMapClick: () => void;
  onSelectStationId: (stationId: string | null) => void;
}) {
  const hasMultipleVisualAnchors = anchors.length > 1;
  // Match the authored dot outlines. Alert paths retain their own
  // screen-space interaction corridors below these exact targets.
  const hitRadius = hasMultipleVisualAnchors ? 34 : isLarge ? 67 : 37;
  // Let the hover wash fully surround the authored marker instead of tracing
  // its edge. Keep multi-anchor stations tighter so the two Spadina
  // highlights remain visually distinct.
  const hoverRadius = hasMultipleVisualAnchors ? 42 : isLarge ? 78 : 46;
  const highlightRadius = hasMultipleVisualAnchors ? 33 : isLarge ? 48 : 38;
  const select = () => {
    if (hasMultipleVisualAnchors) setMapStationHovered(mapRootRef.current, station.id, false);
    onSelectStationId(station.id);
  };
  return (
    <g
      // Hovering or focusing a station also lifts its name, as on GO/UP.
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        setMapStationHovered(mapRootRef.current, station.id, true);
        setHoveredStationLabelId(station.id);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        setMapStationHovered(mapRootRef.current, station.id, false);
        setHoveredStationLabelId((current) => current === station.id ? null : current);
      }}
      onFocus={() => {
        setMapStationHovered(mapRootRef.current, station.id, true);
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
          setHoveredStationLabelId(station.id);
        }
      }}
      onBlur={() => {
        setMapStationHovered(mapRootRef.current, station.id, false);
        setHoveredStationLabelId((current) => current === station.id ? null : current);
      }}
    >
      {anchors.map(({ id: anchorId, point }, anchorIndex) => (
        <g key={`${station.id}:${anchorId}`}>
          <circle
            data-station-hover-id={station.id}
            data-station-anchor-id={anchorId}
            data-station-hover-selected={selected ? "true" : "false"}
            className="station-hover-indicator"
            cx={point.x}
            cy={point.y}
            r={hoverRadius}
            pointerEvents="none"
          />
          {(selected || hasMultipleVisualAnchors) && (
            <circle
              data-station-selected-id={station.id}
              data-map-selected-station-id={selected ? station.id : undefined}
              data-station-anchor-id={anchorId}
              className={`station-selected-indicator ${
                hasMultipleVisualAnchors ? "multi-anchor" : ""
              } ${selected ? "active" : ""} ${
                selected ? "foreground-flash-active" : ""
              }`}
              cx={point.x}
              cy={point.y}
              r={highlightRadius}
              pointerEvents="none"
            />
          )}
          <circle
            aria-hidden={anchorIndex === 0 ? undefined : true}
            aria-label={anchorIndex === 0 ? `${station.name} station details` : undefined}
            data-station-id={station.id}
            data-station-anchor-id={anchorId}
            data-station-primary-target={anchorIndex === 0 ? "true" : "false"}
            className={`station-hit-target ${
              hasMultipleVisualAnchors ? "multi-anchor" : ""
            } ${selected ? "selected" : ""} ${
              station.hasActiveImpact ? "has-impact" : ""
            } access-${station.accessStatus}`}
            cx={point.x}
            cy={point.y}
            r={hitRadius}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                // Pointer capture can fail if the browser ended the pointer first.
              }
            }}
            onPointerUp={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              if (shouldSuppressMapClick()) return;
              suppressNextMapClick();
              select();
            }}
            onClick={(event) => {
              // Primary mouse/touch activation is handled on pointerup because
              // browsers can drop the later synthesized click when the map camera
              // transform is committed between pointerdown and click.
              event.stopPropagation();
              if (event.detail !== 0 || shouldSuppressMapClick()) return;
              select();
            }}
            onKeyDown={(event) => {
              if (anchorIndex !== 0) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                select();
              }
            }}
            pointerEvents="all"
            role="button"
            tabIndex={anchorIndex === 0 ? 0 : -1}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </g>
  );
});

/**
 * TTC's station-name targets: pointer only, as on GO/UP (the station's own
 * target is its keyboard stop). Memoized, since nothing in them changes when
 * a station or alert is selected.
 */
export const TtcStationLabelTargets = memo(function TtcStationLabelTargets({
  stations,
  labelPolygons,
  mapRootRef,
  setHoveredStationLabelId,
  shouldSuppressMapClick,
  suppressNextMapClick,
  onSelectStationId,
}: {
  stations: readonly StationSummary[];
  labelPolygons: ReadonlyMap<string, readonly MapPoint[]>;
  mapRootRef: RefObject<HTMLElement | null>;
  setHoveredStationLabelId: Dispatch<SetStateAction<string | null>>;
  shouldSuppressMapClick: () => boolean;
  suppressNextMapClick: () => void;
  onSelectStationId: (stationId: string | null) => void;
}) {
  return stations.map((station) => {
    const labelPolygon = labelPolygons.get(station.id);
    if (!labelPolygon) return null;

    return (
      <polygon
        key={`station-label-target:${station.id}`}
        aria-hidden="true"
        data-station-label-id={station.id}
        className="station-label-hit-target"
        points={labelPolygon.map((point) => `${point.x},${point.y}`).join(" ")}
        focusable="false"
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          setMapStationHovered(mapRootRef.current, station.id, false);
          setHoveredStationLabelId(station.id);
        }}
        onPointerOver={(event) => {
          if (event.pointerType !== "mouse") return;
          setHoveredStationLabelId((current) => current === station.id ? current : station.id);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          setHoveredStationLabelId((current) => current === station.id ? null : current);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Pointer capture can fail if the browser ended the pointer first.
          }
        }}
        onPointerUp={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          try {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          } catch {
            // Pointer capture may already be released by the browser during cancellation.
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (shouldSuppressMapClick()) return;
          suppressNextMapClick();
          onSelectStationId(station.id);
        }}
        pointerEvents="all"
        vectorEffect="non-scaling-stroke"
      />
    );
  });
});
