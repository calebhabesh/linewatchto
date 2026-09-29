"use client";

import { Accessibility, MapPin, X } from "lucide-react";
import Image from "next/image";
import type { DashboardData } from "../app/DataContext";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import type { StationSummary } from "../app/station-data";
import { getSelectedImpactDetails } from "./MobileImpactInspector";
import { STATION_LINE_DEFINITIONS } from "../app/station-data";
import { REGIONAL_ROUTE_DEFINITIONS } from "../app/regional-data";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { PhoneRotateLandscapeIcon } from "./MobileMapControls";
import { TransitLineBadge } from "./TransitLineBadge";

type Props = {
  selection: ImpactSelection;
  selectedStationId: string | null;
  stations: StationSummary[];
  onOpenDetails: () => void;
  onClearSelection: () => void;
};

type StationPreviewImpact = {
  kind: ImpactKind;
  cardId: string;
  title: string;
};

export function getLineDefinition(lineId: string) {
  const ttcLine = STATION_LINE_DEFINITIONS[lineId];
  if (ttcLine) {
    return {
      id: ttcLine.id,
      number: ttcLine.number,
      name: ttcLine.name,
      label: `Line ${ttcLine.number} ${ttcLine.name}`,
    };
  }
  const regionalLine = REGIONAL_ROUTE_DEFINITIONS.find((r) => r.id === lineId);
  if (regionalLine) {
    return {
      id: regionalLine.id,
      number: regionalLine.number,
      name: regionalLine.name,
      label: regionalLine.id === "regional-up" ? regionalLine.name : `${regionalLine.name} Line`,
    };
  }
  return null;
}

function MoreDetailsIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M8 12H8.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 12H16.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function DetailsAction({
  onOpenDetails,
}: {
  onOpenDetails: () => void;
}) {
  return (
    <div className="rotated-map-selection-action-column">
      <div className="rotated-map-selection-card-actions">
        <button
          type="button"
          className="rotated-map-selection-action primary rotated-map-selection-details-action"
          aria-label="Open details in portrait view"
          title="Opens portrait view"
          onClick={onOpenDetails}
        >
          <MoreDetailsIcon size={15} />
          <span>Details</span>
          <span className="rotated-map-selection-portrait-cue" aria-hidden="true">
            <PhoneRotateLandscapeIcon size={18} />
          </span>
        </button>
      </div>
    </div>
  );
}

function toTitleCase(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/\b[a-z]/gi, (char) => char.toUpperCase())
    .replace(/\bTmu\b/g, "TMU")
    .replace(/\bTo\b/g, "to")
    .replace(/\bAnd\b/g, "and")
    .replace(/\bOr\b/g, "or")
    .replace(/\bFor\b/g, "for")
    .replace(/\bThe\b/g, "the")
    .replace(/\bIn\b/g, "in")
    .replace(/\bOn\b/g, "on")
    .replace(/\bAt\b/g, "at")
    .replace(/\bBy\b/g, "by")
    .replace(/\bWith\b/g, "with")
    .replace(/\bA\b/g, "a")
    .replace(/\bAn\b/g, "an");
}

function LineBadge({ lineId, number, name, label }: { lineId: string; number?: string; name?: string; label?: string }) {
  const def = getLineDefinition(lineId);
  const lineNumber = number || def?.number || "";
  const lineName = name || def?.name || "";
  const displayLabel = label || def?.label || (lineName ? `Line ${lineNumber} ${lineName}` : `Line ${lineNumber}`);

  return (
    <span className="inline-flex min-h-8 max-w-full min-w-0 items-center gap-2 text-xs font-black">
      <TransitLineBadge lineId={lineId} lineNumber={lineNumber} lineName={lineName} size={32} />
      <span className="min-w-0 truncate">{displayLabel}</span>
    </span>
  );
}

function accessLabel(station: StationSummary) {
  if (station.accessStatus === "outage") return "accessibility outage";
  if (station.accessStatus === "advisory") return "accessibility advisory";
  return "accessibility normal";
}

function accessTone(station: StationSummary) {
  if (station.accessStatus === "outage") return "critical";
  if (station.accessStatus === "advisory") return "warning";
  return "normal";
}

function impactToneClass(kind: NonNullable<ImpactSelection>["kind"]) {
  switch (kind) {
    case "suspension":
      return "critical";
    case "delay":
      return "delay";
    case "reduced-speed-zone":
      return "rsz";
    case "planned-closure":
      return "planned";
  }
}

function getImpactLabel(kind: string) {
  if (kind === "suspension") return "suspension";
  if (kind === "delay") return "delay";
  if (kind === "reduced-speed-zone") return "reduced speed zone";
  if (kind === "planned-closure") return "planned advisory";
  return "suspension";
}

