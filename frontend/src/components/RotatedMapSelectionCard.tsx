"use client";

import { Accessibility, MapPin, X } from "lucide-react";
import type { DashboardData } from "../app/DataContext";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import type { StationSummary } from "../app/station-data";
import { getSelectedImpactDetails } from "./MobileImpactInspector";
import { STATION_LINE_DEFINITIONS } from "../app/station-data";
import { ImpactTypeIcon } from "./ImpactTypeIcon";

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

export function MoreDetailsIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M8 12H8.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 12H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 12H16.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function toTitleCase(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/\b[a-z]/gi, (char) => char.toUpperCase())
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

function lineBadgeTextColor(lineId: string) {
  return lineId === "line-1" || lineId === "line-6" ? "#000000" : "#ffffff";
}

function LineBadge({ lineId, number, name }: { lineId: string; number: string; name?: string }) {
  const lineDef = STATION_LINE_DEFINITIONS[lineId];
  const color = lineDef?.color ?? "#64748b";
  const lineName = name || lineDef?.name || "";

  return (
    <span
      className="inline-flex min-h-8 max-w-full min-w-0 items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-black dark:border-white/10"
      style={{ backgroundColor: color, color: lineBadgeTextColor(lineId) }}
    >
      <span>{number}</span>
      {lineName ? <span className="min-w-0 truncate">{lineName}</span> : null}
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
      return "warning";
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
  if (kind === "planned-closure") return "planned closure";
  return "active alert";
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
        className={`rotated-map-selection-card rotated-map-selection-card-${tone}`}
        data-rotated-map-selection-card
        data-selection-kind={selection.kind}
        aria-label="Selected map item"
      >
        <div className="rotated-map-selection-card-header">
          <div className="rotated-map-selection-card-title-group">
            <span className="rotated-map-selection-card-kicker">{toTitleCase("Selected Service Impact")}</span>
            <h2>{toTitleCase(details.title)}</h2>
          </div>
          <button type="button" className="rotated-map-selection-icon-button" aria-label="Clear selected map item" onClick={onClearSelection}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="rotated-map-selection-card-meta flex-wrap gap-2">
          <LineBadge lineId={details.lineId} number={details.lineNumber} name={STATION_LINE_DEFINITIONS[details.lineId]?.name} />
          <span>{toTitleCase(details.categoryLabel)}</span>
          <span aria-hidden="true"><ImpactTypeIcon kind={selection.kind} size={14} /></span>
        </div>

        <p className="rotated-map-selection-card-location">{toTitleCase(details.location)}</p>
        {details.displayDirection ? <p className="rotated-map-selection-card-direction">{toTitleCase(details.displayDirection)}</p> : null}

        <div className="rotated-map-selection-card-actions">
          <button type="button" className="rotated-map-selection-action secondary" onClick={onClearSelection}>
            Clear
          </button>
          <button type="button" className="rotated-map-selection-action primary" onClick={onOpenDetails}>
            <MoreDetailsIcon size={15} />
            Details
          </button>
        </div>
      </section>
    );
  }

  if (selectedStationId) {
    const station = stations.find((item) => item.id === selectedStationId);
    if (!station) return null;

    const stationImpacts = stationPreviewImpactsFor(selectedStationId, data);

    return (
      <section
        className={`rotated-map-selection-card rotated-map-selection-card-station rotated-map-selection-card-${accessTone(station)}`}
        data-rotated-map-selection-card
        data-selection-kind="station"
        aria-label="Selected map item"
      >
        <div className="rotated-map-selection-card-header">
          <div className="rotated-map-selection-card-title-group">
            <span className="rotated-map-selection-card-kicker">{toTitleCase("Selected Station")}</span>
            <h2>{toTitleCase(station.name)}</h2>
          </div>
          <button type="button" className="rotated-map-selection-icon-button" aria-label="Clear selected map item" onClick={onClearSelection}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="rotated-map-selection-card-meta flex-wrap gap-2">
          {station.lineIds.map((lineId) => {
            const lineDef = STATION_LINE_DEFINITIONS[lineId];
            if (!lineDef) return null;
            return (
              <LineBadge
                key={lineId}
                lineId={lineId}
                number={lineDef.number}
                name={lineDef.name}
              />
            );
          })}
        </div>

        <div className="rotated-map-selection-card-station-type flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-bold mt-1">
          <MapPin size={14} aria-hidden="true" />
          <span>{toTitleCase(station.interchange ? "Interchange" : "Station")}</span>
        </div>

        {stationImpacts.length > 0 && (
          <div className="rotated-map-selection-disruption flex items-center gap-2 mt-2">
            <span className="shrink-0">
              <ImpactTypeIcon kind={stationImpacts[0]?.kind ?? "delay"} size={14} />
            </span>
            <span>Schedule May Be Disrupted</span>
          </div>
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

        <div className="rotated-map-selection-card-actions">
          <button type="button" className="rotated-map-selection-action secondary" onClick={onClearSelection}>
            Clear
          </button>
          <button type="button" className="rotated-map-selection-action primary" onClick={onOpenDetails}>
            <MoreDetailsIcon size={15} />
            Details
          </button>
        </div>
      </section>
    );
  }

  return null;
}
