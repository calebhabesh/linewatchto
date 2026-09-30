"use client";

import { serviceEffectLabel } from "../app/alert-categories";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Construction, ExternalLink, X } from "lucide-react";
import type { DashboardData } from "../app/DataContext";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/commute-data";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { PlannedAdvisoryStatus } from "./PlannedAdvisoryStatus";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { relatedPlannedClosureId } from "../app/related-planned-closure";
import { CardSource, ImpactRouteHeader, LineBadge, MetadataGrid, RelatedPlannedClosureButton, CommutePathPreviewCardBanner } from "./ImpactCardFields";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import { DirectionalZoneCount } from "./DirectionalZoneCount";
import { reducedSpeedZoneResolutionEntries } from "../app/reduced-speed-zone-resolution";
import { ReducedSpeedZoneResolutionBreakdown } from "./ReducedSpeedZoneResolutionBreakdown";
import { reducedSpeedZoneTimingEntries } from "../app/reduced-speed-zone-timing";
import { ReducedSpeedZoneTimingBreakdown } from "./ReducedSpeedZoneTimingBreakdown";
import { getOverlappingImpactRefs, OverlappingImpactRefs } from "./ImpactOverlapRefs";

export type MobileInspectorDetent = "map-focus" | "details-focus";

type SelectedImpactDetails = {
  id: string;
  kind: ImpactKind;
  categoryLabel: string;
  tone: "suspension" | "delay" | "reduced-speed-zone" | "planned-closure";
  icon: ReactNode;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  displayDirection?: string | null;
  description?: string;
  source: string;
  shuttle?: boolean;
  nightly?: boolean;
  activeNow?: boolean;
  statusAction?: ReactNode;
  window?: string;
  closureDateLabel?: string;
  serviceEffect?: "suspension" | "delay" | "limited-service" | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  updatedAgo?: string | null;
  startedValue?: ReactNode;
  updatedValue?: ReactNode;
  cause?: string | null;
  resolution?: string | null;
  reason?: string | null;
  targetRemoval?: string | null;
  relatedPlannedClosureId?: string | null;
  leadingRows?: Array<{ label: string; value?: string | null }>;
  extraRows?: Array<{ label: string; labelSuffix?: ReactNode; value?: ReactNode }>;
  trailingRows?: Array<{ label: string; value?: ReactNode }>;
  segmentIds: string[];
};

type Props = {
  selection: NonNullable<ImpactSelection>;
  detent: MobileInspectorDetent;
  onChangeDetent: (detent: MobileInspectorDetent) => void;
  onUnfocus: () => void;
  onBack?: () => void;
  unfocusLabel?: string;
  onViewFullDetails: () => void;
  onSelectImpact: (selection: ImpactSelection) => void;
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
};

function formatSpeed(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.toLowerCase().includes("km/h") ? value : `${value} km/h`;
}

function formatClosureScheduleValue(value: string) {
  const normalized = value
    .replace(/\s*[–—]\s*/g, " – ")
    .replace(/\s+-\s+/g, " – ");

  return normalized
    .split(" – ")
    .map((part) =>
      part
        .replace(/([A-Za-z]{3},?)\s+([A-Za-z]{3})\s+(\d{1,2})/g, "$1\u00A0$2\u00A0$3")
        .replace(/([A-Za-z]{3})\s+(\d{1,2})/g, "$1\u00A0$2")
        .replace(/\s+·/g, "\u00A0·")
        .replace(/·\s+/g, "·\u00A0")
        .replace(/([A-Za-z]{3})\s+(\d{1,2}:\d{2})/g, "$1\u00A0$2")
        .replace(/(\d{1,2}:\d{2})\s+([AP]M)/g, "$1\u00A0$2")
    )
    .join(" – ");
}

function fallbackLineNumber(lineId: string) {
  return lineId.replace("line-", "");
}

