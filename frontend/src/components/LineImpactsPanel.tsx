"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Search, X } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import type { ImpactListSort } from "../app/impact-list-controls";
import { useImpactListView } from "../hooks/useImpactListView";
import { useDashboardData } from "../app/DataContext";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import { ImpactListViewToggle, ToolbarSelectMenu } from "./ImpactListToolbar";
import { TransitLineBadge, transitLineName } from "./TransitLineBadge";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { ActiveAlertsPanel } from "./ActiveAlertsPanel";
import { DelaysPanel } from "./DelaysPanel";
import { ReducedSpeedZonesPanel } from "./ReducedSpeedZonesPanel";
import { PlannedClosuresPanel } from "./PlannedClosuresPanel";

type LineImpactCategory = "all" | "alerts" | "delays" | "reduced-speed-zones" | "closures";
type LineImpactSort = "updated" | "type" | "location";

type Props = {
  lineId: string;
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  onBack?: () => void;
  onClose?: () => void;
  onFocusMap?: () => void;
};

const CATEGORY_LABELS: Record<Exclude<LineImpactCategory, "all">, string> = {
  alerts: "Active Alerts",
  delays: "Delays",
  "reduced-speed-zones": "Reduced Speed Zones",
  closures: "Planned Closures",
};

function matchesQuery(item: { title: string; location: string; description?: string; displayDirection?: string | null; cause?: string | null }, query: string) {
  if (!query) return true;
  return [item.title, item.location, item.description, item.displayDirection, item.cause]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

export function LineImpactsPanel({ lineId, selection, onSelectImpact, onBack, onClose, onFocusMap }: Props) {
  const dashboard = useDashboardData();
  const { viewMode, setViewMode } = useImpactListView();
  const line = dashboard.lineStatuses.find((candidate) => candidate.id === lineId);
  const [category, setCategory] = useState<LineImpactCategory>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LineImpactSort>("updated");

  const lineAlerts = useMemo(() => dashboard.activeAlerts.filter((item) => item.lineId === lineId), [dashboard.activeAlerts, lineId]);
  const lineDelays = useMemo(() => dashboard.delays.filter((item) => item.lineId === lineId), [dashboard.delays, lineId]);
  const lineZones = useMemo(() => dashboard.reducedSpeedZones.filter((item) => item.lineId === lineId), [dashboard.reducedSpeedZones, lineId]);
  const lineClosures = useMemo(() => dashboard.plannedClosures.filter((item) => item.lineId === lineId), [dashboard.plannedClosures, lineId]);
  const counts = {
    alerts: lineAlerts.length,
    delays: lineDelays.length,
    "reduced-speed-zones": countReducedSpeedZones(lineZones),
    closures: lineClosures.length,
  };
  const totalCount = counts.alerts + counts.delays + counts["reduced-speed-zones"] + counts.closures;
  const lineName = line?.name ?? transitLineName(lineId) ?? "Transit Line";
  const visibleCategories = (Object.keys(CATEGORY_LABELS) as Array<Exclude<LineImpactCategory, "all">>)
    .filter((key) => dashboard.networkId === "ttc" || key !== "reduced-speed-zones");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchableItems = category === "alerts" ? lineAlerts
    : category === "delays" ? lineDelays
    : category === "reduced-speed-zones" ? lineZones
    : category === "closures" ? lineClosures
    : [...lineAlerts, ...lineDelays, ...lineZones, ...lineClosures];
  const visibleItemCount = searchableItems.filter((item) => matchesQuery(item, normalizedQuery)).length;
  const sharedProps = { selection, onSelectImpact, onFocusMap, initialLineId: lineId, embedded: true, showImpactTypeIndicator: true, externalQuery: query };
  const standardSort: ImpactListSort = sort === "location" ? "location" : "updated";

  return (
    <section className="panel line-impacts-panel min-w-0 border border-transparent rounded-2xl" data-line-impacts="true">
      <div className="panel-heading @container border-b border-black/5 dark:border-white/5 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {onBack ? (
            <button type="button" onClick={onBack} className="p-1 sm:p-2 -ml-1.5 sm:ml-0 mr-1 sm:mr-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0" aria-label="Back">
              <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
            </button>
          ) : null}
          <TransitLineBadge lineId={lineId} lineNumber={line?.number} lineName={line?.name} size={30} className="shrink-0" />
          <h2 className="truncate py-0.5 text-base sm:text-xl font-bold leading-[1.35] text-slate-900 dark:text-white">{lineName}</h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="line-impact-total-badge shrink-0 rounded-full px-2 py-1 text-[9px] sm:text-xs font-bold">
            {totalCount} {totalCount === 1 ? "Service Impact" : "Service Impacts"}
          </span>
          {onClose ? (
            <button type="button" onClick={onClose} className="p-1 sm:p-2 -mr-1.5 sm:mr-0 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0" aria-label="Close">
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="line-impact-category-filters" role="group" aria-label={`Filter ${lineName} impacts by alert type`}>
        <button type="button" data-category="all" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
          <span>All</span><strong>{totalCount}</strong>
        </button>
        {visibleCategories.map((key) => (
          <button key={key} type="button" data-category={key} aria-pressed={category === key} onClick={() => setCategory(key)}>
            <ImpactTypeIcon kind={key === "alerts" ? "suspension" : key === "delays" ? "delay" : key === "reduced-speed-zones" ? "reduced-speed-zone" : "planned-closure"} size={16} />
            <span>{CATEGORY_LABELS[key]}</span><strong>{counts[key]}</strong>
          </button>
        ))}
      </div>

      {totalCount > 0 ? (
        <div className="impact-list-toolbar" aria-label={`Filter and sort ${lineName} impacts`}>
          <label className="impact-list-search">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">Filter {lineName} impacts</span>
            <input type="search" className="submenu-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter Impacts..." aria-label={`Filter ${lineName} impacts`} />
          </label>
          <div className="impact-list-selects">
            <ToolbarSelectMenu
              ariaLabel={`Sort ${lineName} impacts`}
              prefix="Sort"
              value={sort}
              options={[
                { value: "updated", label: "Updated" },
                { value: "type", label: "Alert Type" },
                { value: "location", label: "Location" },
              ]}
              onChange={setSort}
            />
            <ImpactListViewToggle noun={`${lineName} impacts`} viewMode={viewMode} onViewModeChange={setViewMode} />
          </div>
          <span className="sr-only" role="status">{visibleItemCount} matching impact cards</span>
        </div>
      ) : null}

      <div className={`line-impact-panel-stack ${visibleItemCount === 0 ? "is-empty" : ""}`}>
        {visibleItemCount === 0 ? (
          <div className="text-center py-6 text-sm text-slate-500 dark:text-slate-400 font-medium">
            {totalCount === 0 ? `No current impacts on ${lineName}` : "No line impacts match these filters"}
          </div>
        ) : (
          <>
            {(category === "all" || category === "alerts") && counts.alerts > 0 ? <ActiveAlertsPanel {...sharedProps} externalSort={standardSort} /> : null}
            {(category === "all" || category === "delays") && counts.delays > 0 ? <DelaysPanel {...sharedProps} externalSort={standardSort} /> : null}
            {(category === "all" || category === "reduced-speed-zones") && lineZones.length > 0 ? <ReducedSpeedZonesPanel {...sharedProps} externalSort={standardSort} /> : null}
            {(category === "all" || category === "closures") && counts.closures > 0 ? <PlannedClosuresPanel {...sharedProps} externalSort={sort === "type" ? "soonest" : standardSort} /> : null}
          </>
        )}
      </div>
    </section>
  );
}
