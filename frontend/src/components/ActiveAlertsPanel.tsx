"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import { AlertTriangle, Bus } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import type { ActiveAlert, ImpactKind, ImpactSelection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import { useScrollSelectedImpactCard } from "../hooks/useScrollSelectedImpactCard";
import { LineBadge, ImpactRouteHeader, MetadataGrid, CardSource, JumpToLocationIcon, RelatedPlannedClosureButton, CommutePathPreviewCardBanner } from "./ImpactCardFields";
import { getOverlappingImpactRefs, OverlappingImpactRefs } from "./ImpactOverlapRefs";
import { filterAndSortImpacts, type ImpactListSort } from "../app/impact-list-controls";
import { ImpactListToolbar } from "./ImpactListToolbar";
import { dashboardImpactSourcesLabel } from "../app/dashboard-source-label";
import { CompactImpactListItem, CompactImpactTimeValue } from "./CompactImpactListItem";
import { useImpactListView } from "../hooks/useImpactListView";
import { ImpactTypeIcon } from "./ImpactTypeIcon";

interface Props {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  onBack?: () => void;
  onClose?: () => void;
  onFocusMap?: () => void;
  initialLineId?: string | null;
  embedded?: boolean;
  externalQuery?: string;
  externalSort?: ImpactListSort;
  showImpactTypeIndicator?: boolean;
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
}

function impactKindForAlert(alert: ActiveAlert): ImpactKind {
  switch (alert.severity) {
    case "delay":
      return "delay";
    default:
      return "suspension";
  }
}