export function getSelectedImpactDetails(
  selection: NonNullable<ImpactSelection>,
  data: Pick<DashboardData, "activeAlerts" | "delays" | "reducedSpeedZones" | "plannedClosures">,
  onSelectImpact?: (selection: ImpactSelection) => void,
): SelectedImpactDetails | null {
  if (selection.kind === "suspension") {
    const alert = data.activeAlerts.find((item) => item.id === selection.id);
    if (!alert) return null;
    return {
      id: alert.id,
      kind: "suspension",
      categoryLabel: "Suspension",
      tone: "suspension",
      icon: <AlertTriangle size={16} className="text-red-500" />,
      lineId: alert.lineId,
      lineNumber: alert.lineNumber,
      title: alert.title,
      location: alert.location,
      displayDirection: alert.displayDirection,
      description: alert.description,
      source: alert.source,
      shuttle: alert.shuttle,
      startedAt: alert.startedAt,
      updatedAt: alert.updatedAt,
      updatedAgo: alert.updatedAgo,
      cause: alert.cause,
      resolution: alert.resolution,
      reason: alert.reason,
      targetRemoval: alert.targetRemoval,
      relatedPlannedClosureId: relatedPlannedClosureId(alert, data.plannedClosures),
      segmentIds: alert.affectedSegmentIds ?? [],
    };
  }

  if (selection.kind === "delay") {
    const delay = data.delays.find((item) => item.id === selection.id);
    if (delay) {
      return {
        id: delay.id,
        kind: "delay",
        categoryLabel: serviceEffectLabel(delay),
        tone: "delay",
        icon: <DelayIcon size={16} className="delay-tone" />,
        lineId: delay.lineId,
        lineNumber: delay.lineNumber,
        title: delay.title,
        location: delay.location,
        displayDirection: delay.displayDirection,
        description: delay.description,
        source: delay.source,
        startedAt: delay.startedAt,
        updatedAt: delay.updatedAt,
        cause: delay.cause,
        shuttle: delay.shuttle,
        relatedPlannedClosureId: delay.relatedPlannedClosureId,
        segmentIds: delay.affectedSegmentIds ?? [],
      };
    }

    const alertDelay = data.activeAlerts.find((item) => item.id === selection.id && item.severity === "delay");
    if (!alertDelay) return null;
    return {
      id: alertDelay.id,
      kind: "delay",
      categoryLabel: "Delay",
      tone: "delay",
      icon: <DelayIcon size={16} className="delay-tone" />,
      lineId: alertDelay.lineId,
      lineNumber: alertDelay.lineNumber,
      title: alertDelay.title,
      location: alertDelay.location,
      displayDirection: alertDelay.displayDirection,
      description: alertDelay.description,
      source: alertDelay.source,
      shuttle: alertDelay.shuttle,
      startedAt: alertDelay.startedAt,
      updatedAt: alertDelay.updatedAt,
      updatedAgo: alertDelay.updatedAgo,
      cause: alertDelay.cause,
      resolution: alertDelay.resolution,
      reason: alertDelay.reason,
      targetRemoval: alertDelay.targetRemoval,
      relatedPlannedClosureId: relatedPlannedClosureId(alertDelay, data.plannedClosures),
      segmentIds: alertDelay.affectedSegmentIds ?? [],
    };
  }

  if (selection.kind === "reduced-speed-zone") {
    const zone = data.reducedSpeedZones.find((item) => item.id === selection.id);
    if (!zone) return null;
    const zonesAtLocation = countReducedSpeedZones([zone]);
    const isGroupedZone = zonesAtLocation > 1;
    const showResolutionBreakdown = zonesAtLocation > 1
      && reducedSpeedZoneResolutionEntries(zone).length > 0;
    return {
      id: zone.id,
      kind: "reduced-speed-zone",
      categoryLabel: "Reduced Speed Zone",
      tone: "reduced-speed-zone",
      icon: <Construction size={16} className="rsz-tone" />,
      lineId: zone.lineId,
      lineNumber: zone.lineNumber,
      title: zone.title,
      location: zone.location,
      displayDirection: zone.displayDirection,
      description: zone.description,
      source: zone.source,
      startedAt: zone.startedAt,
      updatedAt: zone.updatedAt,
      updatedAgo: zone.updatedAgo,
      startedValue: reducedSpeedZoneTimingEntries(zone, "startedAt").length > 0
        ? <ReducedSpeedZoneTimingBreakdown zone={zone} field="startedAt" />
        : undefined,
      updatedValue: reducedSpeedZoneTimingEntries(zone, "updatedAt").length > 0
        ? <ReducedSpeedZoneTimingBreakdown zone={zone} field="updatedAt" />
        : undefined,
      cause: zone.cause,
      resolution: isGroupedZone ? null : zone.resolution,
      reason: zone.reason,
      targetRemoval: isGroupedZone ? null : zone.targetRemoval,
      extraRows: [
        { label: "Reduced Speed", value: formatSpeed(zone.reducedSpeed) },
        {
          label: "Zone Count",
          labelSuffix: (
            <>
              <span className="rsz-zone-count-label-separator"> - </span>
              <span className="rsz-zone-count-label-total">{zonesAtLocation}</span>
            </>
          ),
          value: zonesAtLocation > 1 ? <DirectionalZoneCount zone={zone} /> : null,
        },
        ...(isGroupedZone ? [{
          label: "Est. Resolution",
          value: showResolutionBreakdown
            ? <ReducedSpeedZoneResolutionBreakdown zone={zone} />
            : zone.resolution || zone.targetRemoval || "TBD",
        }] : [{ label: "Typical Speed", value: formatSpeed(zone.averageSpeed) }]),
      ],
      trailingRows: isGroupedZone
        ? [{ label: "Typical Speed", value: formatSpeed(zone.averageSpeed) }]
        : undefined,
      segmentIds: zone.affectedSegmentIds ?? [],
    };
  }

  const activeClosure = data.activeAlerts.find((item) => item.id === selection.id);
  if (activeClosure) {
    const closure = data.plannedClosures.find(
      (c) => c.id === activeClosure.id || c.id === activeClosure.relatedPlannedClosureId,
    );
    const specificWindowLabel = closure?.activeNow
      ? closure.activeWindowLabel
      : closure?.nextWindowLabel;
    const specificWindowHeading = closure?.activeNow ? "Current window" : "Next window";
    const hasScheduleDetails = Boolean(
      closure?.windowHours || closure?.windowDates || specificWindowLabel,
    );

    return {
      id: activeClosure.id,
      kind: "planned-closure",
      categoryLabel: "Active Closure",
      tone: "suspension",
      icon: <AlertTriangle size={16} className="text-red-500" />,
      lineId: activeClosure.lineId,
      lineNumber: activeClosure.lineNumber,
      title: activeClosure.title,
      location: activeClosure.location,
      displayDirection: activeClosure.displayDirection,
      description: activeClosure.description,
      source: activeClosure.source,
      shuttle: activeClosure.shuttle,
      nightly: closure?.nightly,
      activeNow: true,
      window: closure?.window,
      serviceEffect: activeClosure.serviceEffect ?? closure?.serviceEffect,
      closureDateLabel: closure?.windowDates
        ? formatClosureScheduleValue(closure.windowDates)
        : undefined,
      startedAt: activeClosure.startedAt,
      updatedAt: activeClosure.updatedAt,
      updatedAgo: activeClosure.updatedAgo,
      cause: activeClosure.cause,
      resolution: activeClosure.resolution,
      reason: activeClosure.reason,
      targetRemoval: activeClosure.targetRemoval,
      leadingRows: closure ? [
        {
          label: "Advisory dates",
          value: closure.windowDates ? formatClosureScheduleValue(closure.windowDates) : null,
        },
        {
          label: "Advisory hours",
          value: closure.windowHours ? formatClosureScheduleValue(closure.windowHours) : null,
        },
        {
          label: specificWindowHeading,
          value: specificWindowLabel ? formatClosureScheduleValue(specificWindowLabel) : null,
        },
        {
          label: "Advisory window",
          value: hasScheduleDetails ? null : closure.window,
        },
      ] : undefined,
      trailingRows: [
        {
          label: "Status",
          value: (
            <span className="planned-closure-status-active">
              Active Now
            </span>
          ),
        },
      ],
      segmentIds: activeClosure.affectedSegmentIds ?? [],
    };
  }

  const closure = data.plannedClosures.find((item) => item.id === selection.id);
  if (!closure) return null;

  const activeAlert = data.activeAlerts.find(
    (alert) => alert.relatedPlannedClosureId === closure.id || (
      closure.activeNow && alert.id === closure.id
    ),
  );
  const activeDelay = data.delays.find(delay => delay.relatedPlannedClosureId === closure.id || (closure.activeNow && delay.id === closure.id));
  const currentImpact = activeDelay ?? activeAlert;
  const currentKind = activeDelay ? "delay" : "suspension";
  const specificWindowLabel = closure.activeNow
    ? closure.activeWindowLabel
    : closure.nextWindowLabel;
  const specificWindowHeading = closure.activeNow ? "Current window" : "Next window";
  const hasScheduleDetails = Boolean(
    closure.windowHours || closure.windowDates || specificWindowLabel,
  );

  return {
    id: closure.id,
    kind: "planned-closure",
    categoryLabel: closure.activeNow ? "Active Advisory Window" : "Planned Advisory",
    tone: "planned-closure",
    icon: <PlannedClosureIcon size={16} className="text-blue-500" />,
    lineId: closure.lineId,
    lineNumber: closure.lineNumber,
    title: closure.title,
    location: closure.location,
    displayDirection: closure.displayDirection,
    description: closure.description,
    source: closure.source,
    shuttle: closure.shuttle,
    nightly: closure.nightly,
    activeNow: closure.activeNow,
    window: closure.window,
    serviceEffect: closure.serviceEffect,
    closureDateLabel: closure.windowDates
      ? formatClosureScheduleValue(closure.windowDates)
      : undefined,
    startedAt: closure.startedAt,
    updatedAt: closure.updatedAt,
    updatedAgo: closure.updatedAgo,
    cause: closure.cause,
    resolution: closure.resolution,
    reason: closure.reason,
    targetRemoval: closure.targetRemoval,
    leadingRows: [
      {
        label: "Advisory dates",
        value: closure.windowDates ? formatClosureScheduleValue(closure.windowDates) : null,
      },
      {
        label: "Advisory hours",
        value: closure.windowHours ? formatClosureScheduleValue(closure.windowHours) : null,
      },
      {
        label: specificWindowHeading,
        value: specificWindowLabel ? formatClosureScheduleValue(specificWindowLabel) : null,
      },
      {
        label: "Advisory window",
        value: hasScheduleDetails ? null : closure.window,
      },
    ],
    statusAction: currentImpact && onSelectImpact ? (
          <button
            type="button"
            className={`planned-closure-status-button ${currentKind === "delay" ? "is-delay" : ""}`}
            onClick={() => onSelectImpact({ kind: currentKind, id: currentImpact.id })}
            aria-label="View current impact"
          >
            <ImpactTypeIcon kind={currentKind} size={13} />
            <span>Active Now</span>
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        ) : (
          <span className="planned-closure-status-inactive">
            <PlannedAdvisoryStatus closure={closure} />
          </span>
        ),
    segmentIds: closure.previewSegmentIds ?? [],
  };
}

