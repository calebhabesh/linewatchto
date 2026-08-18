"use client";

import { AlertCircle, AlertTriangle, BadgeInfo, CalendarCheck2, ChevronDown, Construction, ExternalLink, FileText, Layers, LoaderCircle, Train } from "lucide-react";
import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { isRegionalStationWheelchairAccessible, REGIONAL_ROUTE_CARDINAL_DIRECTIONS, REGIONAL_ROUTE_DEFINITIONS } from "../app/regional-data";
import {
  emptyRegionalArrivalSnapshot,
  formatRegionalArrivalSourceSummary,
  getRegionalStationArrivals,
  groupRegionalStationArrivals,
  isRegionalArrivalDue,
  isRegionalArrivalSoon,
  REGIONAL_ARRIVAL_COUNTDOWN_TICK_MS,
  regionalArrivalTimeDisplay,
  shouldUseDetailedRegionalArrivalCountdown,
  type RegionalArrivalSnapshot,
} from "../app/regional-arrivals";
import type { StationSummary } from "../app/station-data";
import type { AccessibilityOutageDetail } from "../app/accessibility-outage-data";
import { formatImpactTimestamp } from "../app/impact-time";
import { normalizeDashboardSourceLabel } from "../app/dashboard-source-label";
import { getSurfaceNotices, type SurfaceNoticeDetail } from "../app/surface-notice-data";
import {
  emptyRegionalTripChangeResponse,
  findRegionalArrivalTripChange,
  getRegionalTripChanges,
  regionalTripChangeLabel,
  type RegionalTripChangeResponse,
} from "../app/regional-trip-changes";
import { StationDetailHeader } from "./StationDetailHeader";
import { TransitLineBadge } from "./TransitLineBadge";
import { DelayIcon } from "./DelayIcon";
import { LiveSignalIcon } from "./LiveSignalIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { ArrivalTileSourceIndicator } from "./ArrivalTileSourceIndicator";
import { ArrivalLinePinButton } from "./ArrivalLinePinButton";
import { sortArrivalGroupsByPinnedLine } from "../app/arrival-pins";
import { useArrivalLinePins } from "../hooks/useArrivalLinePins";
import { RegionalTripChangesList } from "./RegionalTripChangesList";
import { regionalStationConnections } from "../app/station-connections";
import { StationConnectionBadges } from "./StationConnectionBadges";
import { SurfaceConnectionsSection } from "./SurfaceConnectionsSection";

type Props = {
  station: StationSummary;
  onClose: () => void;
  onSelectImpact: (selection: NonNullable<ImpactSelection>) => void;
  authenticated: boolean;
  saved: boolean;
  savePending: boolean;
  onToggleSaved: (stationId: string) => void;
  onRequestSignIn: () => void;
  accessibilityOutages: AccessibilityOutageDetail[];
  accessibilityFresh: boolean;
};

type RegionalStationImpact = {
  kind: ImpactKind;
  id: string;
  title: string;
  description: string;
  source: string;
  updatedAt?: string | null;
  updatedAgo?: string | null;
  classification: string;
  tone: "active" | "delay" | "planned" | "reduced-speed-zone";
};

const REGIONAL_ARRIVAL_REFRESH_MS = 15_000;

function stationImpactCardClassName(tone: RegionalStationImpact["tone"]) {
  const base = "flex flex-col gap-2.5 rounded-lg border border-black/10 bg-slate-50 p-3 text-sm border-l-2 dark:border-white/10 dark:bg-white/5 transition-all";
  if (tone === "active") {
    return `${base} suspension-card-border shadow-[inset_2px_0_6px_-2px_rgba(239,68,68,0.2)]`;
  }
  if (tone === "planned") {
    return `${base} planned-closure-card-border shadow-[inset_2px_0_6px_-2px_rgba(59,130,246,0.2)]`;
  }
  if (tone === "reduced-speed-zone") {
    return `${base} rsz-card-border shadow-[inset_2px_0_6px_-2px_rgba(245,158,11,0.2)]`;
  }
  return `${base} delay-card-border shadow-[inset_2px_0_6px_-2px_rgba(254,236,65,0.18)]`;
}

function stationImpactButtonClassName(tone: RegionalStationImpact["tone"]) {
  const base = "ml-auto inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold leading-none text-slate-900 dark:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:scale-95";
  if (tone === "active") return `${base} border-red-500/35 bg-red-500/10 hover:bg-red-500/20`;
  if (tone === "planned") return `${base} border-blue-500/35 bg-blue-500/10 hover:bg-blue-500/20`;
  if (tone === "reduced-speed-zone") return `${base} border-[#F59E0B]/35 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20`;
  return `${base} border-[#FEEC41]/35 bg-[#FEEC41]/10 hover:bg-[#FEEC41]/20`;
}

