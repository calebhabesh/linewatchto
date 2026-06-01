"use client";

import { AlertTriangle, Accessibility, Clock3, X } from "lucide-react";
import type { StationDataResult, StationDetail } from "../app/station-data";

type Props = {
  stationResult: StationDataResult<StationDetail | null> | null;
  loading: boolean;
  selectedStationName?: string;
  onClose: () => void;
};

export function StationDetailPanel({ stationResult, loading, selectedStationName, onClose }: Props) {
  const station = stationResult?.data ?? null;
  const source = stationResult?.source;

  return (
    <aside
      className="station-detail-panel fixed left-0 right-0 bottom-0 z-30 max-h-[64vh] overflow-y-auto rounded-t-lg border border-black/10 bg-white p-4 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#0a0c10] dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-6 md:w-[min(calc(100vw-48px),390px)] md:max-h-none md:rounded-lg"
      aria-live="polite"
      aria-label={station ? `${station.name} station details` : "Station details"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Station
          </span>
          <h2 className="mt-1 break-words text-xl font-black text-slate-950 dark:text-white">
            {station?.name ?? selectedStationName ?? "Station details"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/10 text-slate-700 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          aria-label="Close station details"
        >
          <X size={20} />
        </button>
      </div>

      {loading && (
        <div className="mt-4 rounded-lg border border-black/10 bg-slate-100 p-3 text-sm font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          Loading station details...
        </div>
      )}

      {!loading && !station && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          Station detail is unavailable for this stop.
        </div>
      )}

      {!loading && station && (
        <div className="mt-4 flex flex-col gap-4">
          {source === "fallback" && (
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-3 text-xs font-semibold text-blue-700 dark:text-blue-300">
              Backend unavailable. Showing local fallback station data.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {station.lines.map((line) => (
              <span
                key={line.id}
                className="inline-flex min-h-8 items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-black dark:border-white/10"
                style={{ backgroundColor: line.color, color: line.id === "line-1" ? "#000000" : "#ffffff" }}
                title={line.platformLabel}
              >
                {line.number}
                <span>{line.name}</span>
              </span>
            ))}
          </div>

          <section className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <h3 className="flex items-center gap-2 text-sm font-black">
              <Accessibility size={16} />
              Access
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{station.access.summary}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {station.access.updatedAgo}
            </p>
          </section>

          <section className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <h3 className="flex items-center gap-2 text-sm font-black">
              <AlertTriangle size={16} />
              Station impacts
            </h3>
            {station.impacts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No seeded impacts for this station.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {station.impacts.map((impact) => (
                  <div key={impact.id} className="rounded-md border border-black/10 bg-white p-2 text-sm dark:border-white/10 dark:bg-[#12151c]">
                    <strong className="block text-slate-900 dark:text-white">{impact.title}</strong>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">{impact.summary}</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {impact.source} / {impact.updatedAgo}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <h3 className="flex items-center gap-2 text-sm font-black">
              <Clock3 size={16} />
              Demo arrivals
            </h3>
            <div className="mt-2 flex flex-col gap-2">
              {station.arrivals.map((arrival, index) => (
                <div key={`${arrival.lineId}-${arrival.direction}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-white p-2 text-sm dark:bg-[#12151c]">
                  <span className="min-w-0 break-words">{arrival.direction}</span>
                  <strong className="shrink-0">{arrival.minutes} min</strong>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{station.disclaimer || "Arrivals are demo placeholders, not live TTC predictions."}</p>
          </section>
        </div>
      )}
    </aside>
  );
}
