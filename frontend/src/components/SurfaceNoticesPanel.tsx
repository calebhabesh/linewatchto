"use client";

import { FilterSearchRow, FilterResultCount } from "./FilterSearchRow";

import { availableFilterOptions } from "../app/filter-options";
import { goBusRouteColor, goBusRouteTextColor } from "../app/go-bus-route-colors";
import { canonicalNoticeRoute, matchesNoticeFilters, noticeFacetRows } from "../app/notice-filters";
import { FilterOptionCount } from "./FilterOptionCount";

import React, { useState, useEffect, useRef, useId } from "react";
import Image from "next/image";
import { ArrowRight, ArrowUpDown, CalendarClock, ChevronDown, CircleAlert, ExternalLink, MapPin, Megaphone, Search, Bus } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import {
  getSurfaceNotices,
  SurfaceNoticeResponse,
  SurfaceNoticeCategory,
  SurfaceNoticeDetail,
} from "../app/surface-notice-data";
import { groupSurfaceNoticesByRoute, compareSurfaceNotices, surfaceNoticeEmphasis, SurfaceNoticeGroupItem } from "../app/surface-notice-groups";
import { formatImpactTimestamp, formatOperationalDateTime } from "../app/impact-time";
import type { NetworkId } from "../app/regional-data";
import { REGIONAL_STATION_SEARCH_LINES } from "../app/station-search";
import { getRegionalTripChanges, type RegionalTripChangeResponse } from "../app/regional-trip-changes";
import { RegionalTripChangesList } from "./RegionalTripChangesList";
import { DropdownMenuPortal } from "./DropdownMenuPortal";
import { SurfaceCategoryIcon } from "./SurfaceCategoryIcon";

