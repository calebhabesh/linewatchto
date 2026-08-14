"use client";

import { Bus, ChevronDown, LoaderCircle } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  buildPinnedSurfaceGroups,
  emptySurfaceArrivalSnapshot,
  filterActiveSurfaceArrivals,
  formatSurfaceArrivalClockTime,
  formatSurfaceArrivalTileLabel,
  getSurfaceArrivals,
  groupSurfaceArrivals,
  groupSurfaceArrivalsByBay,
  isSurfaceArrivalDue,
  parseSurfaceRouteDetails,
  shouldUseDetailedSurfaceArrivalCountdown,
  SURFACE_ARRIVAL_COUNTDOWN_TICK_MS,
  surfaceSourceSummary,
  type SurfaceArrivalGroup,
  type SurfaceArrivalSnapshot,
} from "../app/surface-arrivals";
import { isLrtOnlyStationId, isSubwayAndLrtStationId } from "../app/station-data";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import { useRegionalRailOperatingState } from "../hooks/useRegionalRailOperatingState";
import { useArrivalLinePins } from "../hooks/useArrivalLinePins";
import { ArrivalLinePinButton } from "./ArrivalLinePinButton";

const REFRESH_MS = 15_000;

type Props = {
  networkId: "ttc" | "regional";
  stationId: string;
  className?: string;
  variant?: "station-detail" | "saved-station";
};

