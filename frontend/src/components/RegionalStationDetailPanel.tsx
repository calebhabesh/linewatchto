"use client";

import { AlertCircle, AlertTriangle, ArrowDownToLine, ArrowRight, BadgeInfo, Bus, CalendarCheck2, ChevronDown, ConciergeBell, Construction, ExternalLink, FileText, GitMerge, Layers, LoaderCircle, Train, Wifi } from "lucide-react";
import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import {
  isRegionalStationWheelchairAccessible,
  isRegionalStationElevatorAccessible,
  isRegionalStationParkingAvailable,
  isRegionalStationWashroomAvailable,
  isRegionalStationBicycleLockupAvailable,
  isRegionalStationPpudoAvailable,
  isRegionalStationWifiAvailable,
  REGIONAL_ROUTE_CARDINAL_DIRECTIONS,
  REGIONAL_ROUTE_DEFINITIONS,
  type RegionalRouteCode,
} from "../app/regional-data";
import {
  emptyRegionalArrivalSnapshot,
  formatRegionalArrivalCoachCount,
  formatRegionalArrivalClockTime,
  formatRegionalArrivalSourceSummary,
  formatRegionalDestinationName,
  getRegionalStationArrivals,
  groupRegionalStationArrivals,
  isRegionalArrivalDue,
  isRegionalArrivalSoon,
  REGIONAL_ARRIVAL_COUNTDOWN_TICK_MS,
  preserveRegionalArrivalsOnRefresh,
  regionalArrivalTimeDisplay,
  shouldShowRegionalArrivalDelay,
  shouldUseDetailedRegionalArrivalCountdown,
  type RegionalArrivalDataResult,
} from "../app/regional-arrivals";
import type { StationSummary } from "../app/station-data";
import type { AccessibilityOutageDetail } from "../app/accessibility-outage-data";
import { formatImpactTimestamp } from "../app/impact-time";
import { normalizeDashboardSourceLabel } from "../app/dashboard-source-label";
import { getSurfaceNotices, type SurfaceNoticeDetail } from "../app/surface-notice-data";
import {
  cleanRegionalTripNumber,
  emptyRegionalTripChangeResponse,
  findRegionalArrivalTripChange,
  getRegionalTripChanges,
  regionalTripChangeLabel,
  type RegionalTripChangeResponse,
} from "../app/regional-trip-changes";
import { StationDetailHeader } from "./StationDetailHeader";
import { MobileSheetDragHandle } from "./MobileSheetDragHandle";
import { useMobileDraggableSheet } from "../hooks/useMobileDraggableSheet";
import { TransitLineBadge, transitLineBadgeColors } from "./TransitLineBadge";
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
import { OverlappingCountBadge } from "./OverlappingCountBadge";
import { StationSubmenuNavButtons, type StationSubmenuNavItem } from "./StationSubmenuNavButtons";
import { StationLineDirectionIndicator } from "./StationLineDirectionIndicator";
import { RegionalArrivalDelayBadge } from "./RegionalArrivalDelayBadge";

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
  const base = "station-impact-card flex flex-col gap-2.5 rounded-lg p-3 text-sm transition-all";
  if (tone === "active") {
    return `${base} suspension-card-border`;
  }
  if (tone === "planned") {
    return `${base} planned-closure-card-border`;
  }
  if (tone === "reduced-speed-zone") {
    return `${base} rsz-card-border`;
  }
  return `${base} delay-card-border`;
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

type StationAccessOutageAssetType = "elevator" | "escalator";

const STATION_ACCESS_OUTAGE_ICON_SRC: Record<StationAccessOutageAssetType, string> = {
  elevator: "/assets/linewatch/outages/elevator.svg",
  escalator: "/assets/linewatch/outages/escalator.svg",
};

function formatStationOutageLabel(assetType: StationAccessOutageAssetType, count: number) {
  const assetLabel = assetType === "elevator" ? "elevator" : "escalator";
  return `${count} ${assetLabel} ${count === 1 ? "outage" : "outages"}`;
}

