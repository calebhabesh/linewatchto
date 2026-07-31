"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal, Copy, Check, ChevronDown, ChevronUp, AlertCircle, RefreshCw, Newspaper } from "lucide-react";
import { mockRawAlerts, RawAlert } from "../app/mock-raw-alerts";
import { apiUrl } from "../app/api-client.ts";
import type { NetworkId } from "../app/regional-data";
import { formatImpactTimestamp } from "../app/impact-time";

type Props = {
  isMobileMore?: boolean;
  network?: NetworkId;
};

type RegionalCollectionHealth = {
  sourceSystem: string;
  label: string;
  kind: "rider-alert" | "operational";
  required: boolean;
  status: "complete" | "unavailable" | "unknown" | "not-evaluated" | "not-run";
  recordsFetched: number;
  sourceUpdatedAt: string | null;
};

type RegionalIngestionHealth = {
  fresh: boolean;
  status: string;
  collections: RegionalCollectionHealth[];
};

type RegionalScheduleHealth = {
  status: string;
  scheduleActive: boolean;
  lookaheadCovered: boolean;
  requiredThrough: string;
  mappedStationLines: number;
};

export function LogsDropdown({ isMobileMore = false, network = "ttc" }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [rawAlerts, setRawAlerts] = useState<RawAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regionalHealth, setRegionalHealth] = useState<RegionalIngestionHealth | null>(null);
  const [regionalScheduleHealth, setRegionalScheduleHealth] = useState<RegionalScheduleHealth | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const closeDropdown = useCallback(() => {
    if (!isOpen || isClosing) return;
    setIsClosing(true);
    const reducedMotion = Boolean(dropdownRef.current?.closest(".motion-paused"))
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, reducedMotion ? 0 : 220);
  }, [isClosing, isOpen]);

  const toggleDropdown = () => {
    if (isOpen) {
      closeDropdown();
      return;
    }
    setIsClosing(false);
    setIsOpen(true);
  };

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeDropdown]);

  // Fetch source records for the selected map. TTC retains its demo fallback;
  // regional mode stays empty when its backend-only ingestion data is unavailable.
  const fetchRawAlerts = useCallback(() => {
    setLoading(true);
    setError(false);
    const endpoint = network === "regional"
      ? "/api/regional/alerts/raw"
      : "/api/alerts?type=raw";
    fetch(apiUrl(endpoint))
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data: RawAlert[]) => {
        setRawAlerts(data);
        setLoading(false);
      })
      .catch((err) => {
        if (network === "ttc") {
          console.warn("Backend raw alerts unavailable, falling back to mock fixtures:", err);
          setRawAlerts(mockRawAlerts);
        } else {
          console.warn("Regional raw alerts unavailable:", err);
          setRawAlerts([]);
        }
        setError(true);
        setLoading(false);
      });
  }, [network]);

  useEffect(() => {
    if (isOpen) {
      setRawAlerts([]);
      setExpandedIds({});
      Promise.resolve().then(() => {
        fetchRawAlerts();
      });
    }
  }, [fetchRawAlerts, isOpen]);

  useEffect(() => {
    if (!isOpen || network !== "regional") return;
    let active = true;
    Promise.allSettled([
      fetch(apiUrl("/api/health/regional-ingestion"), { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("Regional ingestion health unavailable");
        return response.json() as Promise<RegionalIngestionHealth>;
      }),
      fetch(apiUrl("/api/health/regional-schedule"), { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("Regional schedule health unavailable");
        return response.json() as Promise<RegionalScheduleHealth>;
      }),
    ]).then(([ingestion, schedule]) => {
      if (!active) return;
      setRegionalHealth(ingestion.status === "fulfilled" ? ingestion.value : null);
      setRegionalScheduleHealth(schedule.status === "fulfilled" ? schedule.value : null);
    });
    return () => { active = false; };
  }, [isOpen, network]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleCopy = (id: string, payload: string) => {
    let formatted = payload;
    try {
      formatted = JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      // Use as is if invalid json
    }
    navigator.clipboard.writeText(formatted);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter by active status if showActiveOnly is enabled
  const filteredAlerts = showActiveOnly
    ? rawAlerts.filter(alert => alert.active)
    : rawAlerts;

  // Group alerts by sourceSection (supporting camelCase and snake_case from API)
  const routesAlerts = filteredAlerts.filter(alert => {
    const sec = alert.sourceSection || alert.source_section;
    return sec === "routes";
  });
  const accessibilityAlerts = filteredAlerts.filter(alert => {
    const sec = alert.sourceSection || alert.source_section;
    return sec === "accessibility";
  });

  const isGtfsRt = (alert: RawAlert) => {
    return alert.sourceId?.startsWith("gtfsrt-") || false;
  };

  const liveRoutesAlerts = routesAlerts.filter(alert => !isGtfsRt(alert));
  const liveAccessibilityAlerts = accessibilityAlerts.filter(alert => !isGtfsRt(alert));

  const gtfsRtRoutesAlerts = routesAlerts.filter(alert => isGtfsRt(alert));
  const gtfsRtAccessibilityAlerts = accessibilityAlerts.filter(alert => isGtfsRt(alert));

  const goAlerts = filteredAlerts.filter(alert => {
    const sec = alert.sourceSection || alert.source_section;
    return sec === "go";
  });
  const upAlerts = filteredAlerts.filter(alert => {
    const sec = alert.sourceSection || alert.source_section;
    return sec === "up";
  });

  const getAlertTitle = (payloadStr: string, sourceId: string) => {
    try {
      const parsed = JSON.parse(payloadStr);
      const translatedHeader = parsed.alert?.header_text?.translation?.find(
        (translation: { text?: string; language?: string }) => translation.language === "en"
      )?.text || parsed.alert?.header_text?.translation?.[0]?.text;
      return parsed.title
        || parsed.headerText
        || parsed.customHeaderText
        || parsed.SubjectEnglish
        || translatedHeader
        || `Alert ID: ${sourceId}`;
    } catch {
      return `Alert ID: ${sourceId}`;
    }
  };

  const getAlertBadges = (payloadStr: string) => {
    try {
      const parsed = JSON.parse(payloadStr);
      const badges: { text: string; type: "planned" | "critical" | "default" | "route" }[] = [];
      
      if (parsed.alertType) {
        const isPlanned = parsed.alertType.toLowerCase() === "planned";
        badges.push({ 
          text: parsed.alertType, 
          type: isPlanned ? "planned" : "default" 
        });
      }
      
      if (parsed.severity) {
        const isCritical = parsed.severity.toLowerCase() === "critical";
        badges.push({ 
          text: parsed.severity, 
          type: isCritical ? "critical" : "default" 
        });
      }
      
      if (parsed.route) {
        badges.push({ 
          text: `Route ${parsed.route}`, 
          type: "route" 
        });
      } else if (parsed.routeType) {
        badges.push({ 
          text: parsed.routeType, 
          type: "route" 
        });
      }
      if (parsed.Category) {
        badges.push({ text: parsed.Category, type: "default" });
      }
      if (parsed.Lines?.length) {
        badges.push({
          text: parsed.Lines.map((line: { Code?: string }) => line.Code).filter(Boolean).join(", "),
          type: "route",
        });
      }
      if (parsed.alert?.effect) {
        badges.push({ text: parsed.alert.effect.replaceAll("_", " "), type: "default" });
      }

      return badges;
    } catch {
      return [];
    }
  };

  return (
    <div className={`relative ${isMobileMore ? "w-full" : "pointer-events-auto"}`} ref={dropdownRef}>
      {/* Logs Trigger Button */}
      <button
        onClick={toggleDropdown}
        className={
          isMobileMore
            ? "mobile-more-row w-full flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            : "logs-trigger-btn panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10] text-slate-800 dark:text-white"
        }
        aria-label="Toggle Ingestion Logs"
        aria-expanded={isOpen && !isClosing}
      >
        <span className="flex items-center gap-3">
          <Newspaper
            className={`shrink-0 ${
              isMobileMore
                ? "w-[18px] h-[18px] text-slate-500 dark:text-slate-400"
                : "w-[18px] h-[18px] sm:w-[24px] sm:h-[24px] text-slate-800 dark:text-white"
            }`}
          />
          {isMobileMore ? (
            <span>{network === "regional" ? "GO / UP Ingested Alerts" : "TTC Live Alerts Feed"}</span>
          ) : null}
        </span>
        {isMobileMore ? (
          <span className="text-slate-400">
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        ) : null}
      </button>

      {/* Floating Logs Dropdown Card */}
      {isOpen && (
        <div
          className={`logs-dropdown-panel utility-popover ${isClosing ? "utility-popover--closing" : "utility-popover--opening"} absolute top-[48px] sm:top-[64px] ${isMobileMore ? "left-0 right-0 w-full" : "right-0 w-[min(calc(100vw-32px),550px)]"} rounded-2xl shadow-2xl flex flex-col z-50 border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0c10]/95 backdrop-blur-md text-slate-800 dark:text-slate-200`}
          data-popover-state={isClosing ? "closing" : "open"}
        >
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-black/10 dark:border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <Terminal size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
              <strong className="text-sm font-bold tracking-wide truncate">
                {network === "regional" ? "Ingested GO / UP Alerts" : "Ingested TTC Alerts"}
              </strong>
              {error && (
                <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-black uppercase tracking-wider border border-amber-500/20 shrink-0">
                  {network === "regional" ? "Unavailable" : "Fallback"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showActiveOnly}
                  onChange={(e) => setShowActiveOnly(e.target.checked)}
                  className="rounded border-black/20 dark:border-white/20 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                Active only
              </label>
              <button 
                onClick={fetchRawAlerts}
                disabled={loading}
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh alerts"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Alert List Container */}
          <div className="max-h-[60vh] overflow-y-auto p-4 flex flex-col gap-4">
            {network === "regional" ? (
              <div className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5" data-regional-data-coverage>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">Data Coverage</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${regionalHealth?.fresh
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}
                  >
                    {regionalHealth?.fresh ? "Fresh" : regionalHealth ? "Not fresh" : "Unavailable"}
                  </span>
                </div>
                {regionalHealth ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {regionalHealth.collections.map((collection) => (
                      <div key={collection.sourceSystem} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded border border-black/5 bg-white/70 px-2.5 py-2 text-[11px] dark:border-white/5 dark:bg-black/10">
                        <div className="min-w-0">
                          <strong className="block truncate text-slate-800 dark:text-slate-100">{collection.label}</strong>
                          <span className="text-slate-500 dark:text-slate-400">
                            {collection.kind === "operational" ? "Trip-level audit" : collection.required ? "Required rider feed" : "Supplemental rider feed"}
                            {collection.sourceUpdatedAt ? ` · ${formatImpactTimestamp(collection.sourceUpdatedAt)}` : ""}
                          </span>
                        </div>
                        <div className="text-right">
                          <strong className={collection.status === "complete" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
                            {collection.status.replaceAll("-", " ")}
                          </strong>
                          <span className="block text-slate-500 dark:text-slate-400">{collection.recordsFetched} records</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Detailed collection health is unavailable.</p>
                )}
                <div className="mt-2 rounded border border-black/5 bg-white/70 px-2.5 py-2 text-[11px] dark:border-white/5 dark:bg-black/10">
                  <strong className="text-slate-800 dark:text-slate-100">Published schedule coverage</strong>
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                    {regionalScheduleHealth
                      ? regionalScheduleHealth.scheduleActive && regionalScheduleHealth.lookaheadCovered
                        ? `Active across ${regionalScheduleHealth.mappedStationLines} station-corridor pairs through ${regionalScheduleHealth.requiredThrough}.`
                        : `Coverage is ${regionalScheduleHealth.status}; required through ${regionalScheduleHealth.requiredThrough}.`
                      : "Schedule lookahead health is unavailable."}
                  </p>
                </div>
              </div>
            ) : null}
            {loading && rawAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                <span className="text-xs text-slate-500">Loading raw feeds...</span>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-500">
                <AlertCircle className="w-6 h-6" />
                <span className="text-xs">
                  {showActiveOnly && rawAlerts.length > 0 ? "No active raw alerts stored." : "No raw alerts stored."}
                </span>
              </div>
            ) : network === "regional" ? (
              <>
                {goAlerts.length > 0 && (
                  <AlertGroup title="GO Rail" alerts={goAlerts} />
                )}
                {upAlerts.length > 0 && (
                  <AlertGroup title="UP Express" alerts={upAlerts} />
                )}
              </>
            ) : (
              <>
                {/* Live Routes Group */}
                {liveRoutesAlerts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-bold text-orange-500 dark:text-amber-500 uppercase tracking-wider px-1">
                      Routes ({liveRoutesAlerts.length})
                    </h3>
                    <div className="flex flex-col gap-2">
                      {liveRoutesAlerts.map(alert => renderAlertItem(alert))}
                    </div>
                  </div>
                )}

                {/* Live Accessibility Group */}
                {liveAccessibilityAlerts.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2">
                    <h3 className="text-xs font-bold text-orange-500 dark:text-amber-500 uppercase tracking-wider px-1">
                      Accessibility ({liveAccessibilityAlerts.length})
                    </h3>
                    <div className="flex flex-col gap-2">
                      {liveAccessibilityAlerts.map(alert => renderAlertItem(alert))}
                    </div>
                  </div>
                )}

                {/* GTFS-RT Routes Group */}
                {gtfsRtRoutesAlerts.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2">
                    <h3 className="text-xs font-bold text-orange-500 dark:text-amber-500 uppercase tracking-wider px-1">
                      GTFS-RT Routes ({gtfsRtRoutesAlerts.length})
                    </h3>
                    <div className="flex flex-col gap-2">
                      {gtfsRtRoutesAlerts.map(alert => renderAlertItem(alert))}
                    </div>
                  </div>
                )}

                {/* GTFS-RT Accessibility Group */}
                {gtfsRtAccessibilityAlerts.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2">
                    <h3 className="text-xs font-bold text-orange-500 dark:text-amber-500 uppercase tracking-wider px-1">
                      GTFS-RT Accessibility ({gtfsRtAccessibilityAlerts.length})
                    </h3>
                    <div className="flex flex-col gap-2">
                      {gtfsRtAccessibilityAlerts.map(alert => renderAlertItem(alert))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function AlertGroup({ title, alerts }: { title: string; alerts: RawAlert[] }) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold text-orange-500 dark:text-amber-500 uppercase tracking-wider px-1">
          {title} ({alerts.length})
        </h3>
        <div className="flex flex-col gap-2">
          {alerts.map(alert => renderAlertItem(alert))}
        </div>
      </div>
    );
  }

  function renderAlertItem(alert: RawAlert) {
    const uniqueId = `${alert.sourceSection || alert.source_section}-${alert.sourceId}`;
    const isExpanded = !!expandedIds[uniqueId];
    const title = getAlertTitle(alert.payload, alert.sourceId);
    const badges = getAlertBadges(alert.payload);
    
    let prettifiedPayload = alert.payload;
    try {
      prettifiedPayload = JSON.stringify(JSON.parse(alert.payload), null, 2);
    } catch {
      // Use original payload if JSON parse fails
    }

    return (
      <div 
        key={uniqueId}
        className="flex flex-col rounded-lg border border-black/5 dark:border-white/5 bg-white dark:bg-[#12151c] overflow-hidden min-w-0 w-full"
      >
        {/* Accordion Summary */}
        <button
          onClick={() => toggleExpand(uniqueId)}
          className="w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer outline-none"
        >
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2">
              {title}
            </div>
            
            {/* Badges and Active status */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {alert.active ? (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Active
                </span>
              ) : (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-500 border border-slate-500/10">
                  Inactive
                </span>
              )}
              
              {badges.map((badge, index) => {
                let badgeClass = "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/10";
                if (badge.type === "planned") {
                  badgeClass = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20";
                } else if (badge.type === "critical") {
                  badgeClass = "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20";
                } else if (badge.type === "route") {
                  badgeClass = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
                }
                
                return (
                  <span key={index} className={`text-[9px] font-medium tracking-wide px-1.5 py-0.5 rounded ${badgeClass}`}>
                    {badge.text}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="shrink-0 mt-0.5 text-slate-400">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>

        {/* Expanded JSON details */}
        {isExpanded && (
          <div className="border-t border-black/5 dark:border-white/5 bg-slate-50 dark:bg-black/40 p-3 flex flex-col gap-2 relative min-w-0 w-full overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Raw JSON Payload</span>
              <button
                onClick={() => handleCopy(uniqueId, alert.payload)}
                className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5 border border-black/10 dark:border-white/10"
              >
                {copiedId === uniqueId ? (
                  <>
                    <Check size={12} className="text-emerald-500" />
                    <span className="text-emerald-500 font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 bg-black/90 dark:bg-[#050608] text-emerald-400 rounded-lg overflow-x-auto text-[10px] font-mono border border-black/20 dark:border-white/5 select-all max-h-[300px] w-full block whitespace-pre">
              {prettifiedPayload}
            </pre>
          </div>
        )}
      </div>
    );
  }
}