function SurfaceRouteCard({
  group,
  networkId,
  isPinned,
  isHoveredPin,
  onHoverPinChange,
  onTogglePin,
  stationName,
  tick,
}: {
  group: SurfaceArrivalGroup;
  networkId: "ttc" | "regional";
  isPinned: boolean;
  isHoveredPin: boolean;
  onHoverPinChange: (hovered: boolean) => void;
  onTogglePin: () => void;
  stationName: string;
  tick: number;
}) {
  const details = parseSurfaceRouteDetails(group, networkId);
  const hasArrivals = group.arrivals.length > 0;
  const groupSourceLabel = !hasArrivals
    ? "No Service"
    : group.arrivals.some((arrival) => arrival.status === "live")
      ? group.arrivals.some((arrival) => arrival.status === "scheduled") ? "Mixed" : "Live"
      : "Scheduled";

  return (
    <article
      className={`rounded-md border p-2.5 shadow-sm transition-colors duration-150 ${
        isPinned || isHoveredPin
          ? "border-amber-400/60 bg-amber-400/[0.06] dark:border-amber-400/50 dark:bg-amber-400/[0.08]"
          : "border-black/10 bg-white/80 dark:border-white/10 dark:bg-[#12151c]/80"
      }`}
      data-surface-route={group.route}
      data-surface-mode={group.mode}
      data-pinned-route={isPinned ? "true" : "false"}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-black text-white ${
            networkId === "regional" ? "bg-emerald-700" : "bg-red-600"
          }`}
        >
          {group.route}
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm font-black text-slate-900 dark:text-white">
            {details.displayRouteName}
          </strong>
          {details.destinationTarget ? (
            <p className="mt-0.5 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
              {details.destinationTarget}
            </p>
          ) : null}
          <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {details.metaSubtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 self-center">
          <span
            className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-200"
          >
            {groupSourceLabel}
          </span>
          <ArrivalLinePinButton
            compact
            pinned={isPinned}
            hovered={isHoveredPin}
            onHoverChange={onHoverPinChange}
            lineLabel={`Route ${group.route}`}
            stationName={stationName || "Station"}
            onToggle={onTogglePin}
          />
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {hasArrivals ? (
          group.arrivals.map((arrival, index) => {
            const detailedCountdown = index === 0 && shouldUseDetailedSurfaceArrivalCountdown(arrival, tick);
            const due = isSurfaceArrivalDue(arrival, tick);
            const clockTime = formatSurfaceArrivalClockTime(arrival.predictedAt || arrival.scheduledAt);
            const arrivalLabelClassName = detailedCountdown && !due
              ? "whitespace-nowrap text-xs sm:text-lg font-black leading-none tabular-nums"
              : "text-base sm:text-lg font-black leading-none";
            const arrivalTileClassName = [
              "flex min-h-[58px] flex-col items-center justify-center rounded-md border px-2 py-1.5 text-center transition-colors",
              due
                ? "border-red-400/80 bg-red-900/85 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.25)]"
                : detailedCountdown
                  ? "border-emerald-400/35 bg-emerald-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(52,211,153,0.12)] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-white"
                  : "border-black/10 bg-slate-950/[0.03] text-slate-900 dark:border-white/10 dark:bg-[#0f1117] dark:text-white",
            ].join(" ");

            return (
              <div
                key={`${arrival.tripId}:${arrival.predictedAt}:${index}`}
                data-arrival-due={due ? "true" : "false"}
                className={arrivalTileClassName}
              >
                <strong className={arrivalLabelClassName}>
                  {formatSurfaceArrivalTileLabel(arrival, { detailedCountdown, now: tick })}
                </strong>
                {clockTime && (
                  <span
                    className={
                      due
                        ? "mt-1 text-xs font-semibold text-red-100/80"
                        : "mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400"
                    }
                  >
                    {clockTime}
                  </span>
                )}
              </div>
            );
          })
        ) : (
          <div className="col-span-3 flex min-h-[52px] items-center justify-center rounded-md border border-dashed border-black/10 bg-slate-950/[0.02] text-xs font-semibold text-slate-500 dark:border-white/10 dark:bg-[#0f1117]/50 dark:text-slate-400">
            No active arrivals
          </div>
        )}
      </div>
    </article>
  );
}

function SurfaceCompactRouteRow({
  group,
  networkId,
  isPinned,
  isHoveredPin,
  onHoverPinChange,
  onTogglePin,
  stationName,
  tick,
}: {
  group: SurfaceArrivalGroup;
  networkId: "ttc" | "regional";
  isPinned: boolean;
  isHoveredPin: boolean;
  onHoverPinChange: (hovered: boolean) => void;
  onTogglePin: () => void;
  stationName: string;
  tick: number;
}) {
  const details = parseSurfaceRouteDetails(group, networkId);
  const hasArrivals = group.arrivals.length > 0;
  const groupSourceLabel = !hasArrivals
    ? "None"
    : group.arrivals.some((arrival) => arrival.status === "live")
      ? group.arrivals.some((arrival) => arrival.status === "scheduled") ? "Mixed" : "Live"
      : "Scheduled";

  return (
    <article
      className={`saved-station-arrival-group is-surface-group${isPinned || isHoveredPin ? " is-pinned" : ""}`}
      data-surface-route={group.route}
      data-surface-mode={group.mode}
      data-pinned-route={isPinned ? "true" : "false"}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className={`inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded px-1 text-[10px] font-black text-white ${
            networkId === "regional" ? "bg-emerald-700" : "bg-red-600"
          }`}
        >
          {group.route}
        </span>
        <div className="saved-station-arrival-direction min-w-0 flex-1">
          <strong className="truncate">{details.displayRouteName}</strong>
          <span className="saved-station-arrival-destination truncate">
            {details.destinationTarget ? `${details.destinationTarget} · ${details.metaSubtitle}` : details.metaSubtitle}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`saved-station-arrival-source source-${groupSourceLabel.toLowerCase().replaceAll(" ", "-")}`}
        >
          {groupSourceLabel}
        </span>
        <span className="saved-station-arrival-times">
          {hasArrivals ? (
            group.arrivals.slice(0, 2).map((arrival, index) => {
              const detailed = index === 0 && shouldUseDetailedSurfaceArrivalCountdown(arrival, tick);
              const due = isSurfaceArrivalDue(arrival, tick);
              const soon = !due && ((Date.parse(arrival.predictedAt) - tick) <= 120_000 || arrival.minutes <= 2);

              return (
                <strong
                  key={`${arrival.tripId}:${arrival.predictedAt}:${index}`}
                  className={[detailed ? "is-detailed" : "", soon ? "is-soon" : "", due ? "is-due" : ""].filter(Boolean).join(" ") || undefined}
                  data-arrival-due={due ? "true" : "false"}
                >
                  {formatSurfaceArrivalTileLabel(arrival, { detailedCountdown: detailed, now: tick })}
                </strong>
              );
            })
          ) : (
            <em>—</em>
          )}
        </span>
        <ArrivalLinePinButton
          compact
          pinned={isPinned}
          hovered={isHoveredPin}
          onHoverChange={onHoverPinChange}
          lineLabel={`Route ${group.route}`}
          stationName={stationName || "Station"}
          onToggle={onTogglePin}
        />
      </div>
    </article>
  );
}

export function SurfaceConnectionsSection({ networkId, stationId, className, variant = "station-detail" }: Props) {
  const isSavedStationVariant = variant === "saved-station";
  const subwayOperatingState = useSubwayOperatingState();
  const regionalRailOperatingState = useRegionalRailOperatingState();
  const { pinnedLineIds, togglePin } = useArrivalLinePins(networkId, stationId);
  const [hoveredPinRoute, setHoveredPinRoute] = useState<string | null>(null);

  const isLrt = networkId === "ttc" && isLrtOnlyStationId(stationId);
  const isSubwayAndLrt = networkId === "ttc" && isSubwayAndLrtStationId(stationId);
  const isClosed = networkId === "ttc"
    ? subwayOperatingState.status === "closed"
    : regionalRailOperatingState.status === "closed";
  const closedTitle = networkId === "ttc"
    ? (isSubwayAndLrt ? "Subway & LRT Closed" : isLrt ? "LRT Closed" : "Subway Closed")
    : "GO & UP Rail Closed";

  const [state, setState] = useState<{ stationId: string; snapshot: SurfaceArrivalSnapshot }>(() => ({
    stationId: "",
    snapshot: emptySurfaceArrivalSnapshot(networkId, stationId),
  }));
  const [tick, setTick] = useState(() => Date.now());
  const loading = !isClosed && (state.stationId !== stationId || state.snapshot.networkId !== networkId);
  const snapshot = loading ? emptySurfaceArrivalSnapshot(networkId, stationId) : state.snapshot;

  const activeArrivals = useMemo(
    () => (isClosed ? [] : filterActiveSurfaceArrivals(snapshot.arrivals, tick)),
    [isClosed, snapshot.arrivals, tick],
  );
  const activeGroups = useMemo(
    () => (isClosed ? [] : groupSurfaceArrivals(activeArrivals)),
    [isClosed, activeArrivals],
  );
  const pinnedGroups = useMemo(
    () => (isClosed ? [] : buildPinnedSurfaceGroups(activeGroups, snapshot.arrivals, pinnedLineIds, networkId)),
    [isClosed, activeGroups, snapshot.arrivals, pinnedLineIds, networkId],
  );
  const allGroups = useMemo(() => {
    if (isClosed) return [];
    const missingPlaceholders = pinnedGroups.filter(
      (pg) => !activeGroups.some((ag) => ag.route === pg.route),
    );
    return [...activeGroups, ...missingPlaceholders];
  }, [isClosed, activeGroups, pinnedGroups]);

  const baySections = useMemo(
    () => (isClosed ? [] : groupSurfaceArrivalsByBay(allGroups, pinnedLineIds)),
    [isClosed, allGroups, pinnedLineIds],
  );

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
    const interval = window.setInterval(() => setTick(Date.now()), SURFACE_ARRIVAL_COUNTDOWN_TICK_MS);
    return () => window.clearInterval(interval);
  }, [isClosed]);

  if (isSavedStationVariant) {
    return (
      <details
        className={`surface-connections-details is-saved-station saved-station-arrivals${className ? ` ${className}` : ""}`}
        data-station-section="surface-connections"
        data-surface-connections-closed={isClosed ? "true" : undefined}
      >
        <summary className="surface-connections-summary block cursor-pointer list-none">
          <div className="saved-station-arrivals-heading flex items-center justify-between gap-2 min-w-0">
            <span className="flex items-center gap-1.5 min-w-0">
              <Bus size={15} className="shrink-0 text-slate-700 dark:text-slate-300" aria-hidden="true" />
              <strong className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                Surface Connections
              </strong>
              {!loading && !isClosed && allGroups.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-200 px-1 text-[10px] font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">
                  {allGroups.length}
                </span>
              )}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <small>
                {isClosed
                  ? networkId === "regional" ? "GO Bus connections" : "TTC bus & streetcar connections"
                  : loading
                    ? "Checking connections"
                    : surfaceSourceSummary(snapshot)}
              </small>
              <ChevronDown size={14} className="surface-connections-chevron shrink-0 text-slate-500" aria-hidden="true" />
            </div>
          </div>

          {!loading && !isClosed && pinnedGroups.length > 0 && (
            <div
              className="surface-connections-collapsed-pinned mt-2 flex flex-col gap-1.5"
              onClick={(event) => event.stopPropagation()}
            >
              {pinnedGroups.map((group, index) => (
                <Fragment key={group.key}>
                  {index > 0 && <div className="station-arrival-line-divider my-0.5 opacity-60" aria-hidden="true" />}
                  <SurfaceCompactRouteRow
                    group={group}
                    networkId={networkId}
                    isPinned={true}
                    isHoveredPin={hoveredPinRoute === group.route}
                    onHoverPinChange={(hovered) => setHoveredPinRoute(hovered ? group.route : null)}
                    onTogglePin={() => togglePin(`surface:${group.route}`)}
                    stationName={snapshot.stationName || "Station"}
                    tick={tick}
                  />
                </Fragment>
              ))}
            </div>
          )}
        </summary>

        <div className="surface-connections-content pt-2">
          {isClosed ? (
            <div className="rounded-md border border-black/10 bg-white/60 px-3 py-3 text-center dark:border-white/10 dark:bg-black/10">
              <p className="text-xs font-semibold leading-snug text-slate-500 dark:text-slate-400">
                <span className="block">{closedTitle}</span>
                <span className="block">Arrivals Not Available</span>
              </p>
            </div>
          ) : loading ? (
            <div className="flex min-h-12 items-center justify-center rounded-md border border-black/10 bg-white/60 dark:border-white/10 dark:bg-black/10">
              <LoaderCircle size={15} className="animate-spin text-slate-500" aria-label="Loading surface connections" />
            </div>
          ) : snapshot.availability === "available" && baySections.length > 0 ? (
            <div className="flex flex-col gap-2" aria-label="Upcoming surface connection arrivals">
              {baySections.map((baySection, bayIndex) => (
                <Fragment key={baySection.bayKey}>
                  {bayIndex > 0 && (
                    <div
                      aria-hidden="true"
                      className="station-arrival-line-divider my-1"
                      data-arrival-line-divider
                    />
                  )}
                  <div className="flex flex-col gap-1.5" data-surface-bay={baySection.bayKey}>
                    {baySection.groups.map((group, groupIndex) => {
                      const isPinned = pinnedLineIds.includes(`surface:${group.route}`) || pinnedLineIds.includes(group.route);
                      const isHoveredPin = hoveredPinRoute === group.route;

                      return (
                        <Fragment key={group.key}>
                          {groupIndex > 0 && <div className="station-arrival-line-divider my-0.5 opacity-60" aria-hidden="true" />}
                          <SurfaceCompactRouteRow
                            key={group.key}
                            group={group}
                            networkId={networkId}
                            isPinned={isPinned}
                            isHoveredPin={isHoveredPin}
                            onHoverPinChange={(hovered) => setHoveredPinRoute(hovered ? group.route : null)}
                            onTogglePin={() => togglePin(`surface:${group.route}`)}
                            stationName={snapshot.stationName || "Station"}
                            tick={tick}
                          />
                        </Fragment>
                      );
                    })}
                  </div>
                </Fragment>
              ))}
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

  return (
    <details
      className={`surface-connections-details rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5${className ? ` ${className}` : ""}`}
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
            {!loading && !isClosed && allGroups.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-xs font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">
                {allGroups.length}
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

        {!loading && !isClosed && pinnedGroups.length > 0 && (
          <div
            className="surface-connections-collapsed-pinned mt-2.5 flex flex-col gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            {pinnedGroups.map((group, index) => (
              <Fragment key={group.key}>
                {index > 0 && <div className="station-arrival-line-divider my-1" aria-hidden="true" />}
                <SurfaceRouteCard
                  group={group}
                  networkId={networkId}
                  isPinned={true}
                  isHoveredPin={hoveredPinRoute === group.route}
                  onHoverPinChange={(hovered) => setHoveredPinRoute(hovered ? group.route : null)}
                  onTogglePin={() => togglePin(`surface:${group.route}`)}
                  stationName={snapshot.stationName || "Station"}
                  tick={tick}
                />
              </Fragment>
            ))}
          </div>
        )}
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
        ) : snapshot.availability === "available" && baySections.length > 0 ? (
          <div className="flex flex-col gap-3" aria-label="Upcoming surface connection arrivals">
            {baySections.map((baySection, bayIndex) => {
              const showDivider = bayIndex > 0;
              return (
                <Fragment key={baySection.bayKey}>
                  {showDivider && (
                    <div
                      aria-hidden="true"
                      className="station-arrival-line-divider my-1"
                      data-arrival-line-divider
                    />
                  )}
                  <div className="flex flex-col gap-2" data-surface-bay={baySection.bayKey}>
                    {baySection.groups.map((group, groupIndex) => {
                      const isPinned = pinnedLineIds.includes(`surface:${group.route}`) || pinnedLineIds.includes(group.route);
                      const isHoveredPin = hoveredPinRoute === group.route;

                      return (
                        <Fragment key={group.key}>
                          {groupIndex > 0 && <div className="station-arrival-line-divider my-1" aria-hidden="true" />}
                          <SurfaceRouteCard
                            group={group}
                            networkId={networkId}
                            isPinned={isPinned}
                            isHoveredPin={isHoveredPin}
                            onHoverPinChange={(hovered) => setHoveredPinRoute(hovered ? group.route : null)}
                            onTogglePin={() => togglePin(`surface:${group.route}`)}
                            stationName={snapshot.stationName || "Station"}
                            tick={tick}
                          />
                        </Fragment>
                      );
                    })}
                  </div>
                </Fragment>
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
