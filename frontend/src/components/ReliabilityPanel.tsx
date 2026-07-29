"use client";

import Image from "next/image";
import { useDashboardData } from "../app/DataContext";
import { 
  BarChart3, 
  ShieldCheck, 
  ChevronLeft, 
  X, 
  Bus, 
  Accessibility 
} from "lucide-react";

interface ReliabilityProps {
  onBack?: () => void;
  onClose?: () => void;
}

function StreetcarIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18.5 3L17.5135 2.50675C17.1355 2.31776 16.9465 2.22326 16.7485 2.15662C16.5725 2.09744 16.3915 2.05471 16.2077 2.02897C16.0008 2 15.7895 2 15.3669 2H8.63313C8.21053 2 7.99923 2 7.79227 2.02897C7.60847 2.05471 7.42745 2.09744 7.25155 2.15662C7.05348 2.22326 6.86449 2.31776 6.4865 2.50675L5.5 3M11 6L9 2M13 6L15 2M4 13H20M17 20L18 22M7 20L6.00016 22M8.5 16.5H8.51M15.5 16.5H15.51M8.8 20H15.2C16.8802 20 17.7202 20 18.362 19.673C18.9265 19.3854 19.3854 18.9265 19.673 18.362C20 17.7202 20 16.8802 20 15.2V10.8C20 9.11984 20 8.27976 19.673 7.63803C19.3854 7.07354 18.9265 6.6146 18.362 6.32698C17.7202 6 16.8802 6 15.2 6H8.8C7.11984 6 6.27976 6 5.63803 6.32698C5.07354 6.6146 4.6146 7.07354 4.32698 7.63803C4 8.27976 4 9.11984 4 10.8V15.2C4 16.8802 4 17.7202 4.32698 18.362C4.6146 18.9265 5.07354 19.3854 5.63803 19.673C6.27976 20 7.11984 20 8.8 20ZM9 16.5C9 16.7761 8.77614 17 8.5 17C8.22386 17 8 16.7761 8 16.5C8 16.2239 8.22386 16 8.5 16C8.77614 16 9 16.2239 9 16.5ZM16 16.5C16 16.7761 15.7761 17 15.5 17C15.2239 17 15 16.7761 15 16.5C15 16.2239 15.2239 16 15.5 16C15.7761 16 16 16.2239 16 16.5Z" />
    </svg>
  );
}

