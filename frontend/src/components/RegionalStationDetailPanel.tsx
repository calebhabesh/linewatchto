"use client";

import { AlertTriangle, Bookmark, ExternalLink, X } from "lucide-react";
import { useMemo } from "react";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { REGIONAL_ROUTE_DEFINITIONS } from "../app/regional-data";
import type { StationSummary } from "../app/station-data";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { TransitLineBadge } from "./TransitLineBadge";

type Props = {
  station: StationSummary;
  onClose: () => void;
  onSelectImpact: (selection: NonNullable<ImpactSelection>) => void;
  authenticated: boolean;
  saved: boolean;
  savePending: boolean;
  onToggleSaved: (stationId: string) => void;
  onRequestSignIn: () => void;
};

type RegionalStationImpact = {
  kind: ImpactKind;
  id: string;
  title: string;
};

export function RegionalStationDetailPanel({
  station,
  onClose,
  onSelectImpact,
  authenticated,
  saved,
  savePending,
  onToggleSaved,
  onRequestSignIn,
}: Props) {
  const dashboard = useDashboardData();
  const routes = REGIONAL_ROUTE_DEFINITIONS.filter((route) => station.lineIds.includes(route.id));
  const impacts = useMemo(() => {
    const related = new Map<string, RegionalStationImpact>();
    const add = (kind: ImpactKind, id: string, title: string) => {
      related.set(`${kind}:${id}`, { kind, id, title });
    };

    for (const impact of dashboard.stationNodeImpacts.filter((item) => item.stationId === station.id)) {
      add(impact.kind, impact.cardId, impact.title);
    }
    for (const segment of dashboard.networkSegments.filter(
      (item) => item.stationAId === station.id || item.stationBId === station.id,
    )) {
      for (const impact of segment.impacts ?? []) {
        const card =
          dashboard.activeAlerts.find((item) => item.id === impact.cardId)
          ?? dashboard.delays.find((item) => item.id === impact.cardId)
          ?? dashboard.plannedClosures.find((item) => item.id === impact.cardId)
          ?? dashboard.reducedSpeedZones.find((item) => item.id === impact.cardId);
        add(impact.kind, impact.cardId, card?.title ?? `${segment.label} impact`);
      }
    }
    return [...related.values()];
  }, [dashboard, station.id]);

  const toggleSaved = () => {
    if (!authenticated) {
      onRequestSignIn();
      return;
    }
    onToggleSaved(station.id);
  };

  return (
    <aside className="regional-station-detail panel" aria-label={`${station.name} regional station details`}>
      <header className="regional-station-detail-header">
        <div>
          <span>GO &amp; UP station</span>
          <h2>{station.name}</h2>
        </div>
        <div className="regional-station-detail-actions">
          <button
            type="button"
            onClick={toggleSaved}
            disabled={savePending}
            aria-pressed={saved}
            aria-label={`${saved ? "Remove" : "Save"} ${station.name} ${saved ? "from" : "to"} My Stations`}
          >
            <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close regional station details">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="regional-station-routes" aria-label="Regional rail corridors">
        {routes.map((route) => (
          <span key={route.id}>
            <TransitLineBadge
              lineId={route.id}
              lineNumber={route.number}
              lineName={route.name}
              size={28}
            />
            <b>{route.name}</b>
          </span>
        ))}
      </div>

      <section className="regional-station-impact-section" aria-label="Station service impacts">
        <h3><AlertTriangle size={16} /> Station Conditions</h3>
        {impacts.length > 0 ? (
          <ul>
            {impacts.map((impact) => (
              <li key={`${impact.kind}:${impact.id}`}>
                <button type="button" onClick={() => onSelectImpact({ kind: impact.kind, id: impact.id })}>
                  <ImpactTypeIcon kind={impact.kind} size={16} />
                  <span>{impact.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No synthetic station impacts in the current regional fixture.</p>
        )}
      </section>

      <section className="regional-station-unavailable" aria-label="Regional data availability">
        <strong>Realtime station data unavailable</strong>
        <p>
          Arrivals, accessibility details, and platform conditions are not available in regional demo mode.
        </p>
      </section>

      <div className="regional-station-official-links">
        <a href="https://www.gotransit.com/en/see-schedules" target="_blank" rel="noreferrer">
          GO schedules <ExternalLink size={14} />
        </a>
        {station.lineIds.includes("regional-up") ? (
          <a
            href="https://www.upexpress.com/en/up-express-stations/union-station/departures-and-schedules"
            target="_blank"
            rel="noreferrer"
          >
            UP schedules <ExternalLink size={14} />
          </a>
        ) : null}
      </div>
    </aside>
  );
}