function RegionalStationImpactIcon({ impact }: { impact: RegionalStationImpact }) {
  if (impact.kind === "delay") return <DelayIcon size={26} className="shrink-0 delay-tone" />;
  if (impact.kind === "reduced-speed-zone") return <Construction size={26} className="rsz-tone shrink-0" />;
  if (impact.kind === "planned-closure" && impact.tone !== "active") {
    return <PlannedClosureIcon size={26} className="shrink-0 text-blue-500" />;
  }
  return <AlertTriangle size={26} className="shrink-0 text-red-500" />;
}

const REGIONAL_STOP_CODE_TO_STATION_ID: Record<string, string> = {
  AC: "acton", AD: "allandale-waterfront", AG: "agincourt", AJ: "ajax",
  AL: "aldershot", AP: "appleby", AU: "aurora", BA: "barrie-south",
  BD: "bradford", BE: "bramalea", BL: "bloor", BM: "bloomington",
  BO: "bronte", BR: "brampton-innovation-district", BU: "burlington",
  CE: "centennial", CF: "confederation", CL: "clarkson", CO: "cooksville",
  DA: "danforth", DI: "dixie", DW: "downsview-park", EA: "east-gwillimbury",
  EG: "eglinton", ER: "erindale", ET: "etobicoke-north", EX: "exhibition",
  GE: "georgetown", GL: "guelph-central", GO: "gormley", GU: "guildwood",
  HA: "hamilton", KC: "king-city", KE: "kennedy", KI: "kitchener",
  KP: "kipling", LA: "langstaff", LI: "lisgar", LO: "long-branch",
  MA: "maple", MD: "mount-dennis", ME: "meadowvale", MI: "mimico",
  MK: "markham", ML: "malton", MO: "mount-joy", MP: "mount-pleasant",
  MQ: "milliken", MT: "milton", NF: "niagara-falls", NM: "newmarket",
  OR: "oriole", OS: "durham-college-oshawa", PA: "pearson-airport",
  PC: "port-credit", PK: "pickering", RH: "richmond-hill", RO: "rouge-hill",
  RU: "rutherford", SC: "scarborough", SR: "stratford", ST: "stouffville",
  SV: "streetsville", TH: "st-catharines", UN: "union", UI: "unionville",
  WH: "west-harbour", WR: "whitby", WS: "weston",
};

function matchesStationStopCode(code: string, targetStationId: string): boolean {
  const upper = code.trim().toUpperCase();
  return REGIONAL_STOP_CODE_TO_STATION_ID[upper] === targetStationId;
}

function isNoticeLinkedToRegionalStation(
  notice: SurfaceNoticeDetail,
  stationId: string,
  stationName: string,
): boolean {
  if (notice.routeType === "GO Bus") {
    return false;
  }

  const targetId = stationId.toLowerCase();
  const targetName = stationName.toLowerCase();
  const targetNameGo = `${targetName} go`;

  if (notice.stopIds && notice.stopIds.some((id) => {
    const lower = id.trim().toLowerCase();
    return lower === targetId || lower === targetName || matchesStationStopCode(lower, targetId);
  })) {
    return true;
  }

  if (notice.stops && notice.stops.some((stop) => {
    const idLower = (stop.stopId || "").trim().toLowerCase();
    const nameLower = (stop.stopName || "").trim().toLowerCase();
    if (idLower === targetId || matchesStationStopCode(idLower, targetId)) {
      return true;
    }
    if (nameLower.includes(targetName) || targetName.includes(nameLower.replace(/\s+go$/, ""))) {
      return true;
    }
    return false;
  })) {
    return true;
  }

  if (notice.location) {
    const locLower = notice.location.trim().toLowerCase();
    if (locLower.includes(targetName) || locLower.includes(targetId)) {
      return true;
    }
  }

  const text = `${notice.title || ""} ${notice.description || ""}`.toLowerCase();
  if (text.includes(targetNameGo) || text.includes(`${targetName} station`)) {
    return true;
  }

  return false;
}

function noticeCategoryBadgeColor(cat: string) {
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
}

function noticeCategoryLabel(cat: string) {
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
}

function regionalArrivalSourceBadgeClassName(label: string) {
  const base = "inline-flex h-[22px] shrink-0 items-center rounded border px-2 text-[10.5px] font-black uppercase tracking-wide leading-none";
  if (label === "Live") {
    return `${base} border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200`;
  }
  if (label === "Scheduled") {
    return "inline-flex h-[20px] shrink-0 items-center rounded border px-1.5 text-[9.5px] font-black uppercase tracking-wide leading-none border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300";
  }
  if (label === "Mixed") {
    return "inline-flex h-[20px] shrink-0 items-center rounded border px-1.5 text-[9.5px] font-black uppercase tracking-wide leading-none border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200";
  }
  return `${base} border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200`;
}

