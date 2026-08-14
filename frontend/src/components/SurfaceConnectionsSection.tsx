"use client";

import { Bus, ChevronDown, LoaderCircle, TrainFront } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  emptySurfaceArrivalSnapshot,
  getSurfaceArrivals,
  groupSurfaceArrivals,
  surfaceArrivalLabel,
  surfaceSourceSummary,
  type SurfaceArrivalSnapshot,
} from "../app/surface-arrivals";
import { isLrtOnlyStationId } from "../app/station-data";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import { useRegionalRailOperatingState } from "../hooks/useRegionalRailOperatingState";

const REFRESH_MS = 15_000;

type Props = {
  networkId: "ttc" | "regional";
  stationId: string;
};

export function SurfaceConnectionsSection({ networkId, stationId }: Props) {
  const subwayOperatingState = useSubwayOperatingState();
  const regionalRailOperatingState = useRegionalRailOperatingState();

  const isLrt = networkId === "ttc" && isLrtOnlyStationId(stationId);
  const isClosed = networkId === "ttc"
    ? subwayOperatingState.status === "closed"
    : regionalRailOperatingState.status === "closed";
  const closedTitle = networkId === "ttc" ? (isLrt ? "LRT Closed" : "Subway Closed") : "GO & UP Rail Closed";

  const [state, setState] = useState<{ stationId: string; snapshot: SurfaceArrivalSnapshot }>(() => ({
    stationId: "",
    snapshot: emptySurfaceArrivalSnapshot(networkId, stationId),
  }));
  const [tick, setTick] = useState(() => Date.now());
  const loading = !isClosed && (state.stationId !== stationId || state.snapshot.networkId !== networkId);
  const snapshot = loading ? emptySurfaceArrivalSnapshot(networkId, stationId) : state.snapshot;
  const groups = useMemo(() => isClosed ? [] : groupSurfaceArrivals(snapshot.arrivals), [isClosed, snapshot.arrivals]);

  useEffect(() => {
    if (isClosed) return;
    let active = true;
    let controller: AbortController | null = null;
    const refresh = () => {
      controller?.abort();
      controller = new AbortController();
      void getSurfaceArrivals(networkId, stationId, { signal: controller.signal }).then((result) => {
        if (active) setState({ stationId, snapshot: result });
      }).catch(() => undefined);
    };
    refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [networkId, stationId, isClosed]);

  useEffect(() => {
    if (isClosed) return;
    const interval = window.setInterval(() => setTick(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, [isClosed]);

  return (
    <details
      className="surface-connections-details rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
      data-station-section="surface-connections"
      data-surface-connections-closed={isClosed ? "true" : undefined}
    >
      <summary className="surface-connections-summary block cursor-pointer list-none">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Bus size={20} className="shrink-0 text-slate-700 dark:text-slate-300" aria-hidden="true" />
            <span className="text-lg font-black text-slate-900 dark:text-white truncate">Surface Connections</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!loading && !isClosed && groups.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-xs font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">
                {groups.length}
              </span>
            )}
            <ChevronDown size={18} className="surface-connections-chevron shrink-0 text-slate-500" aria-hidden="true" />
          </div>
        </div>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {isClosed
            ? networkId === "regional" ? "GO Bus connections" : "TTC bus and streetcar connections"
            : loading
              ? "Checking station connections"
              : surfaceSourceSummary(snapshot)}
        </p>
      </summary>

      <div className="surface-connections-content pt-3">
        {isClosed ? (
          <div className="rounded-md border border-black/10 bg-white/60 px-3 py-4 text-center dark:border-white/10 dark:bg-black/10">
            <p className="text-sm font-semibold leading-snug text-slate-500 dark:text-slate-400">
              <span className="block">{closedTitle}</span>
              <span className="block">Arrivals Not Available</span>
            </p>
          </div>
        ) : loading ? (
          <div className="flex min-h-16 items-center justify-center rounded-md border border-black/10 bg-white/60 dark:border-white/10 dark:bg-black/10">
            <LoaderCircle size={19} className="animate-spin text-slate-500" aria-label="Loading surface connections" />
          </div>
        ) : snapshot.availability === "available" && groups.length > 0 ? (
          <div className="flex flex-col gap-2" aria-label="Upcoming surface connection arrivals">
            {groups.map((group) => {
              const ModeIcon = group.mode === "streetcar" ? TrainFront : Bus;
              return (
                <article
                  key={group.key}
                  className="rounded-md border border-black/10 bg-white/80 p-2.5 dark:border-white/10 dark:bg-[#12151c]/80"
                  data-surface-route={group.route}
                  data-surface-mode={group.mode}
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className={`inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-black text-white ${networkId === "regional" ? "bg-emerald-700" : "bg-red-600"}`}>
                      {group.route}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <ModeIcon size={14} className="shrink-0 text-slate-500" aria-hidden="true" />
                        <strong className="truncate text-sm font-black text-slate-900 dark:text-white">
                          {group.destination || group.routeName || `${group.mode} service`}
                        </strong>
                      </div>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {group.mode === "streetcar" ? "TTC Streetcar" : networkId === "regional" ? "GO Bus" : "TTC Bus"}
                        {group.bayPlatform ? ` · ${group.bayPlatform}` : " · Bay not supplied"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                      {group.arrivals.some((arrival) => arrival.status === "live")
                        ? group.arrivals.some((arrival) => arrival.status === "scheduled") ? "Mixed" : "Live"
                        : "Scheduled"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-[42px]">
                    {group.arrivals.map((arrival, index) => (
                      <span
                        key={`${arrival.tripId}:${arrival.predictedAt}:${index}`}
                        className="inline-flex min-h-7 items-center rounded-md border border-black/10 bg-slate-950/[0.03] px-2 text-xs font-black tabular-nums text-slate-900 dark:border-white/10 dark:bg-black/20 dark:text-white"
                      >
                        {surfaceArrivalLabel(arrival, tick)}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-black/10 bg-white/60 px-3 py-3 text-center dark:border-white/10 dark:bg-black/10">
            <p className="text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
              {snapshot.message}
            </p>
          </div>
        )}
        {!loading && !isClosed && snapshot.availability === "available" ? (
          <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
            Surface routes stay off the schematic map. Bay and platform labels are source-published and are never inferred by proximity.
          </p>
        ) : null}
      </div>
    </details>
  );
}
