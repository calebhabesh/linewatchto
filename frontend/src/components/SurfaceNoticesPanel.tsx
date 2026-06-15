"use client";

import React, { useState, useEffect } from "react";
import { ArrowUpDown, CalendarClock, ChevronLeft, CircleAlert, ExternalLink, MapPin, Search, X, Bus } from "lucide-react";
import {
  getSurfaceNotices,
  SurfaceNoticeResponse,
  SurfaceNoticeCategory,
} from "../app/surface-notice-data";
import { groupSurfaceNoticesByRoute, SurfaceNoticeGroupItem } from "../app/surface-notice-groups";
import { formatRelativeImpactTime } from "../app/impact-time";

interface Props {
  onBack: () => void;
  onClose: () => void;
}

export function SurfaceNoticesPanel({ onBack, onClose }: Props) {
  const [category, setCategory] = useState<SurfaceNoticeCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [data, setData] = useState<SurfaceNoticeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedNoticeIds, setExpandedNoticeIds] = useState<Record<string, boolean>>({});

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
      setLoading(true);
      const res = await getSurfaceNotices({
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
  }, [category, debouncedQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(searchQuery);
  };

  const formatAbsoluteTime = (timestamp?: string | null) => {
    if (!timestamp) return "";
    try {
      const d = new Date(timestamp);
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Toronto",
      });
    } catch {
      return timestamp || "";
    }
  };

  const getCategoryBadgeColor = (cat: string) => {
    switch (cat.toLowerCase()) {
      case "bypass":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
      case "no-service":
        return "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20";
      case "detour":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20";
      case "service-change":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20";
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20";
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

  const isFallback = data?.source?.toLowerCase().includes("fixture") || false;
  const routeGroups = data ? groupSurfaceNoticesByRoute(data.notices) : [];

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
    const start = formatAbsoluteTime(notice.startAt);
    const end = notice.endAt ? formatAbsoluteTime(notice.endAt) : null;
    return end ? `${start} to ${end}` : start;
  };

  return (
    <section className="panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl flex flex-col h-full bg-white dark:bg-[#0a0c10]">
      {/* Panel Header */}
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-1 sm:gap-3 min-w-0 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={onBack}
            className="p-1 sm:p-2 -ml-1 sm:-ml-3 mr-0 sm:mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
            aria-label="Back"
          >
            <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
          </button>
          <h2 className="text-[clamp(14px,4.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-2 whitespace-nowrap">
            <Bus className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-slate-700 dark:text-slate-300" />
            <span>Surface Notices</span>
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data?.source && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">
              {data.source}
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3 pt-3 sm:px-4 sm:pt-4 shrink-0">
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search route, stop, or notice"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-black/15 dark:border-white/15 bg-slate-50 dark:bg-[#12151c] text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
        </form>
      </div>

      {/* Segmented Category Buttons */}
      <div className="px-3 pt-3 sm:px-4 sm:pt-3 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
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
        {(["service-change", "bypass", "detour"] as SurfaceNoticeCategory[]).map((cat) => {
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
      </div>

      {/* Notices Content */}
      <div className="flex-1 overflow-y-auto min-w-0 p-3 sm:p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400">
            <span className="text-sm">Loading notices...</span>
          </div>
        ) : isFallback ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
            Surface notices are unavailable in fixture mode.
          </div>
        ) : !data || data.notices.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
            No active surface notices found matching your filters.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {routeGroups.map((group) => (
              <section
                key={group.key}
                className="surface-notice-route-group overflow-hidden rounded-lg border border-black/10 bg-slate-50 dark:border-white/10 dark:bg-[#12151c]"
              >
                <div className="flex items-center justify-between gap-2 border-b border-black/10 px-3.5 py-3 dark:border-white/10">
                  <div className="min-w-0 flex items-center gap-2">
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {group.routeIds.map((routeId) => (
                        <span
                          key={routeId}
                          className="inline-flex items-center justify-center rounded bg-red-600 px-2 py-0.5 text-xs font-black text-white"
                        >
                          {routeId}
                        </span>
                      ))}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black text-slate-950 dark:text-white">
                        {group.routeName}
                      </h3>
                      <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        {group.routeType}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${getCategoryBadgeColor(group.category)}`}>
                    {getCategoryLabel(group.category)}
                  </span>
                </div>

                <div className="divide-y divide-black/5 dark:divide-white/5">
                  {group.notices.map((notice) => {
                    const expanded = Boolean(expandedNoticeIds[notice.id]);
                    const stopLabel = notice.location || "Route-wide notice";
                    return (
                      <article key={notice.id} className="surface-notice-stop-row">
                        <button
                          type="button"
                          onClick={() => toggleNotice(notice.id)}
                          className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                          aria-expanded={expanded}
                        >
                          <span className="min-w-0 flex items-center gap-2">
                            {notice.primaryStopId ? (
                              <span className="shrink-0 rounded border border-slate-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:border-slate-500 dark:text-slate-200">
                                {notice.primaryStopId}
                              </span>
                            ) : null}
                            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {stopLabel}
                            </span>
                          </span>
                          <ChevronLeft
                            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${expanded ? "-rotate-90" : "rotate-180"}`}
                          />
                        </button>

                        <dl className="grid grid-cols-1 gap-3 px-3.5 pb-3 sm:grid-cols-2">
                          {renderCompactField("Stop", stopLabel, <MapPin size={13} />)}
                          {renderCompactField("Active", activeTimeLabel(notice), <CalendarClock size={13} />)}
                          {renderCompactField("Updated", formatRelativeImpactTime(notice.updatedAt), <CalendarClock size={13} />)}
                          {renderCompactField("Direction", notice.compactDirection, <ArrowUpDown size={13} />)}
                          {renderCompactField("Cause", notice.compactCause, <CircleAlert size={13} />)}
                        </dl>

                        {expanded ? (
                          <div className="border-t border-black/5 px-3.5 pb-3 pt-3 dark:border-white/5">
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
                                View TTC details
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
    </section>
  );
}
