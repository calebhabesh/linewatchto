"use client";

import { useState, useEffect, useRef } from "react";
import { Terminal, Copy, Check, ChevronDown, ChevronUp, AlertCircle, RefreshCw } from "lucide-react";
import { mockRawAlerts, RawAlert } from "../app/mock-raw-alerts";
import { apiUrl } from "../app/api-client.ts";

export function LogsDropdown({ isMobileMore = false }: { isMobileMore?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [rawAlerts, setRawAlerts] = useState<RawAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleDropdown = () => setIsOpen(!isOpen);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch raw alerts from backend on open, or fallback to mock raw alerts
  const fetchRawAlerts = () => {
    setLoading(true);
    setError(false);
    fetch(apiUrl("/api/alerts?type=raw"))
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data: RawAlert[]) => {
        setRawAlerts(data);
        setLoading(false);
      })
      .catch((err) => {
        console.warn("Backend raw alerts unavailable, falling back to mock fixtures:", err);
        setRawAlerts(mockRawAlerts);
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      Promise.resolve().then(() => {
        fetchRawAlerts();
      });
    }
  }, [isOpen]);

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

  const getAlertTitle = (payloadStr: string, sourceId: string) => {
    try {
      const parsed = JSON.parse(payloadStr);
      return parsed.title || parsed.headerText || parsed.customHeaderText || `Alert ID: ${sourceId}`;
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
            : "panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 transition-all cursor-pointer bg-white dark:bg-[#0a0c10] text-slate-800 dark:text-white"
        }
        aria-label="Toggle Ingestion Logs"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 32 32" fill="currentColor" className="w-5 h-5 sm:w-7 sm:h-7 text-slate-800 dark:text-white shrink-0">
            <rect x="10" y="18" width="8" height="2"/>
            <rect x="10" y="13" width="12" height="2"/>
            <rect x="10" y="23" width="5" height="2"/>
            <path d="M25,5H22V4a2,2,0,0,0-2-2H12a2,2,0,0,0-2,2V5H7A2,2,0,0,0,5,7V28a2,2,0,0,0,2,2H25a2,2,0,0,0,2-2V7A2,2,0,0,0,25,5ZM12,4h8V8H12ZM25,28H7V7h3v3H22V7h3Z"/>
          </svg>
          {isMobileMore ? (
            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">TTC GTFS Feed</span>
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
        <div className={`absolute top-[48px] sm:top-[64px] ${isMobileMore ? "left-0 right-0 w-full" : "right-0 w-[min(calc(100vw-32px),550px)]"} rounded-2xl shadow-2xl flex flex-col z-50 animate-in fade-in slide-in-from-top-2 duration-200 border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0c10]/95 backdrop-blur-md text-slate-800 dark:text-slate-200`}>
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-black/10 dark:border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <Terminal size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
              <strong className="text-sm font-bold tracking-wide truncate">Ingested TTC Alerts</strong>
              {error && (
                <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-black uppercase tracking-wider border border-amber-500/20 shrink-0">
                  Fallback
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
            {loading && rawAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                <span className="text-xs text-slate-500">Loading raw feeds...</span>
              </div>
            ) : rawAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-500">
                <AlertCircle className="w-6 h-6" />
                <span className="text-xs">No raw alerts stored.</span>
              </div>
            ) : (
              <>
                {/* Routes Group */}
                {routesAlerts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-bold text-orange-500 dark:text-amber-500 uppercase tracking-wider px-1">
                      Routes ({routesAlerts.length})
                    </h3>
                    <div className="flex flex-col gap-2">
                      {routesAlerts.map(alert => renderAlertItem(alert))}
                    </div>
                  </div>
                )}

                {/* Accessibility Group */}
                {accessibilityAlerts.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2">
                    <h3 className="text-xs font-bold text-orange-500 dark:text-amber-500 uppercase tracking-wider px-1">
                      Accessibility ({accessibilityAlerts.length})
                    </h3>
                    <div className="flex flex-col gap-2">
                      {accessibilityAlerts.map(alert => renderAlertItem(alert))}
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

  function renderAlertItem(alert: RawAlert) {
    const uniqueId = `${alert.sourceSection}-${alert.sourceId}`;
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
