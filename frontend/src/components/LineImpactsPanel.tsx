"use client";

import { useEffect, useMemo, useState } from "react";
import { SurfaceNoticesPanel } from "./SurfaceNoticesPanel";
import { getSurfaceNotices, type SurfaceNoticeResponse } from "../app/surface-notice-data";
import { canonicalNoticeRoute, matchesNoticeFilters } from "../app/notice-filters";
import { Search, Megaphone } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
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

type LineImpactCategory = "all" | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "notices";
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
  notices: "Service Notices",
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
  const [noticesResponse, setNoticesResponse] = useState<SurfaceNoticeResponse | null>(null);
  useEffect(() => {
    if (dashboard.networkId !== "regional") return;
    let active = true;
    const load = async () => {
      const result = await getSurfaceNotices({ networkId: "regional" });
      if (active) setNoticesResponse(result.data);
    };
    void load();
    const interval = window.setInterval(load, 30_000);
    window.addEventListener("online", load);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("online", load); };
  }, [dashboard.networkId]);
  const lineNotices = useMemo(() => (noticesResponse?.fresh || noticesResponse?.savedAt ? noticesResponse.notices : [])
    .filter(notice => notice.routeIds.some(route => canonicalNoticeRoute(route) === canonicalNoticeRoute(line?.number ?? lineId.replace("regional-", "")))),
    [noticesResponse, line?.number, lineId]);
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
    notices: lineNotices.length,
  };
  const totalCount = counts.alerts + counts.delays + counts["reduced-speed-zones"] + counts.closures;
  const totalEntries = totalCount + counts.notices;
  const lineName = line?.name ?? transitLineName(lineId) ?? "Transit Line";
  const visibleCategories = (Object.keys(CATEGORY_LABELS) as Array<Exclude<LineImpactCategory, "all">>)
    .filter((key) => dashboard.networkId === "ttc" ? key !== "notices" : key !== "reduced-speed-zones");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchableItems = category === "alerts" ? lineAlerts
    : category === "delays" ? lineDelays
    : category === "reduced-speed-zones" ? lineZones
    : category === "closures" ? lineClosures
    : category === "notices" ? []
    : [...lineAlerts, ...lineDelays, ...lineZones, ...lineClosures];
  const visibleNoticeCount = category === "all" || category === "notices"
    ? lineNotices.filter(notice => matchesNoticeFilters(notice, { query }, Date.parse(noticesResponse?.generatedAt ?? ""))).length : 0;
  const visibleItemCount = searchableItems.filter((item) => matchesQuery(item, normalizedQuery)).length + visibleNoticeCount;
  const sharedProps = { selection, onSelectImpact, onFocusMap, initialLineId: lineId, embedded: true, showImpactTypeIndicator: true, externalQuery: query };
  const standardSort: ImpactListSort = sort === "location" ? "location" : "updated";

  return (
    <section className="panel line-impacts-panel min-w-0 border border-transparent rounded-2xl" data-line-impacts="true">
      <PanelHeader
        title={lineName}
        icon={<TransitLineBadge lineId={lineId} lineNumber={line?.number} lineName={line?.name} size={28} className="shrink-0" />}
        onBack={onBack}
        onClose={onClose}
        metadata={
          <span className="line-impact-total-badge shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">
            {totalCount} {totalCount === 1 ? "Service Impact" : "Service Impacts"}{counts.notices > 0 ? ` · ${counts.notices} ${counts.notices === 1 ? "Notice" : "Notices"}` : ""}
          </span>
        }
      />

      <div className="line-impact-category-filters" role="group" aria-label={`Filter ${lineName} impacts by alert type`}>
        <button type="button" data-category="all" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
          <span>All</span><strong>{totalEntries}</strong>
        </button>
        {visibleCategories.map((key) => (
          <button key={key} type="button" data-category={key} aria-pressed={category === key} onClick={() => setCategory(key)}>
            {key === "notices" ? <Megaphone size={16} /> : <ImpactTypeIcon kind={key === "alerts" ? "suspension" : key === "delays" ? "delay" : key === "reduced-speed-zones" ? "reduced-speed-zone" : "planned-closure"} size={16} />}
            <span>{CATEGORY_LABELS[key]}</span><strong>{counts[key]}</strong>
          </button>
        ))}
      </div>

      {totalEntries > 0 ? (
        <div className="impact-list-toolbar" aria-label={`Filter and sort ${lineName} impacts`}>
          <label className="impact-list-search">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">Filter {lineName} impacts</span>
            <input type="search" className="submenu-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={dashboard.networkId === "regional" ? "Search impacts and notices..." : "Filter Impacts..."} aria-label={`Filter ${lineName} impacts`} />
          </label>
          <div className="impact-list-selects">
            <ToolbarSelectMenu
              ariaLabel={`Sort ${lineName} impacts`}
              prefix="Sort"
              value={sort}
              options={[
                { value: "updated", label: dashboard.networkId === "regional" ? "Impacts first · Updated" : "Updated" },
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
            {totalEntries === 0 ? `No current impacts or notices on ${lineName}` : "No items match these filters"}
          </div>
        ) : (
          <>
            {(category === "all" || category === "alerts") && counts.alerts > 0 ? <ActiveAlertsPanel {...sharedProps} externalSort={standardSort} /> : null}
            {(category === "all" || category === "delays") && counts.delays > 0 ? <DelaysPanel {...sharedProps} externalSort={standardSort} /> : null}
            {(category === "all" || category === "reduced-speed-zones") && lineZones.length > 0 ? <ReducedSpeedZonesPanel {...sharedProps} externalSort={standardSort} /> : null}
            {(category === "all" || category === "closures") && counts.closures > 0 ? <PlannedClosuresPanel {...sharedProps} externalSort={sort === "type" ? "soonest" : standardSort} /> : null}
            {(category === "all" || category === "notices") && visibleNoticeCount > 0 ? (
              <div className="line-notice-section">
                <p className="px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400">Service Notices · Additional information; does not change line status</p>
                <SurfaceNoticesPanel networkId="regional" embeddedNotices={lineNotices} externalQuery={query}
                  externalSort={sort} savedAt={noticesResponse?.savedAt} onBack={() => {}} onClose={() => {}} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
