"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";

import {
  findAlertBySegmentId,
  mapAsset,
  networkSegments,
  type ActiveAlert,
  type NetworkSegment,
  type PlannedClosure,
  type SegmentOverlay,
} from "./linewatch-data";

export function TransitMap({
  selectedAlert,
  selectedClosure,
  onSelectAlert,
  onSelectClosure,
}: {
  selectedAlert?: ActiveAlert;
  selectedClosure?: PlannedClosure;
  onSelectAlert: (alertId: string) => void;
  onSelectClosure: (closureId: string) => void;
}) {
  const [svgMarkup, setSvgMarkup] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [x, y, width, height] = mapAsset.viewBox;

  useEffect(() => {
    let cancelled = false;

    async function loadMap() {
      try {
        const response = await fetch(mapAsset.src);

        if (!response.ok) {
          throw new Error(`Map asset request failed with ${response.status}`);
        }

        const markup = await response.text();

        if (!cancelled) {
          setSvgMarkup(markup);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) {
          setLoadState("error");
        }
      }
    }

    loadMap();

    return () => {
      cancelled = true;
    };
  }, []);

  const overlaySegments = useMemo(() => {
    return networkSegments.filter((segment) => {
      const isClosurePreview = selectedClosure?.previewSegmentIds.includes(segment.id) ?? false;
      return segment.overlay !== "clear" || isClosurePreview;
    });
  }, [selectedClosure]);

  return (
    <div className="network-map asset-backed" aria-label="Clickable subway and LRT status map">
      <div className="asset-map-stage">
        <div
          aria-hidden="true"
          className="asset-svg-frame"
          dangerouslySetInnerHTML={svgMarkup ? { __html: svgMarkup } : undefined}
        />

        {loadState !== "ready" ? (
          <div className="asset-map-state" role="status">
            {loadState === "loading" ? "Loading TTC map" : "Map asset unavailable"}
          </div>
        ) : null}

        <svg
          className="asset-overlay-svg"
          viewBox={`${x} ${y} ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-labelledby="network-map-title network-map-desc"
        >
          <title id="network-map-title">Toronto subway and LRT status map</title>
          <desc id="network-map-desc">Line segments use red for suspended service and orange for delays.</desc>
          <g aria-label="Disruption overlays">
            {overlaySegments.map((segment) => (
              <OverlaySegment
                key={segment.id}
                segment={segment}
                selectedAlert={selectedAlert}
                selectedClosure={selectedClosure}
                onSelectAlert={onSelectAlert}
                onSelectClosure={onSelectClosure}
              />
            ))}
          </g>
        </svg>

        <div
          aria-hidden="true"
          className="asset-label-frame"
          dangerouslySetInnerHTML={svgMarkup ? { __html: svgMarkup } : undefined}
        />
      </div>
    </div>
  );
}

function OverlaySegment({
  segment,
  selectedAlert,
  selectedClosure,
  onSelectAlert,
  onSelectClosure,
}: {
  segment: NetworkSegment;
  selectedAlert?: ActiveAlert;
  selectedClosure?: PlannedClosure;
  onSelectAlert: (alertId: string) => void;
  onSelectClosure: (closureId: string) => void;
}) {
  const alert = segment.alertId ? findAlertBySegmentId(segment.id) : undefined;
  const isClosurePreview = selectedClosure?.previewSegmentIds.includes(segment.id) ?? false;
  const isSelectedAlert = Boolean(selectedAlert?.affectedSegmentIds.includes(segment.id));
  const visualState = segment.overlay !== "clear" ? segment.overlay : isClosurePreview ? "planned-preview" : "clear";

  if (visualState === "clear") {
    return null;
  }

  const handleSelect = () => {
    if (alert) {
      onSelectAlert(alert.id);
      return;
    }

    if (selectedClosure) {
      onSelectClosure(selectedClosure.id);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<SVGPathElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSelect();
    }
  };

  return (
    <path
      aria-label={alert ? `${alert.title}: ${segment.label}` : `${selectedClosure?.title}: ${segment.label}`}
      className={`asset-alert-path ${overlayClass(segment.overlay, isClosurePreview)} ${
        isSelectedAlert ? "selected" : ""
      }`}
      d={segment.pathD}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    />
  );
}

function overlayClass(overlay: SegmentOverlay, preview: boolean) {
  if (preview && overlay === "clear") {
    return "planned-preview";
  }

  return overlay;
}