function getMetricDetails(id: string, originalLabel: string) {
  switch (id) {
    case "line-1":
      return {
        label: "Line 1 Yonge-University",
        icon: (
          <Image
            src="/assets/linewatch/line-1-legend.svg?v=2"
            alt="Line 1 icon"
            width={24}
            height={24}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "line-2":
      return {
        label: "Line 2 Bloor-Danforth",
        icon: (
          <Image
            src="/assets/linewatch/line-2-legend.svg?v=2"
            alt="Line 2 icon"
            width={24}
            height={24}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "line-4":
      return {
        label: "Line 4 Sheppard",
        icon: (
          <Image
            src="/assets/linewatch/line-4-legend.svg?v=2"
            alt="Line 4 icon"
            width={24}
            height={24}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "line-5":
      return {
        label: "Line 5 Eglinton",
        icon: (
          <Image
            src="/assets/linewatch/line-5-legend.svg?v=2"
            alt="Line 5 icon"
            width={24}
            height={24}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "line-6":
      return {
        label: "Line 6 Finch West",
        icon: (
          <Image
            src="/assets/linewatch/line-6-legend.svg?v=2"
            alt="Line 6 icon"
            width={24}
            height={24}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "bus":
      return {
        label: "Bus",
        icon: <Bus className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />,
      };
    case "streetcar":
      return {
        label: "Streetcar",
        icon: <StreetcarIcon className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />,
      };
    case "wheel-trans":
      return {
        label: "Wheel-Trans",
        icon: <Accessibility className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />,
      };
    case "elevators":
      return {
        label: "Elevators",
        icon: (
          <Image
            src="/assets/linewatch/outages/elevator.svg"
            alt="Elevators icon"
            width={20}
            height={20}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "escalators":
      return {
        label: "Escalators",
        icon: (
          <Image
            src="/assets/linewatch/outages/escalator.svg"
            alt="Escalators icon"
            width={20}
            height={20}
            className="shrink-0 object-contain"
          />
        ),
      };
    default:
      return {
        label: originalLabel,
        icon: <BarChart3 className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />,
      };
  }
}

export function ReliabilityPanel({ onBack, onClose }: ReliabilityProps = {}) {
  const { networkId, reliability, ttcPerformance } = useDashboardData();
  const metrics = ttcPerformance.metrics;

  const onTimeMetrics = metrics.filter(m => m.category !== "accessibility");
  const availabilityMetrics = metrics.filter(m => m.category === "accessibility");

  const renderMetric = (item: typeof metrics[0]) => {
    const details = getMetricDetails(item.id, item.label);
    return (
      <div key={item.id} className="reliability-row min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5 flex flex-col justify-between gap-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {details.icon}
            <div className="reliability-copy min-w-0">
              <strong className="text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">{details.label}</strong>
            </div>
          </div>
          <strong className="text-sm text-slate-700 dark:text-slate-300 font-bold whitespace-nowrap">{item.valueLabel}</strong>
        </div>
        {item.percentage !== null ? (
          <div className="flex flex-col gap-1.5">
            <div className="score-track relative bg-black/10 dark:bg-white/10 rounded-full h-2 mx-4">
              <div className="bg-gradient-to-r from-amber-500 to-green-500 h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, item.percentage))}%` }} />
              {item.target != null && (
                <div 
                  className="absolute top-[-3px] bottom-[-3px] w-[3px] bg-slate-800 dark:bg-white z-10 rounded-full shadow-sm"
                  style={{ left: `${item.target}%`, transform: 'translateX(-50%)' }}
                  title={`Target: ${item.target}%`}
                />
              )}
            </div>
            {item.target != null && (
              <div className="relative h-3 mx-4">
                <span 
                  className="absolute text-[9px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap"
                  style={{ left: `${item.target}%`, transform: 'translateX(-50%)' }}
                >
                  Target: {item.target}%
                </span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="analytics-panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl" style={{ WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden" }}>
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1 sm:p-2 -ml-1.5 sm:ml-0 mr-1 sm:mr-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              aria-label="Back"
            >
              <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-2 whitespace-nowrap">
              <BarChart3 className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-purple-500 shrink-0" />
              <span>Reliability Analytics</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {reliability.coverageLabel} · {reliability.confidence} confidence
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 sm:p-2 -mr-1.5 sm:mr-0 ml-1 sm:ml-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        )}
      </div>
      <div className="reliability-list min-w-0 p-3 flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-black text-slate-900 dark:text-white">
                Observed disruptions · 30 days
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Source: {reliability.source}
              </p>
            </div>
            <span className="rounded-md border border-black/10 dark:border-white/10 px-2 py-1 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300">
              {reliability.confidence}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{reliability.message}</p>
          {reliability.metrics.length === 0 ? (
            <div className="reliability-row min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5">
              <strong className="text-sm font-bold text-slate-800 dark:text-white">History is accumulating</strong>
              <p className="text-xs text-slate-500 dark:text-slate-400">{reliability.coverageLabel}</p>
            </div>
          ) : reliability.metrics.map((item) => {
            const details = getMetricDetails(item.id, item.label);
            return (
              <div key={item.id} className="reliability-row min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {details.icon}
                    <strong className="text-sm font-bold text-slate-800 dark:text-white">
                      {networkId === "regional" && item.number ? `${item.number} · ` : ""}{details.label}
                    </strong>
                  </div>
                  <strong className="whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                    {item.incidents} {item.incidents === 1 ? "incident" : "incidents"}
                  </strong>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {item.medianDurationMinutes == null
                    ? "No completed incident duration yet"
                    : `Median ${item.medianDurationMinutes} min`}
                  {" · "}{item.observedDisruptionMinutes} observed disruption min
                  {item.activeIncidents > 0 ? ` · ${item.activeIncidents} active` : ""}
                </p>
              </div>
            );
          })}
        </div>

        {networkId === "ttc" && <hr className="border-black/10 dark:border-white/10 my-2" />}

        {networkId === "ttc" && (
          <div className="flex flex-col gap-2">
            <h3 className="text-[15px] font-black text-slate-900 dark:text-white">Official TTC Performance</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Source: {ttcPerformance.source} · Updated: {ttcPerformance.updatedLabel}
            </p>
          </div>
        )}

        {networkId === "ttc" && (metrics.length === 0 ? (
          <div className="reliability-row min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5">
            <strong className="text-sm font-bold text-slate-800 dark:text-white">Official metrics unavailable</strong>
            <p className="text-xs text-slate-500 dark:text-slate-400">{ttcPerformance.message}</p>
          </div>
        ) : (
          <>
            {onTimeMetrics.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-[15px] font-black text-slate-900 dark:text-white mb-1">On-Time Performance</h3>
                {onTimeMetrics.map(renderMetric)}
              </div>
            )}
            
            {onTimeMetrics.length > 0 && availabilityMetrics.length > 0 && (
              <hr className="border-black/10 dark:border-white/10 my-2" />
            )}

            {availabilityMetrics.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-[15px] font-black text-slate-900 dark:text-white mb-1">Availability</h3>
                {availabilityMetrics.map(renderMetric)}
              </div>
            )}
          </>
        ))}
      </div>
    </section>
  );
}

export function IngestionHealthPanel() {
  const { ingestionHealth } = useDashboardData();
  return (
    <section className="health-panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <div className="panel-heading border-b border-black/10 dark:border-white/10 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white flex min-w-0 items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-500" />
          Ingestion System Health
        </h2>
      </div>
      <div className="health-grid min-w-0 p-3 grid grid-cols-1 gap-3">
        {ingestionHealth.map((health, idx) => (
          <div
            key={idx}
            className="health-item min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5 flex gap-3 items-start"
          >
            <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] mt-1.5" />
            <div className="min-w-0">
              <strong className="text-xs font-bold text-slate-800 dark:text-white whitespace-normal break-words">
                {health.label}
              </strong>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-normal break-words">
                {health.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
