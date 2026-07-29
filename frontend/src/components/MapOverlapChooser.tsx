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
}) {
  const data = useDashboardData();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const closingRef = useRef(false);
  const initialAnchorOffsetRef = useRef({
    x: layout.anchorOffsetX,
    y: layout.anchorOffsetY,
  });
  const orderedImpacts = [...impacts].sort(
    (a, b) => impactPriority(b.kind) - impactPriority(a.kind),
  );
  const chooserId = `overlap-chooser-${markerId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const stopChooserPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  useEffect(() => () => onHoverImpact(null), [onHoverImpact]);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() =>
      firstChoiceRef.current?.focus({ preventScroll: true }));
    if (reducedMotion) return () => window.cancelAnimationFrame(focusFrame);
    const initialAnchorOffset = initialAnchorOffsetRef.current;
    const animation = compactMotion
      ? surfaceRef.current?.animate([
          {
            borderRadius: "999px",
            opacity: 0.35,
            transform: `translate(${initialAnchorOffset.x}px, ${initialAnchorOffset.y}px) scale(0.12, 0.06)`,
          },
          { borderRadius: "20px", opacity: 1, offset: 0.62, transform: "scale(1.025, 0.98)" },
          { borderRadius: "14px", offset: 0.82, transform: "scale(0.99, 1.01)" },
          { borderRadius: "14px", opacity: 1, transform: "scale(1, 1)" },
        ], { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" })
      : surfaceRef.current?.animate([
          {
            borderRadius: "999px",
            filter: "blur(8px)",
            opacity: 0.28,
            transform: `translate(${initialAnchorOffset.x}px, ${initialAnchorOffset.y}px) scale(0.08, 0.04)`,
          },
          { borderRadius: "28px", filter: "blur(1px)", opacity: 1, offset: 0.56, transform: "scale(1.04, 0.96)" },
          { borderRadius: "14px", offset: 0.78, transform: "scale(0.975, 1.025)" },
          { borderRadius: "16px", filter: "blur(0)", opacity: 1, transform: "scale(1, 1)" },
        ], { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      animation?.cancel();
    };
  }, [compactMotion, reducedMotion]);

  const close = async (restoreFocus: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (!reducedMotion) {
      const animation = compactMotion
        ? surfaceRef.current?.animate([
            { borderRadius: "14px", opacity: 1, transform: "scale(1, 1)" },
            { borderRadius: "20px", offset: 0.34, transform: "scale(1.015, 0.97)" },
            {
              borderRadius: "999px",
              opacity: 0,
              transform: `translate(${layout.anchorOffsetX}px, ${layout.anchorOffsetY}px) scale(0.12, 0.06)`,
            },
          ], { duration: 200, easing: "cubic-bezier(0.7, 0, 0.84, 0)", fill: "forwards" })
        : surfaceRef.current?.animate([
            { borderRadius: "16px", filter: "blur(0)", opacity: 1, transform: "scale(1, 1)" },
            { borderRadius: "22px", offset: 0.32, transform: "scale(1.025, 0.96)" },
            {
              borderRadius: "999px",
              filter: "blur(8px)",
              opacity: 0,
              transform: `translate(${layout.anchorOffsetX}px, ${layout.anchorOffsetY}px) scale(0.08, 0.04)`,
            },
          ], { duration: 220, easing: "cubic-bezier(0.7, 0, 0.84, 0)", fill: "forwards" });
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
      style={{
        left: layout.left,
        top: layout.top,
        width: chooserSize.width,
        height: chooserSize.height,
      }}
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
                  <span>{formatLocation(details, label)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