export function RegionalStationDetailPanel({
  station,
  onClose,
  onSelectImpact,
  authenticated,
  saved,
  savePending,
  onToggleSaved,
  onRequestSignIn,
  accessibilityOutages,
}: Props) {
  const { pinnedLineIds, togglePin } = useArrivalLinePins("regional", station.id);
  const [hoveredPinLineId, setHoveredPinLineId] = useState<string | null>(null);
  const dashboard = useDashboardData();
  const [isClosing, setIsClosing] = useState(false);
  const [arrivalTick, setArrivalTick] = useState(() => Date.now());
  const [arrivalState, setArrivalState] = useState<{
    stationId: string;
    snapshot: RegionalArrivalSnapshot;
  }>(() => ({ stationId: "", snapshot: emptyRegionalArrivalSnapshot(station.id) }));

  useEffect(() => {
    const timer = window.setInterval(() => setArrivalTick(Date.now()), REGIONAL_ARRIVAL_COUNTDOWN_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  const [noticesState, setNoticesState] = useState<{
    loading: boolean;
    notices: SurfaceNoticeDetail[];
  }>({ loading: true, notices: [] });
  const [tripChangesState, setTripChangesState] = useState<{
    stationId: string;
    response: RegionalTripChangeResponse;
  }>(() => ({ stationId: "", response: emptyRegionalTripChangeResponse }));
  const noticesDetailsRef = useRef<HTMLDetailsElement>(null);
  const arrivalsLoading = arrivalState.stationId !== station.id;
  const tripChangesLoading = tripChangesState.stationId !== station.id;
  const tripChanges = tripChangesLoading ? emptyRegionalTripChangeResponse : tripChangesState.response;
  const arrivalSnapshot = arrivalsLoading
    ? emptyRegionalArrivalSnapshot(station.id)
    : arrivalState.snapshot;
  const closeTimeoutRef = useRef<number | null>(null);
  const routes = REGIONAL_ROUTE_DEFINITIONS.filter((route) => station.lineIds.includes(route.id));
  const impacts = useMemo(() => {
    const related = new Map<string, RegionalStationImpact>();
    const add = (kind: ImpactKind, id: string, fallbackTitle: string) => {
      const active = dashboard.activeAlerts.find((item) => item.id === id);
      const delay = dashboard.delays.find((item) => item.id === id);
      const planned = dashboard.plannedClosures.find((item) => item.id === id);
      const reducedSpeedZone = dashboard.reducedSpeedZones.find((item) => item.id === id);
      const card = active ?? delay ?? planned ?? reducedSpeedZone;
      const tone: RegionalStationImpact["tone"] =
        kind === "reduced-speed-zone"
          ? "reduced-speed-zone"
          : kind === "planned-closure"
            ? active ? "active" : "planned"
            : kind === "suspension"
              ? "active"
              : "delay";
      const classification =
        kind === "reduced-speed-zone"
          ? "Reduced Speed Zone"
          : kind === "planned-closure"
            ? active ? "Active Closure" : "Planned Closure"
            : kind === "suspension"
              ? "Active Alert"
              : "Delay";

      related.set(`${kind}:${id}`, {
        kind,
        id,
        title: card?.title ?? fallbackTitle,
        description: card?.description ?? "",
        source: card?.source ?? "Metrolinx Open API",
        updatedAt: card?.updatedAt,
        updatedAgo: card && "updatedAgo" in card ? card.updatedAgo : null,
        classification,
        tone,
      });
    };

    for (const impact of dashboard.stationNodeImpacts.filter((item) => item.stationId === station.id)) {
      add(impact.kind, impact.cardId, impact.title);
    }
    for (const segment of dashboard.networkSegments.filter(
      (item) => item.stationAId === station.id || item.stationBId === station.id,
    )) {
      for (const impact of segment.impacts ?? []) {
        const card =
          dashboard.activeAlerts.find((item) => item.id === impact.cardId)
          ?? dashboard.delays.find((item) => item.id === impact.cardId)
          ?? dashboard.plannedClosures.find((item) => item.id === impact.cardId)
          ?? dashboard.reducedSpeedZones.find((item) => item.id === impact.cardId);
        add(impact.kind, impact.cardId, card?.title ?? `${segment.label} impact`);
      }
    }
    return [...related.values()];
  }, [dashboard, station.id]);
  const arrivalGroups = useMemo(
    () => sortArrivalGroupsByPinnedLine(
      groupRegionalStationArrivals(arrivalSnapshot.arrivals, station.id),
      pinnedLineIds,
    ),
    [arrivalSnapshot.arrivals, pinnedLineIds, station.id],
  );

  const isWheelchairAccessible = isRegionalStationWheelchairAccessible(station.id);
  const connections = regionalStationConnections(station.id);

  const toggleSaved = () => {
    if (!authenticated) {
      onRequestSignIn();
      return;
    }
    onToggleSaved(station.id);
  };

  useEffect(() => () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    let controller: AbortController | null = null;

    const refreshArrivals = () => {
      controller?.abort();
      controller = new AbortController();
      const activeRequestId = ++requestId;
      void getRegionalStationArrivals(station.id, { signal: controller.signal }).then((result) => {
        if (active && activeRequestId === requestId) {
          setArrivalState({ stationId: station.id, snapshot: result.data });
        }
      }).catch(() => undefined);
    };

    refreshArrivals();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshArrivals();
      }
    }, REGIONAL_ARRIVAL_REFRESH_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshArrivals();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [station.id]);

  useEffect(() => {
    if (!station.lineIds.some((lineId) => lineId !== "regional-up")) return;
    const controller = new AbortController();
    void getRegionalTripChanges({ stationId: station.id, signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) {
        setTripChangesState({ stationId: station.id, response: result.data });
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [station.id, station.lineIds]);

  useEffect(() => {
    let active = true;
    async function fetchNotices() {
      try {
        const result = await getSurfaceNotices({ networkId: "regional" });
        if (active) {
          setNoticesState({ loading: false, notices: result.data?.notices ?? [] });
        }
      } catch {
        if (active) {
          setNoticesState({ loading: false, notices: [] });
        }
      }
    }
    void fetchNotices();
    return () => {
      active = false;
    };
  }, [station.id]);

  const linkedNotices = useMemo(
    () =>
      noticesState.notices.filter((notice) =>
        isNoticeLinkedToRegionalStation(notice, station.id, station.name),
      ),
    [noticesState.notices, station.id, station.name],
  );

  const handleNoticesSummaryClick = (e: React.MouseEvent<HTMLElement>) => {
    const detailsElement = noticesDetailsRef.current;
    if (!detailsElement) return;

    if (detailsElement.open) {
      e.preventDefault();
      detailsElement.classList.add("collapsing");
      setTimeout(() => {
        detailsElement.open = false;
        detailsElement.classList.remove("collapsing");
      }, 150);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, 380);
  };

  return (
    <aside
      className={`regional-station-detail station-detail-panel ${isClosing ? "station-detail-closing" : ""} fixed left-0 right-0 bottom-0 z-45 max-h-[calc(var(--visual-viewport-height,100dvh)*0.64)] flex flex-col overflow-hidden rounded-t-lg border border-black/10 bg-white p-4 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#0a0c10] dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-auto md:w-[min(calc(100vw-48px),460px)] md:max-h-[calc(var(--visual-viewport-height,100dvh)-128px)] md:rounded-lg`}
      aria-live="polite"
      aria-label={`${station.name} regional station details`}
    >
      <StationDetailHeader
        stationName={station.name}
        saved={saved}
        savePending={savePending}
        onToggleSaved={toggleSaved}
        onClose={handleClose}
      />

      <div className="station-detail-body-wrapper flex-1 min-h-0 flex flex-col">
        <div
          key={station.id}
          className="station-detail-content-swap flex-1 min-h-0 flex flex-col"
        >
          {routes.length > 2 ? (
            <div className="mt-2 flex flex-col gap-2 shrink-0" data-station-header-line-details aria-label="Regional rail corridors">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Regional Corridors · {routes.length} Lines
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap" role="list" aria-label="Regional rail corridors">
                {routes.map((route) => (
                  <div key={route.id} role="listitem" className="shrink-0" title={`${route.name} Line`}>
                    <TransitLineBadge
                      lineId={route.id}
                      lineNumber={route.number}
                      lineName={route.name}
                      size={36}
                      className="regional-route-pill shadow-xs transition-transform hover:scale-105"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5 shrink-0" data-station-header-line-details aria-label="Regional rail corridors">
              {routes.map((route) => {
                const direction = REGIONAL_ROUTE_CARDINAL_DIRECTIONS[route.number as keyof typeof REGIONAL_ROUTE_CARDINAL_DIRECTIONS];
                return (
                  <div key={route.id} className="flex items-center justify-between gap-2.5 min-w-0">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <TransitLineBadge
                        lineId={route.id}
                        lineNumber={route.number}
                        lineName={route.name}
                        size={40}
                        className="regional-route-pill shrink-0"
                      />
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {route.name}
                      </span>
                    </div>
                    {direction ? (
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0 text-right">
                        {direction}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {connections.length > 0 && (
            <div className="mt-2.5 shrink-0">
              <StationConnectionBadges connections={connections} />
            </div>
          )}

          <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto mt-3 pb-3 pr-4 -mr-4 station-detail-scroll station-detail-section-stack">
            {isWheelchairAccessible && (
              <div
                className="flex flex-col gap-2 rounded-md border border-black/10 bg-slate-50 px-3.5 py-3 sm:px-4 sm:py-3.5 dark:border-white/10 dark:bg-white/5"
                data-station-section="services-and-amenities"
              >
                <h4 className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Services and Amenities
                </h4>
                <div className="grid grid-cols-3 gap-x-2.5 sm:gap-x-3.5 gap-y-3 sm:gap-y-3.5 items-center">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Wheelchair accessible">
                    <Image
                      src="/assets/linewatch/wheel-chair-symbol.svg"
                      alt="Wheelchair accessible"
                      width={25}
                      height={25}
                      className="w-[21px] h-[21px] sm:w-[25px] sm:h-[25px] rounded-[3px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,130,201,0.28)] dark:drop-shadow-[0_0_2px_rgba(0,130,201,0.38)]"
                    />
                    <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                      Accessible
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <section
                className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="arrivals"
              >
                <h3 className="flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
                  <Train size={20} className="shrink-0" />
                  <span>Train Arrivals</span>
                </h3>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {arrivalsLoading
                    ? "Checking Metrolinx arrivals"
                    : arrivalSnapshot.availability === "available"
                      ? formatRegionalArrivalSourceSummary(arrivalSnapshot.arrivals)
                      : arrivalSnapshot.availability === "no-service"
                        ? "Published regional schedule"
                        : "Regional arrivals unavailable"}
                </p>
                {arrivalsLoading ? (
                  <div className="mt-3 flex min-h-20 items-center justify-center rounded-md border border-black/10 bg-white/60 dark:border-white/10 dark:bg-black/10">
                    <LoaderCircle size={22} className="animate-spin text-slate-500" aria-label="Loading regional arrivals" />
                  </div>
                ) : arrivalSnapshot.availability === "available" && arrivalGroups.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-3" aria-label="Upcoming regional train arrivals">
                    {(() => {
                      const regionalLineSections: {
                        lineId: string;
                        lineNumber: string;
                        lineName?: string;
                        groups: typeof arrivalGroups;
                      }[] = [];
                      for (const group of arrivalGroups) {
                        let section = regionalLineSections.find((s) => s.lineId === group.lineId);
                        if (!section) {
                          section = {
                            lineId: group.lineId,
                            lineNumber: group.lineNumber,
                            lineName: group.lineName,
                            groups: [],
                          };
                          regionalLineSections.push(section);
                        }
                        section.groups.push(group);
                      }

                      return regionalLineSections.map((section, sectionIndex) => {
                        const showLineDivider = sectionIndex > 0;
                        const isPinned = pinnedLineIds.includes(section.lineId);
                        const isHoveredPin = hoveredPinLineId === section.lineId;

                        return (
                          <Fragment key={section.lineId}>
                            {showLineDivider && (
                              <div
                                aria-hidden="true"
                                className="station-arrival-line-divider"
                                data-arrival-line-divider
                              />
                            )}
                            <div
                              data-arrival-line-section={section.lineId}
                              data-pinned-line={isPinned ? "true" : "false"}
                              className="flex flex-col gap-2"
                            >
                              <div className="flex items-center justify-between px-1 py-1">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <TransitLineBadge
                                    lineId={section.lineId}
                                    lineNumber={section.lineNumber}
                                    lineName={section.lineName}
                                    size={32}
                                    className="shrink-0"
                                  />
                                  <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                                    {section.lineName ?? section.lineNumber}
                                  </span>
                                </div>
                                <ArrivalLinePinButton
                                  pinned={isPinned}
                                  hovered={isHoveredPin}
                                  onHoverChange={(hovered) => setHoveredPinLineId(hovered ? section.lineId : null)}
                                  lineLabel={section.lineNumber}
                                  stationName={station.name}
                                  onToggle={() => togglePin(section.lineId)}
                                />
                              </div>

                              <div className="flex flex-col gap-2">
                                {section.groups.map((group) => {
                                  const allGroupArrivals = group.platforms.flatMap((platform) => platform.arrivals);
                                  const hasLive = allGroupArrivals.some((arrival) => arrival.status === "live");
                                  const hasScheduled = allGroupArrivals.some((arrival) => arrival.status === "scheduled");
                                  const statusLabel = hasLive
                                    ? hasScheduled
                                      ? "Mixed"
                                      : "Live"
                                    : "Scheduled";

                                  return (
                                    <article
                                      key={group.key}
                                      data-regional-arrival-direction={group.directionLabel}
                                      data-pinned-line={isPinned ? "true" : "false"}
                                      className={`rounded-md border p-3 text-sm shadow-sm transition-colors duration-150 ${
                                        isPinned || isHoveredPin
                                          ? "border-amber-400/60 bg-amber-400/[0.06] dark:border-amber-400/50 dark:bg-amber-400/[0.08]"
                                          : "border-black/10 bg-white/80 dark:border-white/10 dark:bg-[#12151c]/80"
                                      }`}
                                    >
                                      <div className="flex min-w-0 items-center gap-3">
                                        <TransitLineBadge
                                          lineId={section.lineId}
                                          lineNumber={section.lineNumber}
                                          lineName={section.lineName}
                                          size={27}
                                          className="shrink-0"
                                        />
                                        <div className="flex min-w-0 flex-col leading-tight">
                                          <strong className="min-w-0 break-words font-black text-slate-900 dark:text-white">
                                            {group.directionLabel}
                                          </strong>
                                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                            {group.destinationLabel}
                                          </span>
                                        </div>
                                        <div className="ml-auto flex shrink-0 items-center gap-2 self-center">
                                          <span
                                            className={regionalArrivalSourceBadgeClassName(statusLabel)}
                                            data-arrival-source={statusLabel.toLowerCase()}
                                          >
                                            {statusLabel}
                                            {statusLabel === "Live" ? (
                                              <LiveSignalIcon className="ml-1.5 inline-block shrink-0 text-emerald-600 dark:text-emerald-300" size={15.5} />
                                            ) : statusLabel === "Scheduled" ? (
                                              <CalendarCheck2 className="ml-1.5 inline-block shrink-0 text-slate-500 dark:text-slate-400 relative -top-px" size={12} aria-hidden="true" />
                                            ) : statusLabel === "Mixed" ? (
                                              <Layers className="ml-1.5 inline-block shrink-0 text-cyan-600 dark:text-cyan-400 relative -top-px" size={12} aria-hidden="true" />
                                            ) : null}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="mt-3 flex flex-col gap-3">
                                        {group.platforms.map((platform) => (
                                          <div key={platform.key} data-regional-arrival-platform={platform.key}>
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                {platform.label}
                                              </h4>
                                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                {platform.arrivals.some((arrival) => arrival.status === "live" && arrival.delayMinutes > 0)
                                                  ? "Delayed estimate"
                                                  : platform.arrivals.some((arrival) => arrival.status === "live")
                                                    ? "On schedule"
                                                    : "Scheduled timetable"}
                                              </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                              {platform.arrivals.map((arrival, index) => {
                                                const due = isRegionalArrivalDue(arrival, arrivalTick);
                                                const soon = !due && isRegionalArrivalSoon(arrival, arrivalTick);
                                                const tripChange = findRegionalArrivalTripChange(
                                                  arrival,
                                                  tripChanges.changes,
                                                  station.id,
                                                );
                                                const detailedCountdown = index === 0
                                                  && shouldUseDetailedRegionalArrivalCountdown(arrival, arrivalTick);
                                                const timeDisplay = regionalArrivalTimeDisplay(
                                                  arrival,
                                                  arrivalTick,
                                                  { detailedCountdown }
                                                );
                                                const isCountdown = detailedCountdown && !due && !tripChange;
                                                return (
                                                  <div
                                                    key={`${arrival.tripNumber}:${arrival.predictedAt}`}
                                                    data-arrival-due={due ? "true" : "false"}
                                                    data-regional-arrival-due={due ? "true" : "false"}
                                                    className={[
                                                      "relative flex min-h-[74px] sm:min-h-[78px] flex-col items-center justify-center rounded-md border px-1.5 pt-3.5 pb-1.5 text-center transition-colors",
                                                      tripChange?.kind === "cancellation" || tripChange?.kind === "skipped-stop"
                                                        ? "border-red-500/70 bg-red-500/15 text-red-900 shadow-[0_0_0_1px_rgba(239,68,68,0.16)] dark:text-red-50"
                                                        : tripChange?.kind === "added-stop"
                                                          ? "border-blue-500/60 bg-blue-500/10 text-blue-900 dark:text-blue-50"
                                                        : due
                                                          ? "border-red-400/80 bg-red-900/85 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.25)]"
                                                          : soon
                                                            ? "border-emerald-400/35 bg-emerald-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(52,211,153,0.12)] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-white"
                                                            : "border-black/10 bg-slate-950/[0.03] text-slate-900 dark:border-white/10 dark:bg-[#0f1117] dark:text-white",
                                                    ].join(" ")}
                                                  >
                                                    <ArrivalTileSourceIndicator
                                                      status={arrival.status}
                                                      isDue={due || tripChange?.kind === "cancellation" || tripChange?.kind === "skipped-stop"}
                                                    />
                                                    <strong className={isCountdown
                                                      ? "whitespace-nowrap text-base font-black leading-none tracking-tight tabular-nums"
                                                      : "text-base font-black leading-none tracking-tight"}
                                                    >
                                                      {tripChange ? regionalTripChangeLabel(tripChange.kind) : timeDisplay.primary}
                                                    </strong>
                                                    <span
                                                      className={
                                                        due
                                                          ? "mt-1.5 text-xs font-semibold text-red-100/80"
                                                          : soon
                                                            ? "mt-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                                                            : "mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400"
                                                      }
                                                    >
                                                      {tripChange ? `Train ${arrival.tripNumber}` : timeDisplay.secondary}
                                                    </span>
                                                    {tripChange ? (
                                                      <span className="mt-1 text-[9px] font-black uppercase tracking-wider opacity-75">
                                                        Scheduled {timeDisplay.secondary}
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            </div>
                          </Fragment>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-black/10 bg-white/60 px-3 py-4 text-center dark:border-white/10 dark:bg-black/10">
                    <p className="text-sm font-semibold leading-snug text-slate-500 dark:text-slate-400">
                      <span className="block">
                        {arrivalSnapshot.availability === "no-service"
                          ? "No Scheduled Service"
                          : "Arrival Data Unavailable"}
                      </span>
                      <span className="mt-1 block text-xs font-medium">{arrivalSnapshot.message}</span>
                    </p>
                  </div>
                )}
                {!arrivalsLoading && arrivalSnapshot.availability === "available" ? (
                  <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                    {arrivalSnapshot.arrivals.some((arrival) => arrival.status === "live")
                      ? "Realtime estimates can change; scheduled rows are published timetable fallback. Confirm departure details with GO Transit or UP Express."
                      : "Published schedule times are not live predictions. Confirm departure details with GO Transit or UP Express."}
                  </p>
                ) : null}
                <div className="regional-station-official-links mt-3">
                  <a href="https://www.gotransit.com/en/see-schedules" target="_blank" rel="noreferrer">
                    GO Schedules <ExternalLink size={14} />
                  </a>
                  {station.lineIds.includes("regional-up") ? (
                    <a
                      href="https://www.upexpress.com/en/up-express-stations/union-station/departures-and-schedules"
                      target="_blank"
                      rel="noreferrer"
                    >
                      UP Schedules <ExternalLink size={14} />
                    </a>
                  ) : null}
                </div>
              </section>

              <SurfaceConnectionsSection networkId="regional" stationId={station.id} />

              {station.lineIds.some((lineId) => lineId !== "regional-up") ? <section
                className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="trip-changes"
                aria-label="Upcoming GO train changes"
              >
                <h3 className="flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
                  <AlertTriangle size={20} className="shrink-0 text-amber-500" />
                  <span>Upcoming Trip Changes</span>
                  {!tripChangesLoading && tripChanges.changes.length > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-xs font-black text-amber-800 dark:text-amber-200">
                      {tripChanges.changes.length}
                    </span>
                  ) : null}
                </h3>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  GO operational feeds · published schedule matched
                </p>
                <div className="mt-2">
                  <RegionalTripChangesList
                    data={tripChanges}
                    loading={tripChangesLoading}
                    compact
                    emptyLabel="No upcoming GO train changes matched to this station."
                  />
                </div>
              </section> : null}

              <section
                className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="station-impacts"
                aria-label="Station service impacts"
              >
                <h3 className="flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
                  <AlertCircle size={20} className="shrink-0" />
                  <span>Station Impacts</span>
                </h3>
                {impacts.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-2">
                    {impacts.map((impact) => (
                      <div key={`${impact.kind}:${impact.id}`} className={stationImpactCardClassName(impact.tone)}>
                        <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
                          <RegionalStationImpactIcon impact={impact} />
                          <span className="flex items-center leading-none">{impact.classification}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <strong className="block font-bold text-slate-900 dark:text-white">{impact.title}</strong>
                          {impact.description && impact.description !== impact.title ? (
                            <p className="leading-snug text-slate-700 dark:text-slate-200">{impact.description}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {normalizeDashboardSourceLabel(impact.source)}
                            {impact.updatedAt || impact.updatedAgo
                              ? ` / ${impact.updatedAt ? formatImpactTimestamp(impact.updatedAt) : impact.updatedAgo}`
                              : ""}
                          </p>
                          <button
                            type="button"
                            className={stationImpactButtonClassName(impact.tone)}
                            onClick={() => onSelectImpact({ kind: impact.kind, id: impact.id })}
                            aria-label={`Open ${impact.classification} details`}
                          >
                            <BadgeInfo size={16} className="shrink-0" aria-hidden="true" />
                            <span>View Details</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 rounded-md border border-black/10 bg-white/60 px-3 py-3 text-center dark:border-white/10 dark:bg-black/10">
                    <p className="text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                      No active impacts for this station.
                    </p>
                  </div>
                )}
              </section>

              <details
                ref={noticesDetailsRef}
                className="station-notices-details rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="notices"
                aria-label="Regional station notices"
              >
                <summary
                  onClick={handleNoticesSummaryClick}
                  className="station-notices-summary flex cursor-pointer list-none items-center gap-2.5 text-lg font-black"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <FileText size={20} className="shrink-0 text-slate-700 dark:text-slate-300" />
                    <span className="min-w-0 truncate">Notices</span>
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-white/10 dark:text-slate-200">
                      {linkedNotices.length}
                    </span>
                  </span>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className="station-notices-chevron ml-auto shrink-0 text-slate-500 dark:text-slate-300"
                  />
                </summary>
                <div className="station-notices-content-wrapper">
                  <div className="station-notices-content pt-3 flex flex-col gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Metrolinx Open API
                    </p>
                    {noticesState.loading ? (
                      <div className="flex min-h-16 items-center justify-center rounded-md border border-black/10 bg-white/60 dark:border-white/10 dark:bg-black/10">
                        <LoaderCircle size={18} className="animate-spin text-slate-500" aria-label="Loading station notices" />
                      </div>
                    ) : linkedNotices.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {linkedNotices.map((notice) => (
                          <div
                            key={notice.id}
                            className="flex flex-col gap-2 rounded-md border border-black/10 bg-white/80 p-3 text-sm shadow-sm dark:border-white/10 dark:bg-[#12151c]/80"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                {notice.routeIds?.map((routeCode) => {
                                  const route = REGIONAL_ROUTE_DEFINITIONS.find(
                                    (r) => r.number === routeCode || r.id === routeCode,
                                  );
                                  if (route) {
                                    return (
                                      <TransitLineBadge
                                        key={routeCode}
                                        lineId={route.id}
                                        lineNumber={route.number}
                                        lineName={route.name}
                                        size={22}
                                        className="shrink-0"
                                      />
                                    );
                                  }
                                  return (
                                    <span
                                      key={routeCode}
                                      className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-white/10 dark:text-slate-200"
                                    >
                                      {routeCode}
                                    </span>
                                  );
                                })}
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${noticeCategoryBadgeColor(notice.category)}`}
                              >
                                {noticeCategoryLabel(notice.category)}
                              </span>
                            </div>

                            <div className="min-w-0">
                              <strong className="block font-bold text-slate-900 dark:text-white">
                                {notice.title}
                              </strong>
                              {notice.description && notice.description !== notice.title ? (
                                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                                  {notice.description}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-black/5 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400">
                              {notice.updatedAt ? (
                                <span>Updated {formatImpactTimestamp(notice.updatedAt)}</span>
                              ) : null}
                              {notice.cause ? (
                                <span>Cause: {notice.cause}</span>
                              ) : null}
                            </div>

                            {notice.url ? (
                              <a
                                href={notice.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
                              >
                                Metrolinx details <ExternalLink size={12} />
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        No active GO / UP notices for this station.
                      </p>
                    )}
                  </div>
                </div>
              </details>

              <details
                className="station-accessibility-details rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="accessibility"
                aria-label="Regional accessibility outages"
              >
                <summary className="station-accessibility-summary flex cursor-pointer list-none items-center gap-2.5 text-lg font-black">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Image
                      src="/assets/linewatch/accessibility-alert.svg"
                      alt=""
                      width={24}
                      height={24}
                      aria-hidden="true"
                      className="shrink-0"
                    />
                    <span className="min-w-0 truncate">Accessibility Outages</span>
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-white/10 dark:text-slate-200">
                      {accessibilityOutages.length}
                    </span>
                  </span>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className="station-accessibility-chevron ml-auto shrink-0 text-slate-500 dark:text-slate-300"
                  />
                </summary>
                <div className="station-accessibility-content-wrapper">
                  <div className="station-accessibility-content pt-3 flex flex-col gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Metrolinx Open API
                    </p>
                    {accessibilityOutages.length > 0 ? (
                      <ul className="grid gap-2">
                        {accessibilityOutages.map((outage) => (
                          <li
                            key={outage.id}
                            className="rounded-md border border-amber-500/30 bg-white/80 p-3 dark:bg-black/10"
                          >
                            <div className="flex items-start gap-2.5">
                              <Image
                                src={`/assets/linewatch/outages/${outage.assetType}.svg`}
                                alt=""
                                width={22}
                                height={22}
                                className="h-[22px] w-[22px] shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-black text-slate-900 dark:text-white">{outage.title}</p>
                                {outage.description ? (
                                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                                    {outage.description}
                                  </p>
                                ) : null}
                                <p className="mt-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                  Updated {formatImpactTimestamp(outage.updatedAt)}
                                </p>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