function StationAccessOutageBadge({
  assetType,
  count,
  label,
}: {
  assetType: StationAccessOutageAssetType;
  count: number;
  label: string;
}) {
  return (
    <span className="station-access-outage-badge" aria-label={label} title={label}>
      <Image
        src={STATION_ACCESS_OUTAGE_ICON_SRC[assetType]}
        alt=""
        width={30}
        height={30}
        aria-hidden="true"
      />
      <OverlappingCountBadge className="station-access-outage-count" count={count} />
    </span>
  );
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
  accessibilityFresh,
}: Props) {
  const { pinnedLineIds, togglePin } = useArrivalLinePins("regional", station.id);
  const [hoveredPinLineId, setHoveredPinLineId] = useState<string | null>(null);

  const dashboard = useDashboardData();
  const [isClosing, setIsClosing] = useState(false);
  const { sheetRef, isDragging, isExpanded, dragHandleProps, sheetStyle } = useMobileDraggableSheet();
  const [arrivalTick, setArrivalTick] = useState(() => Date.now());
  const [arrivalState, setArrivalState] = useState<RegionalArrivalDataResult | null>(null);

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
  const arrivalsLoading = arrivalState?.data.stationId !== station.id;
  const tripChangesLoading = tripChangesState.stationId !== station.id;
  const tripChanges = tripChangesLoading ? emptyRegionalTripChangeResponse : tripChangesState.response;
  const arrivalSnapshot = arrivalsLoading
    ? emptyRegionalArrivalSnapshot(station.id)
    : arrivalState.data;
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
  const arrivalGroups = sortArrivalGroupsByPinnedLine(
    groupRegionalStationArrivals(arrivalSnapshot.arrivals, station.id),
    pinnedLineIds,
  );

  const isWheelchairAccessible = station.wheelchairAccessible ?? isRegionalStationWheelchairAccessible(station.id);
  const hasElevator = station.hasElevator ?? isRegionalStationElevatorAccessible(station.id);
  const hasWashroom = station.hasWashroom ?? isRegionalStationWashroomAvailable(station.id);
  const hasParking = station.hasParking ?? isRegionalStationParkingAvailable(station.id);
  const hasBicycleLockup = station.hasBicycleLockup ?? isRegionalStationBicycleLockupAvailable(station.id);
  const hasPpudo = station.hasPpudo ?? isRegionalStationPpudoAvailable(station.id);
  const hasWifi = isRegionalStationWifiAvailable(station.id);
  const hasElevatorOutage = accessibilityFresh && accessibilityOutages.some((outage) => outage.assetType === "elevator");
  const hasAnyAmenities = isWheelchairAccessible || hasElevator || hasWashroom || hasParking || hasBicycleLockup || hasPpudo || hasWifi;
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
          setArrivalState((current) => preserveRegionalArrivalsOnRefresh(current, result));
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

  const accessibilityDetailsRef = useRef<HTMLDetailsElement>(null);

  const elevatorOutagesCount = accessibilityFresh
    ? accessibilityOutages.filter((outage) => outage.assetType === "elevator").length
    : 0;
  const escalatorOutagesCount = accessibilityFresh
    ? accessibilityOutages.filter((outage) => outage.assetType === "escalator").length
    : 0;
  const hasAccessibilityOutages = elevatorOutagesCount > 0 || escalatorOutagesCount > 0;

  const handleJumpToAccessibility = () => {
    if (accessibilityDetailsRef.current) {
      const detailsElement = accessibilityDetailsRef.current;
      const isAlreadyOpen = detailsElement.open;
      detailsElement.open = true;

      const summary = detailsElement.querySelector("summary");
      summary?.focus();

      const performScroll = () => {
        if (detailsElement) {
          detailsElement.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      };

      if (isAlreadyOpen) {
        performScroll();
      } else {
        setTimeout(performScroll, 50);
      }
    }
  };

  const handleJumpToSection = (sectionId: string) => {
    if (sectionId === "accessibility") {
      handleJumpToAccessibility();
      return;
    }
    const target = document.querySelector(`[data-station-section="${sectionId}"]`);
    if (!target) return;

    if (target instanceof HTMLDetailsElement && !target.open) {
      target.open = true;
    }
    const parentDetails = target.closest("details");
    if (parentDetails && !parentDetails.open) {
      parentDetails.open = true;
    }

    target.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const isGoRailStation = station.lineIds.some((id) => id !== "regional-up");

  const navItems: StationSubmenuNavItem[] = [];
  if (connections.length > 0) {
    navItems.push({
      id: "connected-network",
      label: connections.length === 1 ? "Connected Network" : "Connected Networks",
      shortLabel: "Networks",
      icon: <GitMerge size={13} aria-hidden="true" />,
    });
  }
  if (hasAnyAmenities) {
    navItems.push({
      id: "services-and-amenities",
      label: "Services & Amenities",
      shortLabel: "Amenities",
      icon: <ConciergeBell size={13} aria-hidden="true" />,
    });
  }
  navItems.push({
    id: "arrivals",
    label: "Train Arrivals",
    shortLabel: "Trains",
    icon: <Train size={13} aria-hidden="true" />,
  });
  navItems.push({
    id: "surface-connections",
    label: "Surface Connections",
    shortLabel: "Buses",
    icon: <Bus size={13} aria-hidden="true" />,
  });
  navItems.push({
    id: "station-impacts",
    label: "Station Impacts",
    shortLabel: "Impacts",
    icon: <AlertCircle size={13} className="text-orange-500 dark:text-orange-400" aria-hidden="true" />,
    count: impacts.length > 0 ? impacts.length : undefined,
  });
  if (isGoRailStation) {
    navItems.push({
      id: "trip-changes",
      label: "Upcoming Trip Changes",
      shortLabel: "Changes",
      icon: <AlertTriangle size={13} className="text-amber-500" aria-hidden="true" />,
      count: tripChanges.changes.length > 0 ? tripChanges.changes.length : undefined,
    });
  }
  navItems.push({
    id: "notices",
    label: "Notices",
    shortLabel: "Notices",
    icon: <FileText size={13} aria-hidden="true" />,
    count: linkedNotices.length > 0 ? linkedNotices.length : undefined,
  });
  navItems.push({
    id: "accessibility",
    label: "Accessibility Outages",
    shortLabel: "Outages",
    icon: (
      <Image
        src="/assets/linewatch/accessibility-alert.svg"
        alt=""
        width={13}
        height={13}
        aria-hidden="true"
        className="shrink-0"
      />
    ),
    count: accessibilityOutages.length > 0 ? accessibilityOutages.length : undefined,
  });

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
    const duration = (typeof window !== "undefined" && window.innerWidth < 768) ? 240 : 380;
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
      setIsClosing(false);
    }, duration);
  };

  return (
    <aside
      ref={sheetRef}
      style={sheetStyle}
      className={`regional-station-detail station-detail-panel ${isClosing ? "station-detail-closing" : ""} ${isDragging ? "station-detail-sheet-dragging" : ""} fixed left-0 right-0 bottom-0 z-45 max-h-[calc(var(--visual-viewport-height,100dvh)*0.64)] flex flex-col overflow-hidden rounded-t-lg bg-[var(--panel)] p-4 text-slate-900 shadow-2xl dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-auto md:w-[min(calc(100vw-48px),460px)] md:max-h-[calc(var(--visual-viewport-height,100dvh)-128px)] md:rounded-lg`}
      data-closing={isClosing ? "true" : undefined}
      aria-live="polite"
      aria-label={`${station.name} regional station details`}
      data-sheet-expanded={isExpanded ? "true" : undefined}
    >
      <MobileSheetDragHandle
        dragHandleProps={dragHandleProps}
        isDragging={isDragging}
        isExpanded={isExpanded}
      />

      <StationDetailHeader
        stationName={station.name}
        saved={saved}
        savePending={savePending}
        onToggleSaved={toggleSaved}
        onClose={handleClose}
      />

      <div className="station-detail-body-wrapper w-full min-w-0 max-w-full flex-1 min-h-0 flex flex-col">
        <div
          key={station.id}
          className="station-detail-content-swap w-full min-w-0 max-w-full flex-1 min-h-0 flex flex-col"
        >
          {routes.length > 2 ? (
            <div className="mt-2 flex w-full min-w-0 max-w-full flex-col gap-2 shrink-0" data-station-header-line-details aria-label="Regional rail corridors">
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
            <div className="mt-2 flex w-full min-w-0 max-w-full flex-col gap-1.5 shrink-0" data-station-header-line-details aria-label="Regional rail corridors">
              {routes.map((route) => {
                const direction = REGIONAL_ROUTE_CARDINAL_DIRECTIONS[route.number as keyof typeof REGIONAL_ROUTE_CARDINAL_DIRECTIONS];
                return (
                  <div key={route.id} className="station-header-line-row flex items-center justify-between gap-2 sm:gap-2.5 min-w-0">
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                      <TransitLineBadge
                        lineId={route.id}
                        lineNumber={route.number}
                        lineName={route.name}
                        size={40}
                        className="regional-route-pill station-header-line-badge shrink-0"
                      />
                      <span className="station-header-line-name text-[13px] sm:text-sm font-bold text-slate-900 dark:text-white leading-tight min-w-0 whitespace-normal break-words">
                        {route.name}
                      </span>
                    </div>
                    {direction ? (
                      <StationLineDirectionIndicator
                        lineId={route.id}
                        platformLabel={direction}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <StationSubmenuNavButtons
            items={navItems}
            onJumpToSection={handleJumpToSection}
          />

          <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto mt-3 pb-3 station-detail-scroll station-detail-section-stack">
            {hasAccessibilityOutages && (
              <button
                type="button"
                onClick={handleJumpToAccessibility}
                className="flex w-full items-center justify-between gap-3 shrink-0 rounded-md border border-red-500/15 bg-red-500/5 px-2.5 py-1.5 text-left dark:border-red-500/20 dark:bg-red-500/10 transition-colors hover:bg-red-500/10 dark:hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                data-station-access-outage-summary
                aria-label="Active accessibility outages. Press for details."
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-red-700 dark:text-red-200">
                    Access Outages
                  </span>
                  <div className="h-4 w-[1px] bg-red-500/20" aria-hidden="true" />
                  <span className="flex items-center gap-2">
                    {elevatorOutagesCount > 0 && (
                      <StationAccessOutageBadge
                        assetType="elevator"
                        count={elevatorOutagesCount}
                        label={formatStationOutageLabel("elevator", elevatorOutagesCount)}
                      />
                    )}
                    {escalatorOutagesCount > 0 && (
                      <StationAccessOutageBadge
                        assetType="escalator"
                        count={escalatorOutagesCount}
                        label={formatStationOutageLabel("escalator", escalatorOutagesCount)}
                      />
                    )}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 dark:text-red-300">Details <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" /></span>
              </button>
            )}

            {connections.length > 0 && (
              <div data-station-section="connected-network">
                <StationConnectionBadges connections={connections} />
              </div>
            )}

            {hasAnyAmenities && (
              <div
                className="flex flex-col gap-3 rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="services-and-amenities"
              >
                <div className="station-subsection-header flex items-center gap-2.5">
                  <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
                  <ConciergeBell size={14} className="shrink-0 text-slate-700 dark:text-white" aria-hidden="true" />
                  <h4 className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Services and Amenities
                  </h4>
                </div>
                <div className="grid grid-cols-3 gap-x-2.5 sm:gap-x-3.5 gap-y-3 sm:gap-y-3.5 items-center pt-0.5 sm:pt-1">
                  {isWheelchairAccessible && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Wheelchair accessible">
                      <Image
                        src="/assets/linewatch/accessible.svg"
                        alt="Wheelchair accessible"
                        width={25}
                        height={25}
                        className="w-[21px] h-[21px] sm:w-[25px] sm:h-[25px] rounded-[3px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,130,201,0.28)] dark:drop-shadow-[0_0_2px_rgba(0,130,201,0.38)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Accessible
                      </span>
                    </div>
                  )}
                  {hasElevator && (
                    <div
                      className="flex items-center gap-1.5 sm:gap-2 min-w-0"
                      data-facility-warning={hasElevatorOutage ? "elevator" : undefined}
                      title={hasElevatorOutage ? "Elevators available, outage reported" : "Elevators available"}
                    >
                      <Image
                        src="/assets/linewatch/outages/elevator.svg"
                        alt={hasElevatorOutage ? "Elevator available, outage reported" : "Elevator available"}
                        width={28}
                        height={28}
                        className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,130,201,0.28)] dark:drop-shadow-[0_0_2px_rgba(0,130,201,0.38)]"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                          Elevators
                        </span>
                        {hasElevatorOutage && (
                          <span className="w-fit rounded bg-amber-500/15 px-1 py-0.2 text-[8.5px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            Outage
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {hasWashroom && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Washrooms available">
                      <Image
                        src="/assets/linewatch/washroom.svg"
                        alt="Washrooms available"
                        width={28}
                        height={28}
                        className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,0,0,0.28)] dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.25)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Washrooms
                      </span>
                    </div>
                  )}
                  {hasParking && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Commuter parking available">
                      <Image
                        src="/assets/linewatch/parking.svg"
                        alt="Parking available"
                        width={30}
                        height={30}
                        className="w-[26px] h-[26px] sm:w-[30px] sm:h-[30px] rounded-full shrink-0 drop-shadow-[0_0_1.5px_rgba(33,178,82,0.28)] dark:drop-shadow-[0_0_2px_rgba(33,178,82,0.38)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Parking
                      </span>
                    </div>
                  )}
                  {hasBicycleLockup && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Bicycle rack available">
                      <Image
                        src="/assets/linewatch/bicycle-lockup.svg"
                        alt="Bicycle rack available"
                        width={28}
                        height={28}
                        className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,0,0,0.28)] dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.25)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Bike Rack
                      </span>
                    </div>
                  )}
                  {hasPpudo && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Passenger pick-up / drop-off available">
                      <Image
                        src="/assets/linewatch/passenger-pick-up.svg"
                        alt="Passenger pick-up / drop-off available"
                        width={28}
                        height={28}
                        className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] shrink-0 drop-shadow-[0_0_1.5px_rgba(0,0,0,0.28)] dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.25)]"
                      />
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Passenger Pick-up
                      </span>
                    </div>
                  )}
                  {hasWifi && (
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0" title="Wi-Fi available">
                      <div className="flex w-[26px] h-[26px] sm:w-[30px] sm:h-[30px] items-center justify-center rounded-full bg-black/8 text-slate-700 dark:bg-white/12 dark:text-slate-200 shrink-0 drop-shadow-[0_0_1.5px_rgba(0,0,0,0.18)] dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.12)]">
                        <Wifi size={16} className="shrink-0" />
                      </div>
                      <span className="text-[13px] sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">
                        Wi-Fi
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <section
                className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="arrivals"
              >
                <h3 className="station-subsection-header flex items-center gap-2.5 text-lg font-black text-slate-900 dark:text-white">
                  <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
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
                        const lineBadgeColors = transitLineBadgeColors(section.lineId);
                        const lineColor = lineBadgeColors.backgroundColor;

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
                              className={`flex flex-col gap-2 rounded-lg px-1 py-1.5 transition-colors duration-200 ${
                                isPinned
                                  ? "bg-amber-500/[0.08] dark:bg-amber-400/[0.07]"
                                  : "bg-transparent"
                              }`}
                            >
                              <div className="flex items-center justify-between relative z-10">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <TransitLineBadge
                                    lineId={section.lineId}
                                    lineNumber={section.lineNumber}
                                    lineName={section.lineName}
                                    size={32}
                                    className="shrink-0 relative z-10"
                                  />
                                  <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                                    {section.lineName ?? section.lineNumber}
                                  </span>
                                  {isPinned && (
                                    <span
                                      className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 shrink-0 select-none animate-in fade-in duration-200"
                                      data-pinned-badge
                                    >
                                      Starred
                                    </span>
                                  )}
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

                              <div className="flex flex-col gap-2.5">
                                {section.groups.map((group, groupIndex) => {
                                  const isFirst = groupIndex === 0;
                                  const isLast = groupIndex === section.groups.length - 1;
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
                                      className="relative flex flex-col gap-2 pl-[32px] pt-1 pb-1"
                                    >
                                      {/* Track spine running continuously behind the platform stop node */}
                                      <div
                                        aria-hidden="true"
                                        className="station-arrival-track-spine"
                                        style={{
                                          backgroundColor: lineColor,
                                          left: "16px",
                                          top: isFirst ? "-8px" : "-12px",
                                          bottom: isLast ? "0px" : "-12px",
                                          borderBottomLeftRadius: isLast ? "9999px" : "0",
                                          borderBottomRightRadius: isLast ? "9999px" : "0",
                                        }}
                                      />

                                      <div className="relative flex min-w-0 items-center justify-between gap-3">
                                        {/* Platform stop node: absolute to outer row div (no overflow:hidden), left:-16px centers on spine at 32-16=16px from group edge, top:50% vertically centered to the text to the right */}
                                        <div
                                          aria-hidden="true"
                                          className="station-arrival-track-node"
                                          style={{
                                            left: "-16px",
                                            top: "50%",
                                            transform: "translate(-50%, -50%)",
                                          }}
                                        />
                                        <div className="flex min-w-0 flex-col leading-tight">
                                          <strong className="min-w-0 break-words font-black text-slate-900 dark:text-white">
                                            {group.directionLabel}
                                          </strong>
                                          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                            {group.destinationLabel}
                                            {group.isTerminating && (
                                              <span className="animate-terminating-blink inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                                <ArrowDownToLine size={9} aria-hidden="true" className="shrink-0" />
                                                Terminating
                                              </span>
                                            )}
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

                                        <div className="mt-2 flex flex-col gap-3">
                                        {group.platforms.map((platform) => (
                                          <div key={platform.key} data-regional-arrival-platform={platform.key}>
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                {platform.label}
                                              </h4>
                                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                {platform.arrivals.some((arrival) => shouldShowRegionalArrivalDelay(arrival, arrivalTick))
                                                  ? "Delayed estimate"
                                                  : platform.arrivals.some((arrival) => arrival.status === "live" && arrival.delayMinutes > 0)
                                                    ? "Live estimates"
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
                                                const delayed = shouldShowRegionalArrivalDelay(arrival, arrivalTick)
                                                  && !tripChange;
                                                const detailedCountdown = index === 0
                                                  && shouldUseDetailedRegionalArrivalCountdown(arrival, arrivalTick);
                                                const timeDisplay = regionalArrivalTimeDisplay(
                                                  arrival,
                                                  arrivalTick,
                                                  { detailedCountdown }
                                                );
                                                const scheduledClockTime = formatRegionalArrivalClockTime(
                                                  arrival.scheduledAt || arrival.predictedAt,
                                                  arrivalTick,
                                                );
                                                const isCountdown = detailedCountdown && !due && !tripChange;
                                                const destinationName = formatRegionalDestinationName(
                                                  arrival.direction,
                                                  section.lineNumber as RegionalRouteCode,
                                                );
                                                const showTileDestination = Boolean(
                                                  destinationName
                                                  && !group.isTerminating
                                                  && `To ${destinationName}`.toLowerCase() !== group.destinationLabel.trim().toLowerCase(),
                                                );
                                                const coachCountLabel = formatRegionalArrivalCoachCount(arrival);
                                                return (
                                                  <div
                                                    key={`${arrival.tripNumber}:${arrival.predictedAt}`}
                                                    data-arrival-due={due ? "true" : "false"}
                                                    data-regional-arrival-due={due ? "true" : "false"}
                                                    className={[
                                                      "station-arrival-tile relative flex flex-col items-center justify-center rounded-md border px-1.5 pt-3.5 text-center transition-colors",
                                                      coachCountLabel
                                                        ? showTileDestination
                                                          ? "min-h-[92px] sm:min-h-[96px] pb-6"
                                                          : "min-h-[86px] sm:min-h-[90px] pb-6"
                                                        : showTileDestination
                                                          ? "min-h-[78px] sm:min-h-[82px] pb-2"
                                                          : "min-h-[74px] sm:min-h-[78px] pb-1.5",
                                                      tripChange?.kind === "cancellation" || tripChange?.kind === "skipped-stop"
                                                        ? "border-red-500/70 bg-red-500/15 text-red-900 shadow-[0_0_0_1px_rgba(239,68,68,0.16)] dark:text-red-50"
                                                        : tripChange?.kind === "added-stop"
                                                          ? "border-blue-500/60 bg-blue-500/10 text-blue-900 dark:text-blue-50"
                                                        : due
                                                          ? "border-red-400/80 bg-red-900/85 text-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.25)]"
                                                          : delayed
                                                            ? "border-orange-400/60 bg-orange-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(251,146,60,0.12)] dark:border-orange-400/45 dark:bg-orange-400/10 dark:text-white"
                                                          : soon
                                                            ? "border-emerald-400/35 bg-emerald-500/10 text-slate-900 shadow-[0_0_0_1px_rgba(52,211,153,0.12)] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-white"
                                                            : "border-black/10 bg-slate-950/[0.03] text-slate-900 dark:border-white/10 dark:bg-[#0f1117] dark:text-white",
                                                    ].join(" ")}
                                                  >
                                                    <ArrivalTileSourceIndicator
                                                      status={arrival.status}
                                                      isDue={due || tripChange?.kind === "cancellation" || tripChange?.kind === "skipped-stop"}
                                                    />
                                                    {delayed ? (
                                                      <RegionalArrivalDelayBadge arrival={arrival} now={arrivalTick} isDue={due} />
                                                    ) : null}
                                                    <strong className={isCountdown
                                                      ? "whitespace-nowrap text-base font-black leading-none tracking-tight tabular-nums"
                                                      : "text-base font-black leading-none tracking-tight"}
                                                    >
                                                      {tripChange ? regionalTripChangeLabel(tripChange.kind) : timeDisplay.primary}
                                                    </strong>
                                                    <span className="mt-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold tabular-nums">
                                                      {delayed && scheduledClockTime ? (
                                                        <span className={due
                                                          ? "whitespace-nowrap text-red-100/55 line-through decoration-current"
                                                          : "whitespace-nowrap text-slate-500/75 line-through decoration-current dark:text-slate-500"}
                                                        >
                                                          {scheduledClockTime}
                                                        </span>
                                                      ) : null}
                                                      <span className={[
                                                        "whitespace-nowrap",
                                                        due
                                                          ? "text-red-100/80"
                                                          : soon
                                                            ? "text-emerald-700 dark:text-emerald-300"
                                                            : "text-slate-500 dark:text-slate-400"
                                                      ].join(" ")}>
                                                        {tripChange
                                                          ? `Train ${cleanRegionalTripNumber(arrival.tripNumber) || arrival.tripNumber}`
                                                          : timeDisplay.secondary}
                                                      </span>
                                                    </span>
                                                    {tripChange ? (
                                                      <span className="mt-1 text-[9px] font-black uppercase tracking-wider opacity-85">
                                                        {tripChange.kind === "cancellation" || tripChange.kind === "skipped-stop" ? (
                                                          <>
                                                            Scheduled <span className="text-xs font-semibold tracking-normal line-through decoration-[1px] opacity-75">{scheduledClockTime || timeDisplay.secondary}</span>
                                                          </>
                                                        ) : (
                                                          <>
                                                            Scheduled {scheduledClockTime || timeDisplay.secondary}
                                                          </>
                                                        )}
                                                      </span>
                                                    ) : null}
                                                    {showTileDestination ? (
                                                      <span
                                                        className={
                                                          due
                                                            ? "mt-1 max-w-full truncate px-1 text-[10px] font-bold tracking-tight text-red-100/90"
                                                            : soon
                                                              ? "mt-1 max-w-full truncate px-1 text-[10px] font-bold tracking-tight text-emerald-800 dark:text-emerald-200"
                                                              : "mt-1 max-w-full truncate px-1 text-[10px] font-bold tracking-tight text-slate-600 dark:text-slate-300"
                                                        }
                                                        title={`To ${destinationName}`}
                                                      >
                                                        To {destinationName}
                                                      </span>
                                                    ) : null}
                                                    {coachCountLabel ? (
                                                      <span
                                                        data-regional-arrival-coach-count
                                                        className="absolute bottom-1.5 right-1.5 whitespace-nowrap text-[9px] font-extrabold leading-none tracking-tight opacity-75"
                                                      >
                                                        {coachCountLabel}
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

              <details
                className="station-impacts-details group rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="station-impacts"
                aria-label="Station service impacts"
                open={impacts.length > 0}
              >
                <summary className="station-impacts-summary flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-black text-slate-900 dark:text-white">
                  <div className="station-subsection-header flex min-w-0 items-center gap-2.5">
                    <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
                    <AlertCircle size={20} className="shrink-0 text-orange-500 dark:text-orange-400" />
                    <span className="truncate">Station Impacts</span>
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-white/10 dark:text-slate-200">
                      {impacts.length}
                    </span>
                  </div>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className="station-impacts-chevron shrink-0 text-slate-500 dark:text-slate-300 transition-transform duration-200"
                  />
                </summary>
                <div className="pt-3 flex flex-col gap-2">
                  {impacts.length > 0 ? (
                    impacts.map((impact) => (
                      <div
                        key={`${impact.kind}:${impact.id}`}
                        data-station-impact-tone={impact.tone}
                        className={stationImpactCardClassName(impact.tone)}
                      >
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
                    ))
                  ) : (
                    <p className="py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                      No active impacts for this station.
                    </p>
                  )}
                </div>
              </details>

              {station.lineIds.some((lineId) => lineId !== "regional-up") ? (
                <details
                  className="station-trip-changes-details station-impacts-details group rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                  data-station-section="trip-changes"
                  aria-label="Upcoming GO train changes"
                  open={tripChanges.changes.length > 0}
                >
                  <summary className="station-trip-changes-summary station-impacts-summary flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-black text-slate-900 dark:text-white">
                    <div className="station-subsection-header flex min-w-0 items-center gap-2.5">
                      <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
                      <AlertTriangle size={20} className="shrink-0 text-amber-500" />
                      <span className="truncate">Upcoming Trip Changes</span>
                      {!tripChangesLoading && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-white/10 dark:text-slate-200">
                          {tripChanges.changes.length}
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      size={18}
                      aria-hidden="true"
                      className="station-trip-changes-chevron station-impacts-chevron shrink-0 text-slate-500 dark:text-slate-300 transition-transform duration-200"
                    />
                  </summary>
                  <div className="pt-3 flex flex-col gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      GO operational feeds · published schedule matched
                    </p>
                    <div className="mt-1">
                      <RegionalTripChangesList
                        data={tripChanges}
                        loading={tripChangesLoading}
                        compact
                        emptyLabel="No upcoming GO train changes matched to this station."
                      />
                    </div>
                  </div>
                </details>
              ) : null}

              <details
                ref={noticesDetailsRef}
                className="station-notices-details rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="notices"
                aria-label="Regional station notices"
              >
                <summary
                  onClick={handleNoticesSummaryClick}
                  className="station-notices-summary flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-black text-slate-900 dark:text-white"
                >
                  <div className="station-subsection-header flex min-w-0 items-center gap-2.5">
                    <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
                    <FileText size={20} className="shrink-0 text-slate-700 dark:text-slate-300" />
                    <span className="min-w-0 truncate">Notices</span>
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-white/10 dark:text-slate-200">
                      {linkedNotices.length}
                    </span>
                  </div>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className="station-notices-chevron shrink-0 text-slate-500 dark:text-slate-300"
                  />
                </summary>
                <div className="station-notices-content-wrapper">
                  <div className="station-notices-content pt-3 flex flex-col gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Metrolinx Open API
                    </p>
                    {noticesState.loading ? (
                      <div className="station-notice-card flex min-h-16 items-center justify-center rounded-md border border-black/10 bg-white/60 dark:border-white/10 dark:bg-black/10">
                        <LoaderCircle size={18} className="animate-spin text-slate-500" aria-label="Loading station notices" />
                      </div>
                    ) : linkedNotices.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {linkedNotices.map((notice) => (
                          <div
                            key={notice.id}
                            className="station-notice-card flex flex-col gap-2 rounded-md border border-black/10 bg-white/80 p-3 text-sm shadow-sm dark:border-white/10 dark:bg-[var(--panel)]/80"
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
                ref={accessibilityDetailsRef}
                className="station-accessibility-details rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                data-station-section="accessibility"
                aria-label="Regional accessibility outages"
              >
                <summary className="station-accessibility-summary flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-black text-slate-900 dark:text-white">
                  <div className="station-subsection-header flex min-w-0 items-center gap-2.5">
                    <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
                    <Image
                      src="/assets/linewatch/accessibility-alert.svg"
                      alt=""
                      width={20}
                      height={20}
                      aria-hidden="true"
                      className="w-5 h-5 shrink-0"
                    />
                    <span className="min-w-0 truncate">Accessibility Outages</span>
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-white/10 dark:text-slate-200">
                      {accessibilityOutages.length}
                    </span>
                  </div>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className="station-accessibility-chevron shrink-0 text-slate-500 dark:text-slate-300"
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
                            className="station-accessibility-card rounded-md border border-amber-500/30 bg-white/80 p-3 dark:bg-black/10"
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
