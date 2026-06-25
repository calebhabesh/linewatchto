"use client";

import { Accessibility, MapPin, X } from "lucide-react";
import Image from "next/image";
import type { DashboardData } from "../app/DataContext";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import type { StationSummary } from "../app/station-data";
import { getSelectedImpactDetails } from "./MobileImpactInspector";
import { STATION_LINE_DEFINITIONS } from "../app/station-data";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import type { MapOverlapSelection } from "./map-overlap-badges";

type Props = {
  selection: ImpactSelection;
  overlapSelection: MapOverlapSelection | null;
  selectedStationId: string | null;
  stations: StationSummary[];
  onSelectImpact: (selection: ImpactSelection) => void;
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

function PortraitReorientationNote({ id }: { id: string }) {
  return (
    <span id={id} className="rotated-map-selection-details-note" data-portrait-reorientation-notice>
      Returns to portrait detail view
    </span>
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
      return "delay";
    case "reduced-speed-zone":
      return "rsz";
    case "planned-closure":
      return "planned";
  }
}

function getImpactLabel(kind: string) {
  if (kind === "suspension") return "active alert";
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
  overlapSelection,
  selectedStationId,
  stations,
  onSelectImpact,
  onOpenDetails,
  onClearSelection,
}: Props) {
  const data = useDashboardData();

  if (overlapSelection) {
    const impacts = overlapSelection.impacts
      .map((impact) => ({
        ...impact,
        details: getSelectedImpactDetails(impact.selection, data),
      }))
      .filter((impact) => impact.details);

    if (impacts.length === 0) return null;

    return (
      <section
        className="rotated-map-selection-card rotated-map-selection-card-overlap"
        data-rotated-map-selection-card
        data-selection-kind="overlap"
        aria-label="Overlapping map impacts"
      >
        <div className="rotated-map-selection-card-header">
          <div className="rotated-map-selection-card-title-group">
            <span className="rotated-map-selection-card-kicker">{toTitleCase("Overlapping Alerts")}</span>
            <h2>{toTitleCase(overlapSelection.label)}</h2>
          </div>
          <button type="button" className="rotated-map-selection-icon-button" aria-label="Clear selected map item" onClick={onClearSelection}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="rotated-map-overlap-choice-list" aria-label="Choose Impact">
          {impacts.map((impact) => {
            const details = impact.details;
            if (!details) return null;

            return (
              <button
                key={`${impact.selection.kind}-${impact.selection.id}`}
                type="button"
                className={`rotated-map-overlap-choice rotated-map-overlap-choice-${impact.selection.kind}`}
                onClick={() => onSelectImpact(impact.selection)}
              >
                <ImpactTypeIcon kind={impact.selection.kind} size={16} className="shrink-0" />
                <span className="rotated-map-overlap-choice-copy">
                  <span className="rotated-map-overlap-choice-title">{toTitleCase(details.title)}</span>
                  <span className="rotated-map-overlap-choice-meta">
                    {toTitleCase(details.categoryLabel)} / {toTitleCase(details.location)}
                  </span>
                </span>
                <span className="rotated-map-overlap-choice-action">Choose Impact</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

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

        <div className="flex flex-col gap-1.5">
          <div className="rotated-map-selection-card-meta">
            <LineBadge lineId={details.lineId} number={details.lineNumber} name={STATION_LINE_DEFINITIONS[details.lineId]?.name} />
          </div>
          <div className="rotated-map-selection-card-direction flex items-center gap-1.5 mt-0.5">
            <span aria-hidden="true"><ImpactTypeIcon kind={selection.kind} size={14} /></span>
            <span>{toTitleCase(details.categoryLabel)}</span>
          </div>
        </div>

        <p className="rotated-map-selection-card-location">{toTitleCase(details.location)}</p>
        {details.displayDirection ? <p className="rotated-map-selection-card-direction">{toTitleCase(details.displayDirection)}</p> : null}

        <div className="rotated-map-selection-card-actions">
          <button
            type="button"
            className="rotated-map-selection-action primary"
            aria-describedby="rotated-impact-details-orientation-note"
            onClick={onOpenDetails}
          >
            <MoreDetailsIcon size={15} />
            Details
          </button>
        </div>
        <PortraitReorientationNote id="rotated-impact-details-orientation-note" />
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
            <span className="rotated-map-selection-card-kicker flex items-center gap-1">
              <MapPin size={10} aria-hidden="true" />
              <span>{toTitleCase(station.interchange ? "Interchange" : "Station")}</span>
            </span>
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

        <div className="rotated-map-selection-card-actions">
          <button
            type="button"
            className="rotated-map-selection-action primary"
            aria-describedby="rotated-station-details-orientation-note"
            onClick={onOpenDetails}
          >
            <MoreDetailsIcon size={15} />
            Details
          </button>
        </div>
        <PortraitReorientationNote id="rotated-station-details-orientation-note" />
      </section>
    );
  }

  return null;
}