export function ActiveAlertsPanel({
  selection,
  onSelectImpact,
  onBack,
  onClose,
  onFocusMap,
  initialLineId,
  embedded = false,
  externalQuery,
  externalSort,
  showImpactTypeIndicator = false,
  commutePathPreview,
  onClearCommutePathPreview,
}: Props) {
  const dashboard = useDashboardData();
  const { activeAlerts, reducedSpeedZones, delays, plannedClosures, networkSegments, stationNodeImpacts } = dashboard;
  const [lineId, setLineId] = useState(initialLineId ?? "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ImpactListSort>("updated");
  const { viewMode, setViewMode } = useImpactListView();
  const effectiveQuery = externalQuery ?? query;
  const effectiveSort = externalSort ?? sort;
  const visibleAlerts = useMemo(() => filterAndSortImpacts(activeAlerts, { lineId, query: effectiveQuery, sort: effectiveSort }), [activeAlerts, lineId, effectiveQuery, effectiveSort]);
  const lineIds = useMemo(() => [...new Set(activeAlerts.map((alert) => alert.lineId))].sort(), [activeAlerts]);
  useScrollSelectedImpactCard(selection, "suspension");

  if (embedded && visibleAlerts.length === 0) return null;

  const handleAlertClick = (alert: ActiveAlert) => {
    const alertImpactKind = impactKindForAlert(alert);
    const isActive = selection?.id === alert.id && selection?.kind === alertImpactKind;
    const isActivating = !isActive;
    if (!isActivating && onFocusMap) {
      onFocusMap();
      return;
    }
    
    onSelectImpact(
      isActivating ? { kind: alertImpactKind, id: alert.id } : null
    );
    
    if (isActivating && onFocusMap) {
      onFocusMap();
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "suspension":
        return "suspension-card-border";
      case "planned":
        return "planned-closure-card-border";
      case "delay":
        return "delay-card-border";
      case "rsz":
      case "reduced-speed-zone":
        return "rsz-card-border";
      default:
        return "suspension-card-border";
    }
  };

  const getSeverityShadow = (severity: string) => {
    switch (severity) {
      case "suspension":
      case "planned":
        return "shadow-[inset_2px_0_6px_-2px_rgba(239,68,68,0.2)]";
      case "delay":
        return "shadow-[inset_2px_0_6px_-2px_rgba(254,236,65,0.18)]";
      default:
        return "shadow-[inset_2px_0_6px_-2px_rgba(100,116,139,0.2)]";
    }
  };

  return (
    <section className={`panel min-w-0 border border-transparent rounded-2xl ${embedded ? "embedded-impact-panel" : ""}`}>
      <PanelHeader
        title="Active Alerts"
        icon={<AlertTriangle className="w-5 h-5 text-red-500 shrink-0" aria-hidden="true" />}
        onBack={onBack}
        onClose={onClose}
        metadata={
          <>
            <span className="panel-header-badge alert-count-badge shrink-0">
              {activeAlerts.length} {activeAlerts.length === 1 ? "Alert" : "Alerts"}
            </span>
            <CardSource source={dashboardImpactSourcesLabel(dashboard, activeAlerts.map((alert) => alert.source))} />
          </>
        }
      />
      {activeAlerts.length > 0 ? (
        <ImpactListToolbar
          noun="active alerts"
          totalCount={activeAlerts.length}
          visibleCount={visibleAlerts.length}
          lineIds={lineIds}
          lineCounts={Object.fromEntries(lineIds.map((id) => [id, filterAndSortImpacts(activeAlerts, { lineId: id, query: effectiveQuery, sort: effectiveSort }).length]))}
          lineId={lineId}
          onLineIdChange={setLineId}
          query={query}
          onQueryChange={setQuery}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "updated", label: "Updated" },
            { value: "line", label: "Line" },
            { value: "location", label: "Location" },
          ]}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      ) : null}
      <div className={`alert-stack min-w-0 p-3 flex flex-col gap-2 ${viewMode === "list" ? "is-list-view" : ""} ${visibleAlerts.length === 0 ? "is-empty" : ""}`}>
        {visibleAlerts.length === 0 ? (
          <div className="text-center py-4 text-sm text-slate-500 dark:text-slate-400 font-medium">
            {activeAlerts.length === 0 ? "No Active Alerts" : "No active alerts match these filters"}
          </div>
        ) : (
          visibleAlerts.map((alert) => {
            const alertImpactKind = impactKindForAlert(alert);
            const isActive = selection?.id === alert.id && selection?.kind === alertImpactKind;
            const overlappingImpacts = getOverlappingImpactRefs(
              { kind: alertImpactKind, id: alert.id, segmentIds: alert.affectedSegmentIds ?? [] },
              { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts },
            );

            if (viewMode === "list") {
              return (
                <CompactImpactListItem
                  hideTypeLabel={!showImpactTypeIndicator}
                  key={alert.id}
                  impactId={alert.id}
                  lineId={alert.lineId}
                  lineNumber={alert.lineNumber}
                  title={alert.title}
                  location={alert.location}
                  direction={alert.displayDirection}
                  facts={[
                    ...(alert.cause ? [{ column: 1 as const, label: "Cause", value: alert.cause }] : []),
                    { column: 2, label: "Started", value: <CompactImpactTimeValue timestamp={alert.startedAt} /> },
                    { column: 3, label: "Updated", value: <CompactImpactTimeValue timestamp={alert.updatedAt} fallback={alert.updatedAgo} /> },
                    ...(alert.resolution ? [{ column: 4 as const, label: "Est. Resolution", value: alert.resolution }] : []),
                  ]}
                  status={alert.shuttle ? <><Bus size={11} /> Shuttle</> : null}
                  active={isActive}
                  toneClassName={getSeverityColor(alert.severity)}
                  onShowOnMap={() => handleAlertClick(alert)}
                />
              );
            }

            return (
              <div
                key={alert.id}
                data-impact-card-id={alert.id}
                className={`alert-card min-w-0 w-full text-left p-3 rounded-lg ${getSeverityColor(
                  alert.severity
                )} transition-all ${
                  isActive ? "!bg-blue-50 dark:!bg-blue-950 is-active" : ""
                }`}
              >
                <div className="impact-card-heading has-status-badges flex items-start justify-between gap-3 w-full min-w-0">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <LineBadge lineId={alert.lineId} lineNumber={alert.lineNumber} />
                    {showImpactTypeIndicator ? <ImpactTypeIcon kind={impactKindForAlert(alert)} size={17} className="line-impact-card-type-icon shrink-0" /> : null}
                    <strong className="block min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-normal break-words">
                      {alert.title}
                    </strong>
                  </div>
                  {alert.shuttle && (
                    <div className="impact-card-heading__badges flex flex-col items-end shrink-0 mt-0.5">
                      <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold uppercase">
                        <Bus size={10} />
                        Shuttle
                      </span>
                    </div>
                  )}
                </div>
                
                <ImpactRouteHeader location={alert.location} direction={alert.displayDirection} />
                
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed whitespace-normal break-words">
                  {alert.description}
                </p>

                <OverlappingImpactRefs
                  overlaps={overlappingImpacts}
                  onSelectImpact={onSelectImpact}
                  label="Overlap:"
                />
                
                <div className="border-t border-black/10 dark:border-white/10 mt-3 pt-2.5 flex items-end justify-start gap-3 w-full min-w-0">
                  <div className="flex-1 min-w-0">
                    <MetadataGrid 
                      className="no-border"
                      cause={alert.cause}
                      resolution={alert.resolution}
                      reason={alert.reason} 
                      targetRemoval={alert.targetRemoval} 
                      startedAt={alert.startedAt}
                      updatedAt={alert.updatedAt}
                      updatedAgo={alert.updatedAgo} 
                      extraRows={alert.relatedPlannedClosureId ? [{
                        label: "Planned Closure",
                        value: (
                          <RelatedPlannedClosureButton
                            onClick={() => onSelectImpact({ kind: "planned-closure", id: alert.relatedPlannedClosureId! })}
                          />
                        ),
                      }] : undefined}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAlertClick(alert)}
                    className={`impact-card-map-btn shrink-0 ${isActive ? "is-active" : ""}`}
                    aria-label={`${isActive && !onFocusMap ? "Unfocus" : "View on map"}: ${alert.title}`}
                    title={isActive && !onFocusMap ? "Unfocus" : "View on Map"}
                  >
                    <JumpToLocationIcon className="w-8 h-8" />
                    <span>
                      {isActive && !onFocusMap ? "Unfocus" : "View on Map"}
                    </span>
                  </button>
                </div>
                
                {isActive && commutePathPreview ? (
                  <CommutePathPreviewCardBanner
                    commutePathPreview={commutePathPreview}
                    onClearCommutePathPreview={onClearCommutePathPreview}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
