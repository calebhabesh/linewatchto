"use client";

import { Bus, CalendarCheck2, ChevronDown, Layers, LoaderCircle } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  buildPinnedSurfaceGroups,
  emptySurfaceArrivalSnapshot,
  filterActiveSurfaceArrivals,
  formatSurfaceArrivalClockTime,
  formatSurfaceArrivalTileLabel,
  getSurfaceArrivalGroupBayKey,
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
import { useArrivalLinePins } from "../hooks/useArrivalLinePins";
import { ArrivalLinePinButton } from "./ArrivalLinePinButton";
import { LiveSignalIcon } from "./LiveSignalIcon";
import { ArrivalTileSourceIndicator } from "./ArrivalTileSourceIndicator";

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
  const hasLive = group.arrivals.some((arrival) => arrival.status === "live");
  const hasScheduled = group.arrivals.some((arrival) => arrival.status === "scheduled");
  const groupSourceLabel = !hasArrivals
    ? "No Service"
    : hasLive
      ? hasScheduled ? "Mixed" : "Live"
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
            className={
              groupSourceLabel === "Live"
                ? "shrink-0 inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-200"
                : groupSourceLabel === "Scheduled"
                  ? "shrink-0 inline-flex items-center rounded border border-slate-400/35 bg-slate-500/10 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300"
                  : groupSourceLabel === "Mixed"
                    ? "shrink-0 inline-flex items-center rounded border border-cyan-500/35 bg-cyan-500/10 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-200"
                    : "shrink-0 inline-flex items-center rounded border border-slate-400/30 bg-slate-500/5 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400"
            }
            data-arrival-source={groupSourceLabel.toLowerCase()}
          >
            {groupSourceLabel}
            {groupSourceLabel === "Live" ? (
              <LiveSignalIcon className="ml-1.5 inline-block shrink-0 text-emerald-600 dark:text-emerald-300" size={14.5} />
            ) : groupSourceLabel === "Scheduled" ? (
              <CalendarCheck2 className="ml-1.5 inline-block shrink-0 text-slate-500 dark:text-slate-400 relative -top-px" size={11} aria-hidden="true" />
            ) : groupSourceLabel === "Mixed" ? (
              <Layers className="ml-1.5 inline-block shrink-0 text-cyan-600 dark:text-cyan-400 relative -top-px" size={11} aria-hidden="true" />
            ) : null}
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

      {hasArrivals ? (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {group.arrivals.map((arrival, index) => {
            const detailedCountdown = index === 0 && shouldUseDetailedSurfaceArrivalCountdown(arrival, tick);
            const due = isSurfaceArrivalDue(arrival, tick);
            const clockTime = formatSurfaceArrivalClockTime(arrival.predictedAt || arrival.scheduledAt);
            const isCountdown = detailedCountdown && !due;
            const arrivalLabelClassName = isCountdown
              ? "whitespace-nowrap text-base sm:text-lg font-black leading-none tracking-tight tabular-nums"
              : "text-base sm:text-lg font-black leading-none";
            const arrivalTileClassName = [
              "relative flex min-h-[68px] sm:min-h-[72px] flex-col items-center justify-center rounded-md border px-1.5 pt-3.5 pb-1.5 text-center transition-colors",
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
                <ArrivalTileSourceIndicator status={arrival.status} isDue={due} size={12} />
                <strong className={arrivalLabelClassName}>
                  {formatSurfaceArrivalTileLabel(arrival, { detailedCountdown, now: tick })}
                </strong>
                {clockTime && (
                  <span
                    className={
                      due
                        ? "mt-1.5 text-xs font-semibold text-red-100/80"
                        : "mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400"
                    }
                  >
                    {clockTime}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-2.5 flex items-center justify-center text-center">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            No active arrivals
          </p>
        </div>
      )}
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
  const hasLive = group.arrivals.some((arrival) => arrival.status === "live");
  const hasScheduled = group.arrivals.some((arrival) => arrival.status === "scheduled");
  const groupSourceLabel = !hasArrivals
    ? "None"
    : hasLive
      ? hasScheduled ? "Mixed" : "Live"
      : "Scheduled";

  const sourceBadgeClassName = groupSourceLabel === "Live"
    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 border rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide inline-flex items-center"
    : groupSourceLabel === "Scheduled"
      ? "border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300 border rounded px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide inline-flex items-center"
      : groupSourceLabel === "Mixed"
        ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200 border rounded px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide inline-flex items-center"
        : "border-slate-400/30 bg-slate-500/5 text-slate-500 dark:text-slate-400 border rounded px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide inline-flex items-center";

  return (
    <article
      className={`saved-station-arrival-group is-surface-group w-full min-w-0 max-w-full overflow-hidden rounded-md border px-2.5 pt-2 pb-1.5 shadow-sm transition-colors duration-150 ${
        isPinned || isHoveredPin
          ? "border-amber-400/60 bg-amber-400/[0.06] dark:border-amber-400/50 dark:bg-amber-400/[0.08] is-pinned"
          : "border-black/10 bg-white/80 dark:border-white/10 dark:bg-[#12151c]/80"
      }`}
      data-surface-route={group.route}
      data-surface-mode={group.mode}
      data-pinned-route={isPinned ? "true" : "false"}
    >
      <div className="flex w-full min-w-0 max-w-full items-center gap-2">
        <span
          className={`inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-black leading-none text-white ${
            networkId === "regional" ? "bg-emerald-700" : "bg-red-600"
          }`}
        >
          {group.route}
        </span>
        <div className="saved-station-arrival-direction min-w-0 flex-1 overflow-hidden" style={{ minWidth: 0, width: 0 }}>
          <strong className="block truncate text-xs sm:text-sm font-black text-slate-900 dark:text-white">
            {details.displayRouteName}
          </strong>
          {details.destinationTarget ? (
            <p className="saved-station-arrival-destination mt-0.5 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
              {details.destinationTarget}
            </p>
          ) : null}
          <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {details.metaSubtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 self-center">
          <span
            className={`saved-station-arrival-source ${sourceBadgeClassName}`}
            data-arrival-source={groupSourceLabel.toLowerCase()}
          >
            {groupSourceLabel}
            {groupSourceLabel === "Live" ? (
              <LiveSignalIcon className="ml-1 inline-block shrink-0 text-emerald-600 dark:text-emerald-300" size={13} />
            ) : groupSourceLabel === "Scheduled" ? (
              <CalendarCheck2 className="ml-1 inline-block shrink-0 text-slate-500 dark:text-slate-400 relative -top-px" size={10.5} aria-hidden="true" />
            ) : groupSourceLabel === "Mixed" ? (
              <Layers className="ml-1 inline-block shrink-0 text-cyan-600 dark:text-cyan-400 relative -top-px" size={10.5} aria-hidden="true" />
            ) : null}
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

      {hasArrivals ? (
        <div className="saved-station-arrival-times mt-1.5 sm:mt-2 grid w-full min-w-0 grid-cols-3 gap-1.5 sm:gap-2">
          {group.arrivals.slice(0, 3).map((arrival, index) => {
            const detailed = index === 0 && shouldUseDetailedSurfaceArrivalCountdown(arrival, tick);
            const due = isSurfaceArrivalDue(arrival, tick);
            const clockTime = formatSurfaceArrivalClockTime(arrival.predictedAt || arrival.scheduledAt);
            const arrivalTileClassName = [
              "relative flex min-h-[64px] sm:min-h-[68px] flex-col items-center justify-center rounded-md border px-1.5 pt-3.5 pb-2 text-center transition-colors",
              due
                ? "border-red-400/80 bg-red-900/85 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.25)] is-due"
                : detailed
                  ? "border-emerald-400/35 bg-emerald-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(52,211,153,0.12)] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-white is-soon is-detailed"
                  : "border-black/10 bg-slate-950/[0.03] text-slate-900 dark:border-white/10 dark:bg-[#0f1117] dark:text-white",
            ].join(" ");

            return (
              <div
                key={`${arrival.tripId}:${arrival.predictedAt}:${index}`}
                data-arrival-due={due ? "true" : "false"}
                className={arrivalTileClassName}
              >
                <ArrivalTileSourceIndicator status={arrival.status} isDue={due} isCompact />
                <strong
                  className={detailed && !due
                    ? "mt-1.5 whitespace-nowrap text-[13px] sm:text-sm font-black leading-none tracking-tight tabular-nums"
                    : "mt-1.5 text-sm sm:text-base font-black leading-none"}
                >
                  {formatSurfaceArrivalTileLabel(arrival, { detailedCountdown: detailed, now: tick })}
                </strong>
                {clockTime && (
                  <span
                    className={
                      due
                        ? "mt-0.5 text-[10px] font-semibold text-red-100/80"
                        : "mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400"
                    }
                  >
                    {clockTime}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-2 flex items-center justify-center text-center">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            No active arrivals
          </p>
        </div>
      )}
    </article>
  );
}

export function SurfaceConnectionsSection({ networkId, stationId, className, variant = "station-detail" }: Props) {
  const isSavedStationVariant = variant === "saved-station";
  const { pinnedLineIds, togglePin } = useArrivalLinePins(networkId, stationId);
  const [hoveredPinRoute, setHoveredPinRoute] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<SurfaceArrivalSnapshot>(() =>
    emptySurfaceArrivalSnapshot(networkId, stationId),
  );
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const result = await getSurfaceArrivals(networkId, stationId);
        if (mounted) {
          setSnapshot(result);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setSnapshot(emptySurfaceArrivalSnapshot(networkId, stationId));
          setLoading(false);
        }
      }
    }

    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [networkId, stationId]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), SURFACE_ARRIVAL_COUNTDOWN_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const activeArrivals = useMemo(
    () => filterActiveSurfaceArrivals(snapshot.arrivals, tick),
    [snapshot.arrivals, tick],
  );

  const allGroups = useMemo(
    () => groupSurfaceArrivals(snapshot.arrivals, activeArrivals),
    [snapshot.arrivals, activeArrivals],
  );

  const baySections = useMemo(
    () => groupSurfaceArrivalsByBay(allGroups, pinnedLineIds),
    [allGroups, pinnedLineIds],
  );

  const pinnedGroups = useMemo(
    () => buildPinnedSurfaceGroups(allGroups, snapshot.arrivals, pinnedLineIds, networkId),
    [allGroups, snapshot.arrivals, pinnedLineIds, networkId],
  );

  if (isSavedStationVariant) {
    return (
      <details
        className={`surface-connections-details is-saved-station saved-station-arrivals w-full min-w-0 max-w-full overflow-hidden${className ? ` ${className}` : ""}`}
        data-station-section="surface-connections"
      >
        <summary className="surface-connections-summary block w-full min-w-0 max-w-full cursor-pointer list-none overflow-hidden">
          <div className="saved-station-arrivals-heading flex w-full min-w-0 max-w-full flex-col items-start text-left gap-0.5 overflow-hidden">
            <div className="flex items-center justify-between gap-2 w-full min-w-0 max-w-full">
              <span className="flex items-center gap-1.5 min-w-0 max-w-full text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                <Bus size={15} className="shrink-0 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                <strong>Surface Connections</strong>
                {!loading && allGroups.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-200 px-1 text-[10px] font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">
                    {allGroups.length}
                  </span>
                )}
              </span>
              <ChevronDown size={14} className="surface-connections-chevron shrink-0 text-slate-500" aria-hidden="true" />
            </div>
            <p className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate w-full min-w-0 max-w-full">
              {loading
                ? "Checking connections"
                : surfaceSourceSummary(snapshot)}
            </p>
          </div>

          {!loading && pinnedGroups.length > 0 && (
            <div
              className="surface-connections-collapsed-pinned mt-2 flex w-full min-w-0 max-w-full flex-col gap-1.5 overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              {pinnedGroups.map((group, index) => {
                const showDivider =
                  index > 0 &&
                  getSurfaceArrivalGroupBayKey(group) !==
                    getSurfaceArrivalGroupBayKey(pinnedGroups[index - 1]);
                return (
                  <Fragment key={group.key}>
                    {showDivider && (
                      <div className="station-arrival-line-divider my-0.5 opacity-60" aria-hidden="true" />
                    )}
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
                );
              })}
            </div>
          )}
        </summary>

        <div className="surface-connections-content w-full min-w-0 max-w-full overflow-hidden pt-2">
          {loading ? (
            <div className="flex min-h-12 items-center justify-center rounded-md border border-black/10 bg-white/60 dark:border-white/10 dark:bg-black/10">
              <LoaderCircle size={15} className="animate-spin text-slate-500" aria-label="Loading surface connections" />
            </div>
          ) : baySections.length > 0 ? (
            <div className="flex w-full min-w-0 max-w-full flex-col gap-2 overflow-hidden" aria-label="Upcoming surface connection arrivals">
              {baySections.map((baySection, bayIndex) => (
                <Fragment key={baySection.bayKey}>
                  {bayIndex > 0 && (
                    <div
                      aria-hidden="true"
                      className="station-arrival-line-divider my-1"
                      data-arrival-line-divider
                    />
                  )}
                  <div className="flex w-full min-w-0 max-w-full flex-col gap-1.5 overflow-hidden" data-surface-bay={baySection.bayKey}>
                    {baySection.groups.map((group) => {
                      const isPinned = pinnedLineIds.includes(`surface:${group.route}`) || pinnedLineIds.includes(group.route);
                      const isHoveredPin = hoveredPinRoute === group.route;

                      return (
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
                      );
                    })}
                  </div>
                </Fragment>
              ))}
            </div>
          ) : (
            <p className="my-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
              {snapshot.message}
            </p>
          )}
          {!loading && (snapshot.availability === "available" || baySections.length > 0) ? (
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
    >
      <summary className="surface-connections-summary block cursor-pointer list-none">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
            <Bus size={20} className="shrink-0 text-slate-700 dark:text-slate-300" aria-hidden="true" />
            <span className="text-lg font-black text-slate-900 dark:text-white truncate">Surface Connections</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!loading && allGroups.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-xs font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">
                {allGroups.length}
              </span>
            )}
            <ChevronDown size={18} className="surface-connections-chevron shrink-0 text-slate-500" aria-hidden="true" />
          </div>
        </div>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {loading
            ? "Checking station connections"
            : surfaceSourceSummary(snapshot)}
        </p>

        {!loading && pinnedGroups.length > 0 && (
          <div
            className="surface-connections-collapsed-pinned mt-2.5 flex flex-col gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            {pinnedGroups.map((group, index) => {
              const showDivider =
                index > 0 &&
                getSurfaceArrivalGroupBayKey(group) !==
                  getSurfaceArrivalGroupBayKey(pinnedGroups[index - 1]);
              return (
                <Fragment key={group.key}>
                  {showDivider && <div className="station-arrival-line-divider my-1" aria-hidden="true" />}
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
              );
            })}
          </div>
        )}
      </summary>

      <div className="surface-connections-content pt-3">
        {loading ? (
          <div className="flex min-h-16 items-center justify-center rounded-md border border-black/10 bg-white/60 dark:border-white/10 dark:bg-black/10">
            <LoaderCircle size={19} className="animate-spin text-slate-500" aria-label="Loading surface connections" />
          </div>
        ) : baySections.length > 0 ? (
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
                    {baySection.groups.map((group) => {
                      const isPinned = pinnedLineIds.includes(`surface:${group.route}`) || pinnedLineIds.includes(group.route);
                      const isHoveredPin = hoveredPinRoute === group.route;

                      return (
                        <SurfaceRouteCard
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
                      );
                    })}
                  </div>
                </Fragment>
              );
            })}
          </div>
        ) : (
          <p className="my-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
            {snapshot.message}
          </p>
        )}
        {!loading && (snapshot.availability === "available" || baySections.length > 0) ? (
          <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
            Surface routes stay off the schematic map. Bay and platform labels are source-published and are never inferred by proximity.
          </p>
        ) : null}
      </div>
    </details>
  );
}
