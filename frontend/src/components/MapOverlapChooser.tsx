"use client";

import {
  useLayoutEffect,
  useRef,
  type PointerEvent,
} from "react";
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

export type MapOverlapChooserLayout = {
  left: number;
  top: number;
  anchorOffsetX: number;
  anchorOffsetY: number;
};

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
  const linePrefix = details.lineNumber ? `Line ${details.lineNumber}: ` : "";
  const direction = details.displayDirection?.trim();
  const directionSuffix = direction ? ` (${direction})` : "";
  return `${linePrefix}${details.location || fallbackLocation}${directionSuffix}`;
}

function typeLabel(
  kind: MapImpactKind,
  details: ReturnType<typeof getSelectedImpactDetails>,
): string {
  if (kind === "suspension") return details?.categoryLabel ?? "Suspension";
  if (kind !== "planned-closure") return impactKindLabel(kind);
  if (details?.categoryLabel === "Upcoming Closure") return "Planned Advisory";
  return details?.categoryLabel ?? "Planned Advisory";
}

export function MapOverlapChooser({
  markerId,
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
}: {
  markerId: string;
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
}) {
  const data = useDashboardData();
  const surfaceRef = useRef<HTMLDivElement>(null);
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
  const portalStyle = viewportOrientation === "rotated-landscape" && viewportSize
    ? {
        left: viewportSize.height - layout.top,
        top: layout.left,
        width: chooserSize.width,
        height: chooserSize.height,
        maxHeight: chooserSize.height,
        transform: "rotate(90deg)",
        transformOrigin: "top left",
      }
    : {
        left: layout.left,
        top: layout.top,
        width: chooserSize.width,
        height: chooserSize.height,
        maxHeight: chooserSize.height,
      };

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
                  <strong>{typeLabel(impact.kind, details)}</strong>
                  {impact.kind === "planned-closure" && details?.closureDateLabel ? (
                    <span className="overlap-chooser-choice-date">{details.closureDateLabel}</span>
                  ) : null}
                  <span className="overlap-chooser-choice-location">{formatLocation(details, label)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
