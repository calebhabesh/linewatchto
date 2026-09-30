"use client";

import { useDashboardData } from "../app/DataContext";

import { Bus, CalendarCheck2, ChevronDown, Layers, LoaderCircle } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  buildPinnedSurfaceGroups,
  emptySurfaceArrivalSnapshot,
  filterActiveSurfaceArrivals,
  formatSurfaceArrivalClockTime,
  formatSurfaceArrivalTileLabel,
  getSurfaceArrivalDelayMinutes,
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
import { ArrivalSourceBadge } from "./ArrivalSourceBadge";
import { ArrivalDelayBadge } from "./ArrivalDelayBadge";

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
    ? "Unavailable"
    : hasLive
      ? hasScheduled ? "Mixed" : "Live"
      : "Scheduled";

  return (
    <article
      className={`flex flex-col gap-2 rounded-lg px-1 py-1.5 transition-colors duration-200 ${
        isPinned
          ? "bg-amber-500/[0.08] dark:bg-amber-400/[0.07]"
          : isHoveredPin
            ? "bg-amber-500/[0.03] dark:bg-amber-400/[0.03]"
            : "bg-transparent"
      }`}
      data-surface-route={group.route}
      data-surface-mode={group.mode}
      data-pinned-route={isPinned ? "true" : "false"}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-black text-white shadow-sm ${
              networkId === "regional" ? "bg-emerald-700" : "bg-red-600"
            }`}
          >
            {group.route}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <strong className="block truncate text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                {details.displayRouteName}
              </strong>
              {isPinned && (
                <span
                  className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 shrink-0 select-none animate-in fade-in duration-200"
                  data-pinned-badge
                >
                  Starred
                </span>
              )}
            </div>
            {details.destinationTarget ? (
              <p className="mt-0.5 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                {details.destinationTarget}
              </p>
            ) : null}
            <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {details.metaSubtitle}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-center">
          <ArrivalSourceBadge label={groupSourceLabel} />
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
        <div className="mt-3 grid grid-cols-3 gap-2">
          {group.arrivals.map((arrival, index) => {
            const detailedCountdown = index === 0 && shouldUseDetailedSurfaceArrivalCountdown(arrival, tick);
            const due = isSurfaceArrivalDue(arrival, tick);
            const clockTime = formatSurfaceArrivalClockTime(arrival.predictedAt || arrival.scheduledAt);
            const scheduledClockTime = formatSurfaceArrivalClockTime(arrival.scheduledAt);
            const delayMinutes = getSurfaceArrivalDelayMinutes(arrival, tick);
            const delayed = delayMinutes !== null;
            const isCountdown = detailedCountdown && !due;
            const arrivalLabelClassName = isCountdown
              ? "whitespace-nowrap text-base sm:text-lg font-black leading-none tracking-tight tabular-nums"
              : "text-base sm:text-lg font-black leading-none";
            const arrivalTileClassName = [
              "surface-departure-tile relative flex min-h-[74px] sm:min-h-[78px] flex-col items-center justify-center rounded-md border px-1.5 pt-3.5 pb-1.5 text-center transition-colors",
              due
                ? "border-red-400/80 bg-red-900/85 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.25)]"
                : delayed
                  ? "border-orange-400/60 bg-orange-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(251,146,60,0.12)] dark:border-orange-400/45 dark:bg-orange-400/10 dark:text-white"
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
                {delayMinutes !== null ? (
                  <ArrivalDelayBadge delayMinutes={delayMinutes} isDue={due} />
                ) : null}
                <strong className={arrivalLabelClassName}>
                  {formatSurfaceArrivalTileLabel(arrival, { detailedCountdown, now: tick })}
                </strong>
                {clockTime && (
                  <span className="mt-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold tabular-nums">
                    {delayed && scheduledClockTime ? (
                      <span className={due
                        ? "whitespace-nowrap text-red-100/55 line-through decoration-current"
                        : "whitespace-nowrap text-slate-500/75 line-through decoration-current dark:text-slate-500"}
                      >
                        {scheduledClockTime}
                      </span>
                    ) : null}
                    <span className={due
                      ? "whitespace-nowrap text-red-100/80"
                      : "whitespace-nowrap text-slate-500 dark:text-slate-400"}
                    >
                      {clockTime}
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-2.5 flex items-center justify-center text-center">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Arrival predictions unavailable
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
      className={`saved-station-arrival-group is-surface-group w-full min-w-0 max-w-full overflow-hidden rounded-lg px-1 py-1.5 transition-colors duration-200 border-0 shadow-none ${
        isPinned
          ? "bg-amber-500/[0.08] dark:bg-amber-400/[0.07] is-pinned"
          : isHoveredPin
            ? "bg-amber-500/[0.03] dark:bg-amber-400/[0.03]"
            : "bg-transparent"
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
          <div className="flex items-center gap-1.5 min-w-0">
            <strong className="truncate text-xs sm:text-sm font-black text-slate-900 dark:text-white">
              {details.displayRouteName}
            </strong>
            {isPinned && (
              <span
                className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 shrink-0 select-none animate-in fade-in duration-200"
                data-pinned-badge
              >
                Starred
              </span>
            )}
          </div>
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
            const scheduledClockTime = formatSurfaceArrivalClockTime(arrival.scheduledAt);
            const delayMinutes = getSurfaceArrivalDelayMinutes(arrival, tick);
            const delayed = delayMinutes !== null;
            const arrivalTileClassName = [
              "relative flex min-h-[64px] sm:min-h-[68px] flex-col items-center justify-center rounded-md border px-1.5 pt-3.5 pb-2 text-center transition-colors",
              due
                ? "border-red-400/80 bg-red-900/85 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.25)] is-due"
                : delayed
                  ? "border-orange-400/60 bg-orange-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(251,146,60,0.12)] dark:border-orange-400/45 dark:bg-orange-400/10 dark:text-white is-delayed"
                : detailed
                  ? "border-emerald-400/35 bg-emerald-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(52,211,153,0.12)] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-white is-soon is-detailed"
                  : "border-transparent bg-slate-950/[0.03] text-slate-900 dark:border-transparent dark:bg-[#0a0c10] dark:text-white",
            ].join(" ");

            return (
              <div
                key={`${arrival.tripId}:${arrival.predictedAt}:${index}`}
                data-arrival-due={due ? "true" : "false"}
                className={arrivalTileClassName}
              >
                <ArrivalTileSourceIndicator status={arrival.status} isDue={due} isCompact />
                {delayMinutes !== null ? (
                  <ArrivalDelayBadge delayMinutes={delayMinutes} isDue={due} isCompact />
                ) : null}
                <strong
                  className={detailed && !due
                    ? "mt-1.5 whitespace-nowrap text-[13px] sm:text-sm font-black leading-none tracking-tight tabular-nums"
                    : "mt-1.5 text-sm sm:text-base font-black leading-none"}
                >
                  {formatSurfaceArrivalTileLabel(arrival, { detailedCountdown: detailed, now: tick })}
                </strong>
                {clockTime && (
                  <span className="mt-0.5 flex items-center justify-center gap-1 text-[9px] sm:text-[10px] font-semibold tabular-nums">
                    {delayed && scheduledClockTime ? (
                      <span className={due
                        ? "whitespace-nowrap text-red-100/55 line-through decoration-current"
                        : "whitespace-nowrap text-slate-500/75 line-through decoration-current dark:text-slate-500"}
                      >
                        {scheduledClockTime}
                      </span>
                    ) : null}
                    <span className={due
                      ? "whitespace-nowrap text-red-100/80"
                      : "whitespace-nowrap text-slate-500 dark:text-slate-400"}
                    >
                      {clockTime}
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-2 flex items-center justify-center text-center">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Arrival predictions unavailable
          </p>
        </div>
      )}
    </article>
  );
}

export function SurfaceConnectionsSection({ networkId, stationId, className, variant = "station-detail" }: Props) {
  const dashboard = useDashboardData();
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

  if (dashboard.snapshot) return <p className="p-3 text-sm text-slate-500" data-station-section="surface-connections">Surface arrivals unavailable — reconnect for current information.</p>;

  if (isSavedStationVariant) {
    return (
      <details
        className={`surface-connections-details is-saved-station saved-station-arrivals w-full min-w-0 max-w-full overflow-hidden${className ? ` ${className}` : ""}`}
        data-station-section="surface-connections"
      >
        <summary className="surface-connections-summary block w-full min-w-0 max-w-full cursor-pointer list-none overflow-hidden">
          <div className="saved-station-arrivals-heading flex w-full min-w-0 max-w-full flex-col items-start text-left gap-0.5 overflow-hidden">
            <div className="flex items-center justify-between gap-2 w-full min-w-0 max-w-full">
              <span className="saved-station-section-title station-subsection-header flex items-center gap-2 min-w-0 max-w-full font-extrabold text-slate-900 dark:text-white truncate">
                <span className="w-1 h-3.5 rounded-full bg-logo-blue shrink-0" aria-hidden="true" />
                <Bus size={18} className="shrink-0 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                <strong>Surface Connections</strong>
                {!loading && (
                  <span
                    className={`desktop-menu-count-badge desktop-menu-count-slate flex h-5 ${
                      allGroups.length < 10 ? "w-5" : "min-w-[20px] px-1"
                    } shrink-0 items-center justify-center rounded-full text-[10px] font-bold`}
                  >
                    {allGroups.length}
                  </span>
                )}
              </span>
              <ChevronDown
                size={16}
                className="surface-connections-chevron shrink-0 text-slate-500 dark:text-slate-300"
                aria-hidden="true"
              />
            </div>
            <p className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate w-full min-w-0 max-w-full">
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
      className={`surface-connections-details w-full rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5${className ? ` ${className}` : ""}`}
      data-station-section="surface-connections"
    >
      <summary className="surface-connections-summary block cursor-pointer list-none">
        <div className="flex items-center justify-between gap-2">
          <div className="station-subsection-header flex items-center gap-2.5 min-w-0">
            <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
            <Bus size={20} className="shrink-0 text-slate-700 dark:text-slate-300" aria-hidden="true" />
            <span className="text-lg font-black text-slate-900 dark:text-white truncate">Surface Connections</span>
            {!loading && (
              <span
                className={`desktop-menu-count-badge desktop-menu-count-slate flex h-6 ${
                  allGroups.length < 10 ? "w-6" : "min-w-[24px] px-1.5"
                } shrink-0 items-center justify-center rounded-full text-[11px] font-bold`}
              >
                {allGroups.length}
              </span>
            )}
          </div>
          <ChevronDown
            size={18}
            className="surface-connections-chevron shrink-0 text-slate-500 dark:text-slate-300"
            aria-hidden="true"
          />
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
                      className="station-arrival-line-divider"
                      data-arrival-line-divider
                    />
                  )}
                  <div className="flex flex-col gap-2" data-surface-bay={baySection.bayKey}>
                    {baySection.groups.map((group, groupIndex) => {
                      const isPinned = pinnedLineIds.includes(`surface:${group.route}`) || pinnedLineIds.includes(group.route);
                      const isHoveredPin = hoveredPinRoute === group.route;
                      const showRouteDivider = groupIndex > 0;

                      return (
                        <Fragment key={group.key}>
                          {showRouteDivider && (
                            <div
                              aria-hidden="true"
                              className="station-arrival-line-divider my-0.5 opacity-60"
                              data-arrival-line-divider
                            />
                          )}
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
