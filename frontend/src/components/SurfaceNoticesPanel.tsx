"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { ArrowRight, ArrowUpDown, CalendarClock, ChevronDown, ChevronLeft, CircleAlert, ExternalLink, Info, MapPin, Search, X, Bus } from "lucide-react";
import {
  getSurfaceNotices,
  SurfaceNoticeResponse,
  SurfaceNoticeCategory,
} from "../app/surface-notice-data";
import { groupSurfaceNoticesByRoute, SurfaceNoticeGroupItem } from "../app/surface-notice-groups";
import { formatImpactTimestamp, formatOperationalDateTime } from "../app/impact-time";
import type { NetworkId } from "../app/regional-data";
import { REGIONAL_STATION_SEARCH_LINES } from "../app/station-search";
import { getRegionalTripChanges, type RegionalTripChangeResponse } from "../app/regional-trip-changes";
import { RegionalTripChangesList } from "./RegionalTripChangesList";

interface Props {
  onBack: () => void;
  onClose: () => void;
  initialQuery?: string;
  initialRegionalContent?: "notices" | "trip-changes";
  networkId?: NetworkId;
}

export function SurfaceNoticesPanel({
  onBack,
  onClose,
  initialQuery = "",
  initialRegionalContent = "notices",
  networkId = "ttc",
}: Props) {
  const regional = networkId === "regional";
  const [category, setCategory] = useState<SurfaceNoticeCategory | "all">("all");
  const [serviceType, setServiceType] = useState<"all" | "train" | "bus">("all");
  const [regionalContent, setRegionalContent] = useState<"notices" | "trip-changes">(initialRegionalContent);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [data, setData] = useState<SurfaceNoticeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedNoticeIds, setExpandedNoticeIds] = useState<Record<string, boolean>>({});
  const [tripChangesState, setTripChangesState] = useState<{
    query: string;
    response: RegionalTripChangeResponse;
  } | null>(null);
  const tripChanges = tripChangesState?.query === debouncedQuery ? tripChangesState.response : null;
  const tripChangesLoading = regional
    && regionalContent === "trip-changes"
    && tripChangesState?.query !== debouncedQuery;

  useEffect(() => {
    if (!initialQuery) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchQuery(initialQuery);
    setDebouncedQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!regional) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegionalContent(initialRegionalContent);
  }, [initialRegionalContent, regional]);

  // Debounce query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Fetch data
  useEffect(() => {
    let active = true;
    async function load() {
      if (regional && regionalContent === "trip-changes") return;
      setLoading(true);
      const res = await getSurfaceNotices({
        networkId,
        category: category === "all" ? undefined : category,
        query: debouncedQuery,
      });
      if (active) {
        setData(res.data);
        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [category, debouncedQuery, networkId, regional, regionalContent]);

  useEffect(() => {
    if (!regional || regionalContent !== "trip-changes") return;
    let active = true;
    void getRegionalTripChanges({ query: debouncedQuery }).then((result) => {
      if (active) {
        setTripChangesState({ query: debouncedQuery, response: result.data });
      }
    });
    return () => { active = false; };
  }, [debouncedQuery, regional, regionalContent]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(searchQuery);
  };

  const getCategoryBadgeColor = (cat: string) => {
    switch (cat.toLowerCase()) {
      case "bypass":
        return "bg-amber-500/20 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-500/40 dark:border-amber-500/30";
      case "no-service":
        return "bg-red-500/20 text-red-700 dark:bg-red-500/20 dark:text-red-300 border border-red-500/40 dark:border-red-500/30";
      case "detour":
        return "bg-purple-500/20 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-500/40 dark:border-purple-500/30";
      case "service-change":
        return "bg-blue-500/20 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-500/40 dark:border-blue-500/30";
      default:
        return "bg-slate-500/20 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300 border border-slate-500/40 dark:border-slate-500/30";
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat.toLowerCase()) {
      case "bypass":
        return "Bypass";
      case "no-service":
        return "No Service";
      case "detour":
        return "Detour";
      case "service-change":
        return "Service Change";
      default:
        return "Notice";
    }
  };

  // Find counts from full summaries
  const getCategoryCount = (cat: string) => {
    if (!data) return 0;
    const summary = data.categories.find((c) => c.category === cat);
    return summary ? summary.count : 0;
  };

  const totalCount = data ? data.categories.reduce((sum, c) => sum + c.count, 0) : 0;
  const visibleCategories = regional
    ? (["service-change", "bypass", "detour", "no-service", "notice"] as SurfaceNoticeCategory[]).filter((cat) => getCategoryCount(cat) > 0)
    : (["service-change", "bypass", "detour"] as SurfaceNoticeCategory[]);

  const isFallback = data?.source?.toLowerCase().includes("fixture") || false;
  const serviceFilteredNotices = data?.notices.filter((notice) => {
    if (!regional || serviceType === "all") return true;
    const busNotice = notice.routeType === "GO Bus";
    return serviceType === "bus" ? busNotice : !busNotice;
  }) ?? [];
  const routeGroups = groupSurfaceNoticesByRoute(serviceFilteredNotices);
  const displayRouteGroups = regional
    ? routeGroups.flatMap((group) => group.notices.map((notice) => ({
        ...group,
        key: `${group.key}:${notice.id}`,
        notices: [notice],
      })))
    : routeGroups;

  const toggleNotice = (noticeId: string) => {
    setExpandedNoticeIds((current) => ({
      ...current,
      [noticeId]: !current[noticeId],
    }));
  };

  const renderCompactField = (
    label: string,
    value: string | null | undefined,
    icon: React.ReactNode
  ) => {
    if (!value) {
      return null;
    }
    return (
      <div className="min-w-0 flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300">
          {icon}
        </span>
        <div className="min-w-0">
          <dt className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">
            {label}
          </dt>
          <dd className="text-xs font-semibold leading-snug text-slate-800 dark:text-slate-100">
            {value}
          </dd>
        </div>
      </div>
    );
  };

  const activeTimeLabel = (notice: SurfaceNoticeGroupItem) => {
    if (!notice.startAt) {
      return null;
    }
    const start = formatOperationalDateTime(notice.startAt);
    const end = notice.endAt ? formatOperationalDateTime(notice.endAt) : null;
    return end ? `${start} to ${end}` : start;
  };

  const stopFieldLabel = (notice: SurfaceNoticeGroupItem) => {
    if (!notice.displayStops.length) {
      return notice.displayLocation || "Route-wide Notice";
    }

    return notice.displayStops
      .map((stop) => stop.stopId ? `${stop.stopName} (${stop.stopId})` : stop.stopName)
      .join(" to ");
  };

  const stopFieldHeading = (notice: SurfaceNoticeGroupItem) => (
    notice.displayStops.length > 1 ? "Stops" : "Stop"
  );

  const renderStopDisplay = (notice: SurfaceNoticeGroupItem) => {
    if (!notice.displayStops.length) {
      return (
        <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
          {notice.displayLocation || "Route-wide Notice"}
        </span>
      );
    }

    return (
      <span className="min-w-0 flex flex-wrap items-center gap-1.5">
        {notice.displayStops.map((stop, index) => (
          <React.Fragment key={`${stop.stopId ?? stop.stopName}-${index}`}>
            {index > 0 ? (
              <ArrowRight className="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400" />
            ) : null}
            <span className="min-w-0 inline-flex items-center gap-1.5">
              {stop.stopId ? (
                <span className="shrink-0 rounded border border-slate-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:border-slate-500 dark:text-slate-200">
                  {stop.stopId}
                </span>
              ) : null}
              <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                {stop.stopName}
              </span>
            </span>
          </React.Fragment>
        ))}
      </span>
    );
  };

  const regionalLine = (routeId: string) => {
    const canonicalCode = routeId.toUpperCase() === "GT" ? "KI" : routeId.toUpperCase();
    return REGIONAL_STATION_SEARCH_LINES.find((line) => line.number === canonicalCode);
  };

  const renderRouteBadge = (routeId: string) => {
    const line = regional ? regionalLine(routeId) : null;
    if (line) {
      return (
        <span
          key={routeId}
          className="regional-line-identity inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200"
        >
          <Image src={line.icon} alt="" width={16} height={16} className="h-4 w-4 shrink-0" aria-hidden="true" />
          {line.name}
        </span>
      );
    }
    if (regional) {
      return (
        <span key={routeId} className="regional-line-identity inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
          <Bus className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          GO Bus {routeId}
        </span>
      );
    }
    return (
      <span
        key={routeId}
        className="inline-flex items-center justify-center rounded bg-red-600 px-2 py-0.5 text-xs font-black text-white"
      >
        {routeId}
      </span>
    );
  };

  const renderRegionalRouteList = (routeIds: string[]) => (
    routeIds.map((routeId, index) => (
      <React.Fragment key={routeId}>
        {index > 0 ? (
          <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">·</span>
        ) : null}
        {renderRouteBadge(routeId)}
      </React.Fragment>
    ))
  );

  return (
    <section className="panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl flex flex-col h-full bg-white dark:bg-[#0a0c10]">
      {/* Panel Header */}
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-1 sm:gap-3 min-w-0 shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={onBack}
            className="p-1 sm:p-2 -ml-1.5 sm:ml-0 mr-1 sm:mr-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            aria-label="Back"
          >
            <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
          </button>
          <h2 className="text-[clamp(14px,4.5cqw,18px)] font-bold text-slate-900 dark:text-white whitespace-nowrap flex items-center gap-2">
            <Bus className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-slate-700 dark:text-slate-300" />
            <span>{regional ? "GO / UP Notices" : "Streetcar & Bus Notices"}</span>
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data?.source && (
            <span className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold whitespace-nowrap">
              {regional ? "Metrolinx notices" : data.source}
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1 sm:p-2 -mr-1.5 sm:mr-0 ml-1 sm:ml-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        </div>
      </div>

      {/* Panel Body (Opaque Container) */}
      <div className="surface-notices-body flex-1 flex flex-col min-h-0 min-w-0">
        {/* Search Bar */}
        <div className="px-3 pt-3 sm:px-4 sm:pt-4 shrink-0">
          <form onSubmit={handleSearchSubmit} className="relative w-full flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              className="submenu-search-input w-full pl-9 pr-4 h-10 rounded-lg border border-black/15 dark:border-white/15 bg-slate-50 dark:bg-[#12151c] text-sm text-slate-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder={regionalContent === "trip-changes"
                ? "Search train, corridor, or station"
                : regional ? "Search line, station, or notice" : "Search route, stop, or notice"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        </div>

        {regional ? (
          <div className="px-3 pt-3 sm:px-4" role="group" aria-label="GO / UP notice content">
            <div
              className="regional-notices-filter relative grid grid-cols-2 gap-1 rounded-lg border border-black/10 bg-slate-100 p-1 dark:border-white/10 dark:bg-white/5"
              data-content={regionalContent}
            >
              <div className="regional-notices-glider" aria-hidden="true" />
              {([[
                "notices", "Service Notices",
              ], [
                "trip-changes", "Trip Changes",
              ]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRegionalContent(value)}
                  aria-pressed={regionalContent === value}
                  className={`relative z-10 min-h-9 rounded-md px-2 text-xs font-black transition-colors ${regionalContent === value
                    ? "text-slate-950 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {regional && regionalContent === "notices" ? (
          <div
            className="px-3 pt-3 sm:px-4 sm:pt-3 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0"
            role="group"
            aria-label="Filter GO / UP notices by service"
          >
            {([
              ["all", "All services"],
              ["train", "Train"],
              ["bus", "Bus"],
            ] as const).map(([value, label]) => {
              const active = serviceType === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setServiceType(value)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border cursor-pointer transition-all ${
                    active
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-transparent"
                      : "bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 border-black/10 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Segmented Category Buttons */}
        {(!regional || regionalContent === "notices") ? <div className="px-3 pt-3 pb-3 sm:px-4 sm:pt-3 sm:pb-3 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setCategory("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border cursor-pointer transition-all ${
              category === "all"
                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-transparent"
                : "bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 border-black/10 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10"
            }`}
          >
            All {totalCount > 0 && `(${totalCount})`}
          </button>
          {visibleCategories.map((cat) => {
            const active = category === cat;
            const count = getCategoryCount(cat);
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border cursor-pointer transition-all ${
                  active
                    ? "bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-transparent"
                    : "bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 border-black/10 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10"
                }`}
              >
                {getCategoryLabel(cat)} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div> : null}

        {/* Notices Content */}
        <div className="flex-1 overflow-y-auto min-w-0 p-3 sm:p-4 surface-notices-scroll">
          {regional && regionalContent === "trip-changes" ? (
            <RegionalTripChangesList data={tripChanges} loading={tripChangesLoading} />
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400">
              <span className="text-sm">Loading notices...</span>
            </div>
          ) : isFallback ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
              {regional ? "GO / UP notices" : "Streetcar & Bus notices"} are unavailable in fixture mode.
            </div>
          ) : !data || serviceFilteredNotices.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
              No active {regional && serviceType !== "all" ? `${serviceType} ` : regional ? "GO / UP " : "streetcar & bus "}notices found matching your filters.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayRouteGroups.map((group) => (
                <section
                  key={group.key}
                  className="surface-notice-route-group overflow-hidden rounded-lg border border-black/10 bg-slate-50 dark:border-white/10 dark:bg-[#12151c]"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-black/10 px-3.5 py-3 dark:border-white/10">
                    <div className="min-w-0 flex flex-col gap-1">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {regional && group.routeType !== "GO Bus" ? "Station / Lines Affected" : "Routes Affected"}
                      </p>
                      {regional ? (
                        <>
                          {group.routeType !== "GO Bus" ? (
                            <div className="min-w-0 text-sm font-semibold text-slate-900 dark:text-white">
                              {renderStopDisplay(group.notices[0])}
                            </div>
                          ) : null}
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            {renderRegionalRouteList(group.routeIds)}
                          </div>
                          <p className="text-xs font-semibold leading-snug text-slate-600 dark:text-slate-300">
                            {group.notices[0].title}
                          </p>
                        </>
                      ) : (
                        <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {group.routeIds.map(renderRouteBadge)}
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {group.routeType}
                          </span>
                        </div>
                      )}
                      {!regional && group.routeName && group.routeName.trim() !== "-" && group.routeName.trim() !== "–" && group.routeName.trim() !== "—" ? (
                        <p className="truncate text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {group.routeName}
                        </p>
                      ) : null}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${getCategoryBadgeColor(group.category)}`}>
                      {getCategoryLabel(group.category)}
                    </span>
                  </div>

                  <div className="divide-y divide-black/5 dark:divide-white/5">
                    {group.notices.map((notice) => {
                      const expanded = Boolean(expandedNoticeIds[notice.id]);
                      const detailControlLabel = expanded
                        ? `Show fewer details for ${stopFieldLabel(notice)}`
                        : `Show more details for ${stopFieldLabel(notice)}`;
                      const detailsPanelId = `surface-notice-details-${notice.id}`;
                      return (
                        <article key={notice.id} className="surface-notice-stop-row">
                          {!regional ? (
                            <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 px-3.5 py-3 text-left">
                              <span className="min-w-0 flex items-center gap-2">
                                {renderStopDisplay(notice)}
                              </span>
                            </div>
                          ) : null}

                          <dl className={`grid grid-cols-1 gap-3 px-3.5 pb-3 sm:grid-cols-2 ${regional ? "pt-3" : ""}`}>
                            {!regional ? renderCompactField(stopFieldHeading(notice), stopFieldLabel(notice), <MapPin size={13} />) : null}
                            {renderCompactField("Active", activeTimeLabel(notice), <CalendarClock size={13} />)}
                            {renderCompactField("Updated", formatImpactTimestamp(notice.updatedAt), <CalendarClock size={13} />)}
                            {renderCompactField("Direction", notice.compactDirection, <ArrowUpDown size={13} />)}
                            {renderCompactField("Cause", notice.compactCause, <CircleAlert size={13} />)}
                          </dl>

                          <p className="mx-3.5 mb-3 flex items-start gap-1.5 rounded border border-black/10 bg-white/60 px-2.5 py-2 text-[11px] font-semibold leading-snug text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>Make sure to check details for more info on routes affected.</span>
                          </p>

                          <button
                            type="button"
                            onClick={() => toggleNotice(notice.id)}
                            className="mx-3.5 mb-3 flex min-h-[34px] w-[calc(100%-1.75rem)] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-slate-700 transition-colors hover:bg-slate-200 cursor-pointer dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                            aria-expanded={expanded}
                            aria-controls={detailsPanelId}
                            aria-label={detailControlLabel}
                          >
                            <span className="text-sm font-bold leading-none">{expanded ? "Less Details" : "More Details"}</span>
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            />
                          </button>

                          {expanded ? (
                            <div id={detailsPanelId} className="border-t border-black/5 px-3.5 pb-3 pt-3 dark:border-white/5">
                              <p className="text-xs font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
                                {notice.title}
                              </p>
                              {notice.description && notice.description !== notice.title ? (
                                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                                  {notice.description}
                                </p>
                              ) : null}
                              {notice.url ? (
                                <a
                                  href={notice.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  View {regional ? "Metrolinx" : "TTC"} details
                                  <ExternalLink size={11} />
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