function stationPreviewImpactsFor(selectedStationId: string, data: DashboardData): StationPreviewImpact[] {
  const byKey = new Map<string, StationPreviewImpact>();

  for (const impact of data.stationNodeImpacts.filter((item) => item.stationId === selectedStationId)) {
    byKey.set(`${impact.kind}:${impact.cardId}`, {
      kind: impact.kind,
      cardId: impact.cardId,
      title: impact.title,
    });
  }

  for (const segment of data.networkSegments) {
    const touchesStation =
      segment.stationAId === selectedStationId ||
      segment.stationBId === selectedStationId;

    if (!touchesStation) continue;

    for (const impact of segment.impacts ?? []) {
      const key = `${impact.kind}:${impact.cardId}`;
      if (byKey.has(key)) continue;

      byKey.set(key, {
        kind: impact.kind,
        cardId: impact.cardId,
        title:
          getSelectedImpactDetails({ kind: impact.kind, id: impact.cardId }, data)?.title ??
          getImpactLabel(impact.kind),
      });
    }
  }

  return Array.from(byKey.values());
}

export function RotatedMapSelectionCard({
  selection,
  selectedStationId,
  stations,
  onOpenDetails,
  onClearSelection,
}: Props) {
  const data = useDashboardData();

  if (selection) {
    const details = getSelectedImpactDetails(selection, data);
    if (!details) return null;

    const tone = impactToneClass(selection.kind);

    return (
      <section
        className={`rotated-map-selection-card rotated-map-selection-card-with-action rotated-map-selection-card-${tone}`}
        data-rotated-map-selection-card
        data-selection-kind={selection.kind}
        aria-label="Selected map item"
      >
        <div className="rotated-map-selection-card-main">
          <div className="rotated-map-selection-card-header">
            <div className="rotated-map-selection-card-title-group">
              <span className="rotated-map-selection-card-kicker">{toTitleCase("Selected Service Impact")}</span>
              <h2>{toTitleCase(details.title)}</h2>
            </div>
            <button type="button" className="rotated-map-selection-icon-button rotated-map-selection-card-close" aria-label="Clear selected map item" onClick={onClearSelection}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="rotated-map-selection-card-meta">
              <LineBadge lineId={details.lineId} number={details.lineNumber} name={getLineDefinition(details.lineId)?.name} />
            </div>
            <div className="rotated-map-selection-card-direction flex items-center gap-1.5 mt-0.5">
              <span aria-hidden="true"><ImpactTypeIcon kind={selection.kind} size={14} /></span>
              <span>{toTitleCase(details.categoryLabel)}</span>
            </div>
          </div>

          <p className="rotated-map-selection-card-location">{toTitleCase(details.location)}</p>
          {details.displayDirection ? <p className="rotated-map-selection-card-direction">{toTitleCase(details.displayDirection)}</p> : null}
        </div>
        <DetailsAction onOpenDetails={onOpenDetails} />
      </section>
    );
  }

  if (selectedStationId) {
    const station = stations.find((item) => item.id === selectedStationId);
    if (!station) return null;

    const stationImpacts = stationPreviewImpactsFor(selectedStationId, data);

    return (
      <section
        className={`rotated-map-selection-card rotated-map-selection-card-with-action rotated-map-selection-card-station rotated-map-selection-card-${accessTone(station)}`}
        data-rotated-map-selection-card
        data-selection-kind="station"
        aria-label="Selected map item"
      >
        <div className="rotated-map-selection-card-main">
          <div className="rotated-map-selection-card-header">
            <div className="rotated-map-selection-card-title-group">
              <span className="rotated-map-selection-card-kicker flex items-center gap-1">
                <MapPin size={10} aria-hidden="true" />
                <span>{toTitleCase(station.interchange ? "Interchange" : "Station")}</span>
              </span>
              <h2>{toTitleCase(station.name)}</h2>
            </div>
            <button type="button" className="rotated-map-selection-icon-button rotated-map-selection-card-close" aria-label="Clear selected map item" onClick={onClearSelection}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="rotated-map-selection-card-meta flex-wrap gap-2">
            {station.lineIds.map((lineId) => {
              const lineDef = getLineDefinition(lineId);
              if (!lineDef) return null;
              return (
                <LineBadge
                  key={lineId}
                  lineId={lineId}
                  number={lineDef.number}
                  name={lineDef.name}
                  label={lineDef.label}
                />
              );
            })}
          </div>

          {stationImpacts.length > 0 && (
            <>
              <div className="rotated-map-selection-disruption mt-2">
                <Image
                  src="/assets/linewatch/exclaim-alert-white.svg"
                  alt=""
                  width={14}
                  height={14}
                  className="rotated-map-selection-disruption-alert-icon"
                  aria-hidden="true"
                />
                <span>Schedule May Be Disrupted</span>
              </div>
              <div className="rotated-map-selection-impact-icons" aria-label="Related service impact types">
                {stationImpacts.map((impact) => (
                  <span key={impact.cardId || impact.title} className="rotated-map-selection-impact-icon">
                    <ImpactTypeIcon kind={impact.kind} size={14} />
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {toTitleCase(getImpactLabel(impact.kind))}
                    </span>
                  </span>
                ))}
              </div>
            </>
          )}

          {stationImpacts.length === 0 && (
            <p className="rotated-map-selection-card-location">
              {toTitleCase("No active station impact shown on the map.")}
            </p>
          )}

          <p className="rotated-map-selection-card-direction">
            <Accessibility size={14} aria-hidden="true" />
            {toTitleCase(accessLabel(station))}
          </p>
        </div>
        <DetailsAction onOpenDetails={onOpenDetails} />
      </section>
    );
  }

  return null;
}
