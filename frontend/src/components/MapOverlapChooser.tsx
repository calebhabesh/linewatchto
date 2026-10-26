"use client";

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useAlertChooserDismissal } from "../hooks/useAlertChooserDismissal";
import { IncidentStationSpan } from "./IncidentStationSpan";
import { X } from "lucide-react";
import type {
  ImpactSelection,
  MapImpact,
  MapImpactKind,
} from "../app/linewatch-data";
import { useDashboardData } from "../app/DataContext";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { getSelectedImpactDetails } from "./MobileImpactInspector";
import type { MapViewportOrientation } from "../hooks/panZoomMath";
import { useRotatedListDragScroll } from "../hooks/useRotatedListDragScroll";
import { getImpactPriority } from "../app/map-alert-selector";
import {
  REGIONAL_ROUTE_CARDINAL_DIRECTIONS,
  REGIONAL_ROUTE_DEFINITIONS,
} from "../app/regional-data";
import { transitLineName } from "./TransitLineBadge";
import type { ChooserFollowAnchor, MapChooserFollower } from "./map-chooser-follow";

export type MapOverlapChooserLayout = {
  left: number;
  top: number;
  anchorOffsetX: number;
  anchorOffsetY: number;
};

/**
 * Positions a chooser portal at its solved layout and hands it to the map's
 * follower, which owns the portal's `transform`: it keeps the card on its
 * badge while the camera moves and glides it when a new layout lands.
 */
export function useFollowedChooserPortal({
  follower,
  followAnchor,
  layout,
  size,
  viewportOrientation,
  viewportSize,
  reducedMotion,
}: {
  follower: MapChooserFollower;
  followAnchor: ChooserFollowAnchor;
  layout: { left: number; top: number };
  size: { width: number; height: number };
  viewportOrientation: MapViewportOrientation;
  viewportSize?: { width: number; height: number };
  reducedMotion: boolean;
}): { attachPortal: (element: HTMLDivElement | null) => void; portalStyle: CSSProperties } {
  const rotated = viewportOrientation === "rotated-landscape" && Boolean(viewportSize);
  const left = rotated && viewportSize ? viewportSize.height - layout.top : layout.left;
  const top = rotated ? layout.left : layout.top;
  const effectiveOrientation: MapViewportOrientation = rotated ? "rotated-landscape" : "standard";

  useLayoutEffect(() => {
    follower.place({ x: left, y: top }, followAnchor, effectiveOrientation, reducedMotion);
  }, [effectiveOrientation, followAnchor, follower, left, reducedMotion, top]);

  return {
    attachPortal: follower.attach,
    portalStyle: {
      left,
      top,
      width: size.width,
      height: size.height,
      maxHeight: size.height,
      ...(rotated ? { transformOrigin: "top left" } : null),
    },
  };
}

function impactKindLabel(kind: MapImpactKind): string {
  switch (kind) {
    case "suspension":
      return "Suspension";
    case "planned-closure":
      return "Active Closure";
    case "delay":
      return "Delay";
    case "reduced-speed-zone":
      return "Reduced Speed Zone";
  }
}

function formatLocation(
  details: ReturnType<typeof getSelectedImpactDetails>,
  fallbackLocation: string,
): string {
  if (!details) return fallbackLocation;
  if (details.lineId.startsWith("regional-")) {
    const lineName = transitLineName(details.lineId) ?? details.lineNumber;
    const lineLabel = details.lineId === "regional-up" ? lineName : `${lineName} Line`;
    return `${lineLabel}: ${details.location || fallbackLocation}`;
  }
  const linePrefix = details.lineNumber ? `Line ${details.lineNumber}: ` : "";
  return `${linePrefix}${details.location || fallbackLocation}`;
}

function formatDirection(
  details: ReturnType<typeof getSelectedImpactDetails>,
): string | null {
  const explicitDirection = details?.displayDirection?.trim();
  if (explicitDirection) return explicitDirection;
  if (!details?.lineId.startsWith("regional-")) return null;

  const route = REGIONAL_ROUTE_DEFINITIONS.find(({ id }) => id === details.lineId);
  const direction = route ? REGIONAL_ROUTE_CARDINAL_DIRECTIONS[route.number] : null;
  return direction?.replace(/\s*\/\s*/g, " & ") ?? null;
}

function typeLabel(
  kind: MapImpactKind,
  details: ReturnType<typeof getSelectedImpactDetails>,
): string {
  if (kind === "suspension" || kind === "delay") return details?.categoryLabel ?? impactKindLabel(kind);
  if (kind !== "planned-closure") return impactKindLabel(kind);
  if (details?.categoryLabel === "Upcoming Closure") return "Planned Advisory";
  return details?.categoryLabel ?? "Planned Advisory";
}