function NoticeFilter({ label, prefix, value, options, onChange }: {
  label: string;
  prefix: string;
  value: string;
  options: { value: string; label: string; icon?: React.ReactNode; badgeOnly?: boolean; count?: number }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className="alert-history-line-filter relative" ref={root}>
      <span className="alert-history-control-prefix">{prefix}</span>
      <button
        ref={trigger}
        type="button"
        className="alert-history-line-filter-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="truncate inline-flex items-center gap-1.5">
          <span className="inline-flex min-w-0 items-center" aria-hidden="true">{selectedOption?.icon}</span>
          <span className={selectedOption?.badgeOnly ? "sr-only" : undefined}>{selectedOption?.label}</span>
        </span>
        <FilterOptionCount count={selectedOption?.count} />
        <ChevronDown size={13} className="shrink-0 ml-1.5" aria-hidden="true" />
      </button>
      <DropdownMenuPortal
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={trigger}
        anchorRef={root}
        matchAnchorWidth
        align="left"
        as="ul"
        id={menuId}
        role="menu"
        aria-label={label}
        className="alert-history-line-filter-options"
      >
        {availableFilterOptions(options, value).map((option) => (
          <li key={option.value} role="none">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              className={`alert-history-line-filter-option inline-flex items-center gap-1.5 ${option.value === value ? "selected" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <span className="inline-flex min-w-0 items-center" aria-hidden="true">{option.icon}</span>
              <span className={option.badgeOnly ? "sr-only" : undefined}>{option.label}</span>
              <FilterOptionCount count={option.count} />
            </button>
          </li>
        ))}
      </DropdownMenuPortal>
    </div>
  );
}

interface Props {
  onBack: () => void;
  onClose: () => void;
  initialQuery?: string;
  scopedRoute?: string;
  embeddedNotices?: SurfaceNoticeDetail[];
  externalQuery?: string;
  externalSort?: "updated" | "type" | "location";
  savedAt?: number;
  initialRegionalContent?: "notices" | "trip-changes";
  networkId?: NetworkId;
}

export function SurfaceNoticesPanel({
  onBack,
  onClose,
  initialQuery = "",
  scopedRoute,
  embeddedNotices,
  externalQuery,
  externalSort,
  savedAt,
  initialRegionalContent = "notices",
  networkId = "ttc",
}: Props) {
  const regional = networkId === "regional";
  const [category, setCategory] = useState<SurfaceNoticeCategory | "all">("all");
  const [serviceType, setServiceType] = useState("all");
  const [route, setRoute] = useState("all");
  const [timing, setTiming] = useState("all");
  const [regionalContent, setRegionalContent] = useState<"notices" | "trip-changes">(initialRegionalContent);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [data, setData] = useState<SurfaceNoticeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<"importance" | "recent" | "route" | "location" | "start">("importance");
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
    if (embeddedNotices) return;
    let active = true;
    async function load() {
      if (regional && regionalContent === "trip-changes") return;
      setLoading(true);
      const res = await getSurfaceNotices({
        networkId,
      });
      if (active) {
        setData(res.data);
        setLoading(false);
      }
    }
    load();
    const interval = window.setInterval(load, 30_000);
    window.addEventListener("online", load);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", load);
      active = false;
    };
  }, [networkId, regional, regionalContent, embeddedNotices]);

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

  const isFallback = data?.source?.toLowerCase().includes("fixture") || false;
  const availableNotices = (embeddedNotices ?? (data?.fresh || data?.savedAt ? data.notices : [])).filter(notice =>
    !scopedRoute || notice.routeIds.some(id => canonicalNoticeRoute(id) === canonicalNoticeRoute(scopedRoute)));
  const query = (externalQuery ?? debouncedQuery).toLocaleLowerCase();
  const expandedQuery = regional ? REGIONAL_STATION_SEARCH_LINES.reduce((text, line) =>
    text.replaceAll(line.name.toLocaleLowerCase(), line.number.toLocaleLowerCase()), query) : query;
  const now = Date.parse(data?.generatedAt ?? "");
  const filters = { route, service: serviceType, category, timing, query: expandedQuery };
  const serviceRows = noticeFacetRows(availableNotices, filters, "service", now);
  const routeRows = noticeFacetRows(availableNotices, filters, "route", now);
  const categoryRows = noticeFacetRows(availableNotices, filters, "category", now);
  const timingRows = noticeFacetRows(availableNotices, filters, "timing", now);
  const getCategoryCount = (cat: string) => categoryRows.filter(notice => notice.category === cat).length;
  const totalCount = categoryRows.length;
  const visibleCategories = ["service-change", "bypass", "detour", "no-service", "notice"] as SurfaceNoticeCategory[];
  // Retain a selected zero-result value so search/polling never silently clears a filter.
  const routeOptions = [...new Set([...routeRows.flatMap(notice => notice.routeIds.map(canonicalNoticeRoute)),
    ...(route !== "all" && route !== "unspecified" ? [route] : [])])]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const serviceOptions = [...new Set([...serviceRows.map(notice => notice.routeType),
    ...(serviceType !== "all" ? [serviceType] : [])])].sort();
  const routeLabel = (code: string) => regional
    ? REGIONAL_STATION_SEARCH_LINES.find(line => line.number === code)?.name ?? `GO Bus ${code}`
    : `Route ${code}`;
  const serviceFilteredNotices = availableNotices.filter(notice => matchesNoticeFilters(notice, filters, now));
  const resetFilters = () => {
    setRoute("all"); setServiceType("all"); setCategory("all"); setTiming("all");
    setSearchQuery(""); setDebouncedQuery(""); setSortOrder("importance");
  };
  const routeGroups = groupSurfaceNoticesByRoute(serviceFilteredNotices);
  const displayRouteGroups = (regional
    ? routeGroups.flatMap((group) => group.notices.map((notice) => ({
        ...group,
        key: `${group.key}:${notice.id}`,
        notices: [notice],
      })))
    : routeGroups).map((group) => ({ ...group, notices: [...group.notices].sort((a, b) => compareSurfaceNotices(a, b, externalSort === "location" ? "location" : externalSort ? "recent" : sortOrder, externalQuery ?? debouncedQuery, !regional)) }))
    .sort((a, b) => compareSurfaceNotices(a.notices[0], b.notices[0], externalSort === "location" ? "location" : externalSort ? "recent" : sortOrder, externalQuery ?? debouncedQuery, !regional));

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
    return (
      <span key={routeId} aria-label={regional ? `GO Bus ${routeId}` : `Route ${routeId}`}
        className="notice-route-badge inline-flex shrink-0 items-center justify-center rounded px-2 py-0.5 text-xs font-black"
        style={{ backgroundColor: regional ? goBusRouteColor(routeId) : "#dc2626",
          color: regional ? goBusRouteTextColor(routeId) : "#ffffff" }}>
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
    <section className={embeddedNotices ? "surface-notices-panel embedded-line-notices" : "panel surface-notices-panel min-w-0 border border-transparent rounded-2xl flex flex-col h-full bg-white dark:bg-[#0a0c10]"}>
      {/* Panel Header */}
      {!embeddedNotices && <PanelHeader
        title={scopedRoute ? `${routeLabel(canonicalNoticeRoute(scopedRoute))} Notices` : regional ? "GO / UP Notices" : "Streetcar & Bus Notices"}
        titleCompact
        icon={
          regional ? (
            <Megaphone className="w-4 h-4 sm:w-6 sm:h-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Bus className="w-4 h-4 sm:w-6 sm:h-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )
        }
        onBack={onBack}
        onClose={onClose}
        metadata={
          <>
            <span className="surface-notices-count-badge panel-header-badge font-bold shrink-0">
              {regional && regionalContent === "trip-changes"
                ? `${tripChanges?.changes.length ?? 0} ${(tripChanges?.changes.length ?? 0) === 1 ? "Trip Change" : "Trip Changes"}`
                : `${serviceFilteredNotices?.length ?? (data?.notices.length ?? 0)} ${
                    (serviceFilteredNotices?.length ?? (data?.notices.length ?? 0)) === 1 ? "Notice" : "Notices"
                  }`}
            </span>
            {data?.source ? (
              <span className="surface-notices-source-tag text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold whitespace-nowrap">
                {regional ? "Metrolinx notices" : data.source}
              </span>
            ) : null}
          </>
        }
      />}

      {/* Panel Body (Opaque Container) */}
      {(savedAt ?? data?.savedAt) && <p className="px-4 py-2 text-xs" role="status">Saved notices from {new Date((savedAt ?? data?.savedAt)!).toLocaleString("en-CA", { timeZone: "America/Toronto" })} (Toronto). These reports may have changed; current notice coverage is unknown.</p>}
      <div className="surface-notices-body flex-1 flex flex-col min-h-0 min-w-0">
        {!embeddedNotices && <div className="surface-notices-controls flex flex-col gap-2 px-3 pt-2.5 pb-2.5 sm:px-4 sm:pt-2.5 sm:pb-2.5 shrink-0">
          {/* Search Bar */}
          <div className="surface-notices-search-row">
            <FilterSearchRow active={Boolean(searchQuery || route !== "all" || serviceType !== "all" || category !== "all" || timing !== "all" || sortOrder !== "importance")} onReset={resetFilters}>
            <form onSubmit={handleSearchSubmit} className="relative w-full flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                className="submenu-search-input w-full pl-9 pr-4 h-10 rounded-lg border border-transparent bg-slate-50 dark:bg-[#12151c] text-sm text-slate-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder={regionalContent === "trip-changes"
                  ? "Search train, corridor, or station"
                  : regional ? "Search line, station, or notice" : "Search route, stop, or notice"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            </FilterSearchRow>
          </div>

          {regional && !scopedRoute ? (
            <div role="group" aria-label="GO / UP notice content">
              <div
                className="account-network-filter regional-notices-filter"
                data-options-count={2}
                data-content={regionalContent}
              >
                <div className="account-network-glider regional-notices-glider" aria-hidden="true" />
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

                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {(!regional || regionalContent === "notices") ? (
            <div className="alert-history-selects-row surface-notice-filters">
              {regional ? <NoticeFilter label="Filter GO / UP notices by service" prefix="Service"
                value={serviceType} onChange={(value) => setServiceType(value as typeof serviceType)}
                options={[{ value: "all", label: "All services", count: serviceRows.length }, { value: "train", label: "Train", count: serviceRows.filter((notice) => notice.routeType !== "GO Bus").length }, { value: "bus", label: "Bus", count: serviceRows.filter((notice) => notice.routeType === "GO Bus").length }]} /> : null}
              {!regional ? <NoticeFilter label="Filter notices by service" prefix="Service" value={serviceType}
                onChange={setServiceType} options={[{ value: "all", label: "All services", count: serviceRows.length },
                  ...serviceOptions.map(value => ({ value, label: value, count: serviceRows.filter(notice => notice.routeType === value).length }))]} /> : null}
              {!scopedRoute ? <NoticeFilter label="Filter notices by route or line" prefix={regional ? "Line / route" : "Route"}
                value={route} onChange={setRoute} options={[{ value: "all", label: "All routes", count: routeRows.length },
                  ...routeOptions.map(value => ({ value, label: routeLabel(value), icon: renderRouteBadge(value), badgeOnly: true, count: routeRows.filter(notice => notice.routeIds.some(id => canonicalNoticeRoute(id) === value)).length })),
                  { value: "unspecified", label: "No route specified", count: routeRows.filter(notice => !notice.routeIds.length).length }]} /> : null}
              <NoticeFilter label="Filter notices by timing" prefix="Timing" value={timing} onChange={setTiming}
                options={[{ value: "all", label: "Any time" }, { value: "ongoing", label: "Started" },
                  { value: "upcoming", label: "Upcoming" }, { value: "unknown", label: "Start not supplied" }].map(option => ({ ...option, count: timingRows.filter(notice => matchesNoticeFilters(notice, { timing: option.value }, now)).length }))}  />
              <NoticeFilter label="Notice type" prefix="Type" value={category}
                onChange={(value) => setCategory(value as typeof category)}
                options={[{ value: "all", label: "All Types", count: data ? totalCount : undefined },
                  ...visibleCategories.map((cat) => ({
                    value: cat,
                    label: getCategoryLabel(cat),
                    count: data ? getCategoryCount(cat) : undefined,
                    icon: <SurfaceCategoryIcon category={cat} size={12} className="shrink-0" />,
                  }))]} />
              <NoticeFilter label="Sort notices" prefix="Sort" value={sortOrder}
                onChange={(value) => setSortOrder(value as typeof sortOrder)}
                options={[
                  { value: "importance", label: "Importance", icon: <ArrowUpDown size={12} className="shrink-0 text-amber-500 dark:text-amber-400" /> },
                  { value: "route", label: "Route / line" },
                  { value: "location", label: "Station / stop" },
                  { value: "start", label: "Start time" },
                  { value: "recent", label: "Most Recent", icon: <CalendarClock size={12} className="shrink-0 text-blue-500 dark:text-blue-400" /> },
                ]} />
            </div>
          ) : null}
          {regionalContent === "notices" && <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <FilterResultCount shown={serviceFilteredNotices.length} total={availableNotices.length} noun="notices" />
            {sortOrder === "recent" && <span className="sr-only" role="status">Newest updates first</span>}
          </div>}
          {scopedRoute && <p className="text-xs text-slate-500 dark:text-slate-400">Source-tagged service information for this corridor, separate from service impacts. Notices do not change line status.</p>}
        </div>}

        {/* Notices Content */}
        <div className="flex-1 overflow-y-auto min-w-0 px-3 pb-3 sm:px-4 sm:pb-4 pt-0 surface-notices-scroll">
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
          ) : (!data && !embeddedNotices) || serviceFilteredNotices.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
              No active {regional && serviceType !== "all" ? `${serviceType} ` : regional ? "GO / UP " : "streetcar & bus "}notices found matching your filters.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayRouteGroups.map((group) => (
                <section
                  key={group.key}
                  data-emphasis={surfaceNoticeEmphasis(group.notices[0])}
                  className="surface-notice-route-group overflow-hidden rounded-lg border border-transparent bg-slate-50 dark:border-transparent dark:bg-[#12151c] shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2 px-3.5 pt-3 pb-2">
                    <div className="min-w-0 flex flex-col gap-1">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {regional && group.routeType === "GO Bus" ? "GO Bus routes tagged by source" : regional && group.notices[0].scheduleAnnouncement ? "Schedule announcement" : regional && group.routeType !== "GO Bus" ? "Station / Lines Affected" : "Routes Affected"}
                      </p>
                      {regional ? (
                        <>
                          {group.routeType !== "GO Bus" && !group.notices[0].scheduleAnnouncement ? (
                            <div className="min-w-0 text-sm font-semibold text-slate-900 dark:text-white">
                              {renderStopDisplay(group.notices[0])}
                            </div>
                          ) : null}
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            {group.notices[0].scheduleAnnouncement ? (
                              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Published for:</span>
                            ) : null}
                            {renderRegionalRouteList(group.routeIds)}
                          </div>
                          <p className="text-sm font-bold leading-snug text-slate-900 dark:text-white">
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
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${getCategoryBadgeColor(group.category)}`}>
                      <SurfaceCategoryIcon category={group.category} size={11} className="shrink-0" />
                      {getCategoryLabel(group.category)}
                    </span>
                  </div>

                  <div className="divide-y divide-black/5 dark:divide-white/5">
                    {group.notices.map((notice) => {
                      return (
                        <article key={notice.id} className="surface-notice-stop-row">
                          {!regional ? (
                            <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 px-3.5 py-3 text-left">
                              <span className="min-w-0 flex items-center gap-2">
                                {renderStopDisplay(notice)}
                              </span>
                            </div>
                          ) : null}

                          <div className="surface-notice-description mx-3.5 mb-3 border-b border-black/10 pb-3 dark:border-white/10">
                            {!regional ? <p className="mb-2 text-sm font-bold text-slate-900 dark:text-white">{notice.title}</p> : null}
                            {surfaceNoticeEmphasis(notice) === "no-service" && notice.category !== "no-service" ? <p className="mb-2 text-xs font-bold text-red-700 dark:text-red-300">Includes no-service periods</p> : null}
                            {notice.description && notice.description !== notice.title ? <p className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-600 dark:text-slate-300">{notice.description}</p> : null}
                            {notice.url ? <a href={notice.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">
                              View {regional ? "Metrolinx" : "TTC"} details <ExternalLink size={11} />
                            </a> : null}
                          </div>
                          <dl className={`grid grid-cols-1 gap-3 px-3.5 pb-3 sm:grid-cols-2 ${regional ? "pt-3" : ""}`}>
                            {!regional ? renderCompactField(stopFieldHeading(notice), stopFieldLabel(notice), <MapPin size={13} className="text-red-500 dark:text-red-400" />) : null}
                            {renderCompactField("Active", activeTimeLabel(notice), <CalendarClock size={13} className="text-blue-500 dark:text-blue-400" />)}
                            {renderCompactField("Updated", formatImpactTimestamp(notice.updatedAt), <CalendarClock size={13} className="text-slate-500 dark:text-slate-400" />)}
                            {renderCompactField("Direction", notice.compactDirection, <ArrowUpDown size={13} className="text-amber-500 dark:text-amber-400" />)}
                            {renderCompactField("Cause", notice.compactCause, <CircleAlert size={13} className="text-orange-500 dark:text-orange-400" />)}
                          </dl>

                          <p className="surface-notice-footnote px-3.5 pb-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                            {regional && notice.scheduleAnnouncement
                              ? "Corridor tags are source-published. Check the notice for service changes and exceptions."
                              : regional && group.routeType === "GO Bus" ? "Route tags and notice type are supplied by Metrolinx. The text may describe connecting rail service."
                              : "Check the notice for details on affected routes."}
                          </p>
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
