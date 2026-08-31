"use client";

import {
  useEffect,
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

export type MapOverlapChooserLayout = {
  left: number;
  top: number;
  anchorOffsetX: number;
  anchorOffsetY: number;
};

function impactPriority(kind: MapImpactKind): number {
  switch (kind) {
    case "suspension":
      return 4;
    case "planned-closure":
      return 3;
    case "delay":
      return 2;
    case "reduced-speed-zone":
      return 1;
  }
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
  const linePrefix = details.lineNumber ? `Line ${details.lineNumber}: ` : "";
  const direction = details.displayDirection?.trim();
  const directionSuffix = direction ? ` (${direction})` : "";
  return `${linePrefix}${details.location || fallbackLocation}${directionSuffix}`;
}

function typeLabel(
  kind: MapImpactKind,
  details: ReturnType<typeof getSelectedImpactDetails>,
): string {
  if (kind === "suspension") return details?.categoryLabel ?? "Active Alert";
  if (kind !== "planned-closure") return impactKindLabel(kind);
  if (details?.categoryLabel === "Upcoming Closure") return "Planned Closure";
  return details?.categoryLabel ?? "Planned Closure";
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
  const closingRef = useRef(false);
  const orderedImpacts = [...impacts].sort(
    (a, b) => impactPriority(b.kind) - impactPriority(a.kind)
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
        transform: "rotate(90deg)",
        transformOrigin: "top left",
      }
    : {
        left: layout.left,
        top: layout.top,
        width: chooserSize.width,
        height: chooserSize.height,
      };

  useEffect(() => () => onHoverImpact(null), [onHoverImpact]);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() =>
      firstChoiceRef.current?.focus({ preventScroll: true }));
    if (reducedMotion) {
      return () => window.cancelAnimationFrame(focusFrame);
    }
    const targetX = viewportOrientation === "rotated-landscape" ? 0 : layout.anchorOffsetX;
    const targetY = viewportOrientation === "rotated-landscape" ? 0 : layout.anchorOffsetY;
    const animation = surfaceRef.current?.animate([
      {
        borderRadius: "999px",
        opacity: 0,
        transform: `translate(${targetX}px, ${targetY}px) scale(0.14)`,
      },
      {
        borderRadius: "24px",
        opacity: 0.95,
        offset: 0.6,
        transform: `translate(${Math.round(targetX * 0.15)}px, ${Math.round(targetY * 0.15)}px) scale(0.88)`,
      },
      {
        borderRadius: "16px",
        opacity: 1,
        transform: "translate(0px, 0px) scale(1)",
      },
    ], {
      duration: compactMotion ? 200 : 250,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "both",
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      animation?.cancel();
    };
  }, [compactMotion, layout.anchorOffsetX, layout.anchorOffsetY, reducedMotion, viewportOrientation]);

  const close = async (restoreFocus: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (!reducedMotion) {
      const targetX = viewportOrientation === "rotated-landscape" ? 0 : layout.anchorOffsetX;
      const targetY = viewportOrientation === "rotated-landscape" ? 0 : layout.anchorOffsetY;
      const animation = surfaceRef.current?.animate([
        {
          borderRadius: "16px",
          opacity: 1,
          transform: "translate(0px, 0px) scale(1)",
        },
        {
          borderRadius: "28px",
          opacity: 0.85,
          offset: 0.4,
          transform: `translate(${Math.round(targetX * 0.38)}px, ${Math.round(targetY * 0.38)}px) scale(0.68)`,
        },
        {
          borderRadius: "999px",
          opacity: 0,
          transform: `translate(${targetX}px, ${targetY}px) scale(0.12)`,
        },
      ], {
        duration: compactMotion ? 190 : 230,
        easing: "cubic-bezier(0.35, 0, 0.65, 0.1)",
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
        data-overlap-chooser
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
        <div className="overlap-chooser-list">
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