export function MapOverlapChooser({
  markerId,
  selectionKey,
  label,
  impacts,
  chooserSize,
  collisionAvoided,
  layout,
  onSelectImpact,
  onHoverImpact,
  onClose,
  reducedMotion,
  compactMotion,
  viewportOrientation = "standard",
  viewportSize,
  follower,
  followAnchor,
}: {
  markerId: string;
  selectionKey?: string | null;
  label: string;
  impacts: MapImpact[];
  chooserSize: { width: number; height: number };
  collisionAvoided: boolean;
  layout: MapOverlapChooserLayout;
  onSelectImpact: (selection: ImpactSelection) => void;
  onHoverImpact: (impact: MapImpact | null) => void;
  onClose: (restoreFocus: boolean) => void;
  reducedMotion: boolean;
  compactMotion: boolean;
  viewportOrientation?: MapViewportOrientation;
  viewportSize?: { width: number; height: number };
  follower: MapChooserFollower;
  followAnchor: ChooserFollowAnchor;
}) {
  const data = useDashboardData();
  const surfaceRef = useRef<HTMLDivElement>(null);
  useAlertChooserDismissal(selectionKey, onClose);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const initialFocusPendingRef = useRef(true);
  const closingRef = useRef(false);
  const isRotated = viewportOrientation === "rotated-landscape";
  const { scrollContainerProps } = useRotatedListDragScroll(isRotated);
  const orderedImpacts = [...impacts].sort(
    (a, b) => getImpactPriority(b.kind) - getImpactPriority(a.kind)
      || a.cardId.localeCompare(b.cardId),
  );
  const chooserId = `overlap-chooser-${markerId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const stopChooserPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };
  const { attachPortal, portalStyle } = useFollowedChooserPortal({
    follower,
    followAnchor,
    layout,
    size: chooserSize,
    viewportOrientation,
    viewportSize,
    reducedMotion,
  });

  useLayoutEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      firstChoiceRef.current?.focus({ preventScroll: true });
      initialFocusPendingRef.current = false;
    });
    const animation = reducedMotion ? undefined : surfaceRef.current?.animate([
      { opacity: 0, transform: "scale(0.98)" },
      { opacity: 1, transform: "scale(1)" },
    ], {
      duration: compactMotion ? 100 : 140,
      easing: "ease-out",
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      animation?.cancel();
    };
  }, [compactMotion, reducedMotion]);

  const close = async (restoreFocus: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (!reducedMotion) {
      const animation = surfaceRef.current?.animate([
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.98)" },
      ], {
        duration: compactMotion ? 70 : 100,
        easing: "ease-in",
        fill: "forwards",
      });
      try {
        await animation?.finished;
      } catch {
        // A replaced animation should still close the chooser.
      }
    }
    onClose(restoreFocus);
  };

  return (
    <div
      id={chooserId}
      ref={attachPortal}
      className="overlap-chooser-portal overlap-chooser-object open"
      style={portalStyle}
      data-overlap-chooser-collision-avoided={collisionAvoided ? "true" : "false"}
    >
      <div
        ref={surfaceRef}
        className="overlap-chooser-surface"
        style={{ maxHeight: chooserSize.height }}
        data-overlap-chooser
        data-map-wheel-scroll-region
        role="dialog"
        aria-label={`Choose Alert on ${label}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={stopChooserPointerDown}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          void close(true);
        }}
      >
        <div className="overlap-chooser-header">
          <div className="overlap-chooser-header-title">
            <span className="overlap-chooser-header-count" aria-label={`${impacts.length} overlapping alerts`}>
              {impacts.length}
            </span>
            <strong>Choose Alert</strong>
          </div>
          <button type="button" className="overlap-chooser-close" aria-label="Close alert chooser" onClick={() => void close(true)}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="overlap-chooser-list" {...scrollContainerProps}>
          {orderedImpacts.map((impact, index) => {
            const details = getSelectedImpactDetails({ kind: impact.kind, id: impact.cardId }, data);
            const isRegional = details?.lineId.startsWith("regional-");
            const dateLabel = details?.closureDateLabel || (isRegional ? details?.window?.trim() : undefined);
            const directionLabel = formatDirection(details);
            return (
              <button
                key={`${impact.kind}-${impact.cardId}`}
                ref={index === 0 ? firstChoiceRef : undefined}
                type="button"
                className={`overlap-chooser-choice ${impact.kind}`}
                data-overlap-choice-kind={impact.kind}
                data-overlap-choice-id={impact.cardId}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "mouse") return;
                  onHoverImpact(impact);
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType !== "mouse") return;
                  onHoverImpact(null);
                }}
                onFocus={(event) => {
                  if (!initialFocusPendingRef.current && event.currentTarget.matches(":focus-visible")) {
                    onHoverImpact(impact);
                  }
                }}
                onBlur={() => onHoverImpact(null)}
                onClick={() => {
                  onHoverImpact(null);
                  onClose(false);
                  onSelectImpact({ kind: impact.kind, id: impact.cardId });
                }}
              >
                <span className={`overlap-chooser-choice-icon ${impact.kind}`}>
                  <ImpactTypeIcon kind={impact.kind} size={26} />
                </span>
                <span className="overlap-chooser-choice-copy">
                  <strong>{typeLabel(impact.kind, details)}{impact.kind === "planned-closure" && details?.serviceEffect ? (
                    <span className="overlap-chooser-choice-effect"><span aria-hidden="true"> · </span>{details.serviceEffect === "limited-service" ? "Limited Service" : details.serviceEffect === "suspension" ? "Closure" : "Delay"}</span>
                  ) : null}</strong>
                  {impact.kind === "planned-closure" && dateLabel ? (
                    <span className="overlap-chooser-choice-date">{dateLabel}{details?.closureTimeLabel ? <><span className="sr-only">, </span><span className="overlap-chooser-choice-time">{details.closureTimeLabel}</span></> : null}</span>
                  ) : null}
                  <span className="overlap-chooser-choice-location"><IncidentStationSpan location={formatLocation(details, label)} direction={directionLabel} />{directionLabel ? <span className="overlap-chooser-choice-direction"> {directionLabel}</span> : null}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
