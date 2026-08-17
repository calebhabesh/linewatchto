"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, Construction, ExternalLink, X } from "lucide-react";
import type { DashboardData } from "../app/DataContext";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { CardSource, ImpactRouteHeader, LineBadge, MetadataGrid, RelatedPlannedClosureButton, CommutePathPreviewCardBanner } from "./ImpactCardFields";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import { DirectionalZoneCount } from "./DirectionalZoneCount";
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
  window?: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  updatedAgo?: string | null;
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
  return value
    .replace(/\s*[–—]\s*/g, " – ")
    .replace(/\s+-\s+/g, " – ");
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
      categoryLabel: "Active Alert",
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
      relatedPlannedClosureId: alert.relatedPlannedClosureId,
      segmentIds: alert.affectedSegmentIds ?? [],
    };
  }

  if (selection.kind === "delay") {
    const delay = data.delays.find((item) => item.id === selection.id);
    if (delay) {
      return {
        id: delay.id,
        kind: "delay",
        categoryLabel: "Delay",
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
      segmentIds: alertDelay.affectedSegmentIds ?? [],
    };
  }

  if (selection.kind === "reduced-speed-zone") {
    const zone = data.reducedSpeedZones.find((item) => item.id === selection.id);
    if (!zone) return null;
    const zonesAtLocation = countReducedSpeedZones([zone]);
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
      cause: zone.cause,
      resolution: zone.resolution,
      reason: zone.reason,
      targetRemoval: zone.targetRemoval,
      extraRows: [
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
        { label: "Reduced Speed", value: formatSpeed(zone.reducedSpeed) },
        { label: "Typical Speed", value: formatSpeed(zone.averageSpeed) },
      ],
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
      startedAt: activeClosure.startedAt,
      updatedAt: activeClosure.updatedAt,
      updatedAgo: activeClosure.updatedAgo,
      cause: activeClosure.cause,
      resolution: activeClosure.resolution,
      reason: activeClosure.reason,
      targetRemoval: activeClosure.targetRemoval,
      leadingRows: closure ? [
        {
          label: "Closure dates",
          value: closure.windowDates ? formatClosureScheduleValue(closure.windowDates) : null,
        },
        {
          label: "Closure hours",
          value: closure.windowHours ? formatClosureScheduleValue(closure.windowHours) : null,
        },
        {
          label: specificWindowHeading,
          value: specificWindowLabel ? formatClosureScheduleValue(specificWindowLabel) : null,
        },
        {
          label: "Closure window",
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
    categoryLabel: closure.activeNow ? "Active Closure Window" : "Planned Closure",
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
    startedAt: closure.startedAt,
    updatedAt: closure.updatedAt,
    updatedAgo: closure.updatedAgo,
    cause: closure.cause,
    resolution: closure.resolution,
    reason: closure.reason,
    targetRemoval: closure.targetRemoval,
    leadingRows: [
      {
        label: "Closure dates",
        value: closure.windowDates ? formatClosureScheduleValue(closure.windowDates) : null,
      },
      {
        label: "Closure hours",
        value: closure.windowHours ? formatClosureScheduleValue(closure.windowHours) : null,
      },
      {
        label: specificWindowHeading,
        value: specificWindowLabel ? formatClosureScheduleValue(specificWindowLabel) : null,
      },
      {
        label: "Closure window",
        value: hasScheduleDetails ? null : closure.window,
      },
    ],
    trailingRows: [
      {
        label: "Status",
        value: activeAlert && onSelectImpact ? (
          <button
            type="button"
            className="planned-closure-status-button"
            onClick={() => onSelectImpact({ kind: "suspension", id: activeAlert.id })}
            aria-label="View active alert"
          >
            <ImpactTypeIcon kind="suspension" size={13} />
            <span>Active Now</span>
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        ) : (
          <span className="planned-closure-status-inactive">
            {closure.activeNow ? "Active Now" : "Currently Inactive"}
          </span>
        ),
      },
    ],
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
        <button type="button" onClick={handleUnfocusClick} className="mobile-impact-inspector-icon-button" aria-label="Unfocus impact">
          <X size={20} />
        </button>
      </div>

      <div className="mobile-impact-inspector-scroll" key={selectedDetailKey}>
        <ImpactRouteHeader location={details.location} direction={details.displayDirection} />

        {details.description ? (
          <p className="mobile-impact-inspector-description">{details.description}</p>
        ) : null}

        <div className="mobile-impact-inspector-badges">
          <CardSource source={details.source} />
          {details.nightly ? <span className="mobile-impact-inspector-badge nightly">Nightly</span> : null}
          {details.shuttle ? <span className="mobile-impact-inspector-badge shuttle">Shuttle</span> : null}
          {details.activeNow ? <span className="mobile-impact-inspector-badge active-now">Active Now</span> : null}
        </div>

        <OverlappingImpactRefs
          overlaps={overlappingImpacts}
          onSelectImpact={onSelectImpact}
          label="Overlap:"
        />

        {showDetailedMetadata ? (
          <MetadataGrid
            className="mobile-impact-inspector-metadata"
            cause={details.cause}
            resolution={details.resolution}
            reason={details.reason}
            targetRemoval={details.targetRemoval}
            startedAt={details.startedAt}
            updatedAt={details.updatedAt}
            updatedAgo={details.updatedAgo}
            leadingRows={details.leadingRows}
            extraRows={[
              ...(details.relatedPlannedClosureId ? [{
                label: "Planned Closure",
                value: (
                  <RelatedPlannedClosureButton
                    onClick={() => onSelectImpact({ kind: "planned-closure", id: details.relatedPlannedClosureId! })}
                  />
                ),
              }] : []),
              ...(details.extraRows ?? []),
            ]}
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
