import { X } from "lucide-react";
import { REGIONAL_ROUTE_DEFINITIONS } from "../app/regional-data";
import type { StationSummary } from "../app/station-data";

export function RegionalStationDetailPanel({ station, onClose }: { station: StationSummary; onClose: () => void }) {
  const routes = REGIONAL_ROUTE_DEFINITIONS.filter((route) => station.lineIds.includes(route.id));
  return (
    <aside className="regional-station-detail panel" aria-label={`${station.name} regional station details`}>
      <button type="button" onClick={onClose} aria-label="Close regional station details"><X size={18} /></button>
      <span>Regional station</span>
      <h2>{station.name}</h2>
      <div className="regional-station-routes">
        {routes.map((route) => <b key={route.id} style={{ borderColor: route.color }}>{route.number} {route.name}</b>)}
      </div>
      <p>Fixture-backed station information for map and search development.</p>
      <em>Arrivals and accessibility details are unavailable in regional demo mode.</em>
    </aside>
  );
}