function toneClassName(tone: SelectedImpactDetails["tone"]) {
  switch (tone) {
    case "suspension":
      return "mobile-impact-inspector-suspension";
    case "delay":
      return "mobile-impact-inspector-delay";
    case "reduced-speed-zone":
      return "mobile-impact-inspector-rsz";
    case "planned-closure":
      return "mobile-impact-inspector-planned";
  }
}

export function MobileImpactInspector({
  selection,
  detent,
  onChangeDetent,
  onUnfocus,
  onBack,
  unfocusLabel = "Unfocus impact",
  onViewFullDetails,
  onSelectImpact,
  commutePathPreview,
  onClearCommutePathPreview,
}: Props) {
  const data = useDashboardData();
  const inspectorRef = useRef<HTMLElement | null>(null);
  const details = getSelectedImpactDetails(selection, data, onSelectImpact);
  const expanded = detent === "details-focus";
  const showDetailedMetadata = expanded;
  const selectedDetailKey = details ? `${details.kind}:${details.id}` : "";

  useEffect(() => {
    if (!selectedDetailKey) return;

    const inspector = inspectorRef.current;
    const shell = inspector?.closest(".linewatch-shell") as HTMLElement | null;
    const heightProperty = "--mobile-impact-inspector-total-height";

    if (!inspector || !shell) return;

    const updateInspectorHeight = () => {
      if (detent === "details-focus") {
        shell.style.removeProperty(heightProperty);
        return;
      }
      const measuredHeight = Math.ceil(inspector.getBoundingClientRect().height);
      if (measuredHeight > 0) {
        shell.style.setProperty(heightProperty, `${measuredHeight}px`);
      }
    };

    updateInspectorHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateInspectorHeight);
      return () => {
        window.removeEventListener("resize", updateInspectorHeight);
        shell.style.removeProperty(heightProperty);
      };
    }

    const resizeObserver = new ResizeObserver(updateInspectorHeight);
    resizeObserver.observe(inspector);

    return () => {
      resizeObserver.disconnect();
      shell.style.removeProperty(heightProperty);
    };
  }, [detent, selectedDetailKey]);

  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }
  }, []);

  if (!details) return null;

  const overlappingImpacts = getOverlappingImpactRefs(
    { kind: details.kind, id: details.id, segmentIds: details.segmentIds },
    data,
  );

  const handleUnfocusClick = () => {
    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onUnfocus();
      setIsClosing(false);
    }, 380);
  };

  return (
    <aside
      ref={inspectorRef}
      className={`mobile-impact-inspector ${isClosing ? "mobile-impact-inspector-closing" : ""} ${toneClassName(details.tone)} mobile-impact-inspector-${detent}`}
      data-mobile-impact-inspector
      role="complementary"
      aria-label="Selected map impact details"
    >
      {commutePathPreview ? (
        <CommutePathPreviewCardBanner
          commutePathPreview={commutePathPreview}
          onClearCommutePathPreview={onClearCommutePathPreview}
          className="mobile-impact-inspector-commute-preview"
        />
      ) : null}

      <div className="mobile-impact-inspector-header">
        <div className="mobile-impact-inspector-title-row">
          <LineBadge lineId={details.lineId} lineNumber={details.lineNumber || fallbackLineNumber(details.lineId)} />
          <h2 className="mobile-impact-inspector-title">
            {details.icon}
            {details.categoryLabel}
          </h2>
        </div>
        <div className="mobile-impact-inspector-header-actions" role="group" aria-label="Impact navigation">
          {onBack ? (
            <button type="button" onClick={onBack} className="mobile-impact-inspector-icon-button" aria-label="Back to previous impact">
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" onClick={handleUnfocusClick} className="mobile-impact-inspector-icon-button" aria-label={unfocusLabel}>
            {unfocusLabel === "Unfocus impact" ? <X size={20} /> : <ArrowLeft size={20} />}
          </button>
        </div>
      </div>

      <div className="mobile-impact-inspector-scroll" key={selectedDetailKey}>
        <ImpactRouteHeader location={details.location} direction={details.displayDirection} />

        <div className="mobile-impact-inspector-badges">
          {details.statusAction}
          {details.relatedPlannedClosureId ? <RelatedPlannedClosureButton onClick={() => onSelectImpact({ kind: "planned-closure", id: details.relatedPlannedClosureId! })} /> : null}
          <CardSource source={details.source} />
          {details.nightly ? <span className="mobile-impact-inspector-badge nightly">Nightly</span> : null}
          {details.shuttle ? <span className="mobile-impact-inspector-badge shuttle">Shuttle</span> : null}
          {details.activeNow && !details.statusAction ? <span className="mobile-impact-inspector-badge active-now">Active Now</span> : null}
        </div>

        {selection.kind === "delay" || details.description ? (
          <div className="mobile-impact-inspector-description">
            {selection.kind === "delay" ? <strong>{details.title}</strong> : null}
            {details.description && (selection.kind !== "delay" || details.description !== details.title) ? <p>{details.description}</p> : null}
          </div>
        ) : null}

        <OverlappingImpactRefs
          overlaps={overlappingImpacts}
          onSelectImpact={onSelectImpact}
          label="Overlap:"
        />

        {showDetailedMetadata ? (
          <MetadataGrid
            className={`mobile-impact-inspector-metadata${selection.kind === "planned-closure" ? " planned-closure-metadata" : ""}`}
            cause={details.cause}
            resolution={details.resolution}
            reason={details.reason}
            targetRemoval={details.targetRemoval}
            startedAt={details.startedAt}
            updatedAt={details.updatedAt}
            updatedAgo={details.updatedAgo}
            startedValue={details.startedValue}
            updatedValue={details.updatedValue}
            leadingRows={details.leadingRows}
            extraRows={details.extraRows}
            trailingRows={details.trailingRows}
          />
        ) : null}
      </div>

      <div className="mobile-impact-inspector-actions">
        <button
          type="button"
          onClick={() => onChangeDetent(expanded ? "map-focus" : "details-focus")}
          className="mobile-impact-inspector-action secondary"
          aria-label={expanded ? "Show more map" : "Show more details"}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          {expanded ? "More Map" : "More Details"}
        </button>
        <button
          type="button"
          onClick={onViewFullDetails}
          className="mobile-impact-inspector-action primary"
        >
          <ExternalLink size={16} />
          View in List
        </button>
      </div>
    </aside>
  );
}
