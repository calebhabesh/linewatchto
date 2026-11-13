"use client";

import { AlertCircle, ArrowDown, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpDown, BadgeInfo, ChevronDown, type LucideIcon } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { normalizeDashboardSourceLabel } from "../app/dashboard-source-label";
import type { NetworkId } from "../app/dashboard-contract";
import { formatImpactTimestamp } from "../app/impact-time";
import { getSurfaceNotices, type SurfaceNoticeDetail } from "../app/surface-notice-data";
import { surfaceNoticesNameStop } from "../app/surface-stop-arrivals";
import {
  surfaceNoticeCategoryLabel,
  surfaceNoticeImpactGroups,
  surfaceNoticeImpactTone,
  surfaceStopImpactGroups,
  type SurfaceStopImpactCard,
} from "../app/surface-notice-groups";
import { StationDisruptionSummary } from "./StationDisruptionSummary";
import { SurfaceCategoryIcon } from "./SurfaceCategoryIcon";
import { jumpToStationImpactsSection } from "./station-impacts-jump";

/** A network's notices while its list is fresh: an old saved one could name cleared notices. */
export function useFreshSurfaceNotices(networkId: NetworkId): SurfaceNoticeDetail[] {
  const [notices, setNotices] = useState<SurfaceNoticeDetail[]>([]);
  useEffect(() => {
    let active = true;
    void getSurfaceNotices({ networkId }).then((response) => {
      if (active) setNotices(response.source === "backend" && response.data.fresh ? response.data.notices : []);
    });
    return () => { active = false; };
  }, [networkId]);
  return notices;
}

/**
 * A stop panel's warning over its departures: the station panel's, and its jump
 * to the cards. A notice naming only the route may not touch this stop, so
 * then the warning is about the route.
 */
export function SurfaceStopDisruption({ notices, stopId, reducedMotion }: {
  notices: readonly SurfaceNoticeDetail[];
  stopId: string | null;
  reducedMotion: boolean;
}) {
  if (notices.length === 0) return null;
  return (
    <StationDisruptionSummary
      title={surfaceNoticesNameStop(notices, stopId) ? undefined : "Route Service May Be Disrupted"}
      badges={surfaceNoticeImpactGroups(notices).map((group) => ({
        key: group.category,
        label: group.label,
        count: group.count,
        icon: <SurfaceCategoryIcon category={group.category} size={17} />,
      }))}
      onJump={(origin) => jumpToStationImpactsSection(origin, reducedMotion)}
    />
  );
}

const CARD_TONE_CLASS = {
  "no-service": "suspension-card-border",
  planned: "planned-closure-card-border",
  caution: "rsz-card-border",
} as const;

const BUTTON_TONE_CLASS = {
  "no-service": "border-red-500/35 bg-red-500/10 hover:bg-red-500/20 hover:border-red-500/60",
  planned: "border-blue-500/35 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/60",
  caution: "border-[#F59E0B]/35 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 hover:border-[#F59E0B]/65",
} as const;

const DIRECTION_ICON: Record<string, LucideIcon> = {
  Northbound: ArrowUp,
  Southbound: ArrowDown,
  Eastbound: ArrowRight,
  Westbound: ArrowLeft,
};

function directionIcon(direction: string, cards: readonly SurfaceStopImpactCard[]): LucideIcon {
  if (DIRECTION_ICON[direction]) return DIRECTION_ICON[direction];
  // "Both Ways": the axis the routes run on, when the text names one.
  const text = cards.flatMap((card) => card.notices.map((notice) => notice.title)).join(" ").toLowerCase();
  return /\b(east|west)bound\b/.test(text) ? ArrowLeftRight : ArrowUpDown;
}

/**
 * A stop's notices in the station panel's Station Impacts design. Each card's
 * View Details opens its card in the notice list, whose Back returns here.
 * A notice can name the route rather than this stop, so the card shows its
 * routes, and with none naming the stop the section is Route Impacts.
 *
 * With notices for more than one direction, cards sit under a header per
 * direction, and routes sharing a notice's text at the stop share one card
 * (surfaceStopImpactGroups), so a detour posted for each route reads once.
 */
export function SurfaceStopImpacts({ notices, stopId, routeBadgeStyle, onOpenNotice }: {
  notices: readonly SurfaceNoticeDetail[];
  stopId: string | null;
  routeBadgeStyle: (route: string) => CSSProperties | undefined;
  onOpenNotice?: (notice: SurfaceNoticeDetail) => void;
}) {
  if (notices.length === 0) return null;
  const groups = surfaceStopImpactGroups(notices);
  const cardCount = groups.reduce((total, group) => total + group.cards.length, 0);
  const showDirections = groups.length > 1;
  return (
    <details
      data-station-section="station-impacts"
      open
      className="station-impacts-details group w-full rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
    >
      <summary className="station-impacts-summary flex cursor-pointer list-none items-center justify-between gap-2 text-lg font-black text-slate-900 dark:text-white">
        <div className="station-subsection-header flex min-w-0 items-center gap-2.5">
          <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" aria-hidden="true" />
          <AlertCircle size={20} className="shrink-0 text-orange-500 dark:text-orange-400" aria-hidden="true" />
          <span className="truncate">{surfaceNoticesNameStop(notices, stopId) ? "Stop Impacts" : "Route Impacts"}</span>
          <span className={`desktop-menu-count-badge desktop-menu-count-rsz flex h-6 ${cardCount < 10 ? "w-6" : "min-w-[24px] px-1.5"} shrink-0 items-center justify-center rounded-full text-[11px] font-bold`}>
            {cardCount}
          </span>
        </div>
        <ChevronDown size={18} aria-hidden="true" className="station-impacts-chevron shrink-0 text-slate-500 dark:text-slate-300 transition-transform duration-200" />
      </summary>
      <div className="pt-3 flex flex-col gap-3">
        {groups.map((group) => {
          const label = group.direction ?? "Direction Not Stated";
          const Icon = group.direction ? directionIcon(group.direction, group.cards) : null;
          const headingId = `stop-impacts-${stopId ?? "stop"}-${label.replace(/\W+/g, "-").toLowerCase()}`;
          return (
            <section
              key={label}
              data-stop-impact-direction={group.direction ?? "none"}
              aria-labelledby={showDirections ? headingId : undefined}
              className="flex flex-col gap-2"
            >
              {showDirections ? (
                <h4 id={headingId} className="flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {Icon ? <Icon size={13} className="shrink-0" aria-hidden="true" /> : null}
                  <span>{label}</span>
                  <span className="text-slate-400 dark:text-slate-500" aria-label={`${group.cards.length} ${group.cards.length === 1 ? "impact" : "impacts"}`}>
                    · {group.cards.length}
                  </span>
                </h4>
              ) : null}
              {group.cards.map((card) => (
                <StopImpactCard key={card.key} card={card} routeBadgeStyle={routeBadgeStyle} onOpenNotice={onOpenNotice} />
              ))}
            </section>
          );
        })}
      </div>
    </details>
  );
}

function StopImpactCard({ card, routeBadgeStyle, onOpenNotice }: {
  card: SurfaceStopImpactCard;
  routeBadgeStyle: (route: string) => CSSProperties | undefined;
  onOpenNotice?: (notice: SurfaceNoticeDetail) => void;
}) {
  // Every notice on a card shares its kind, text and stop; the newest stands for it.
  const notice = card.notices.reduce((newest, next) => (next.updatedAt > newest.updatedAt ? next : newest));
  const tone = surfaceNoticeImpactTone(notice);
  const label = surfaceNoticeCategoryLabel(notice.category);
  return (
    <div
      data-stop-impact={card.notices[0].id}
      data-stop-impact-notices={card.notices.length > 1 ? card.notices.map((entry) => entry.id).join(" ") : undefined}
      data-station-impact-tone={tone}
      className={`station-impact-card flex flex-col gap-2.5 rounded-lg p-3 text-sm transition-colors ${CARD_TONE_CLASS[tone]}`}
    >
      <div className="flex items-center gap-2.5 font-bold text-sm text-slate-900 dark:text-white">
        <SurfaceCategoryIcon category={notice.category} size={26} className="shrink-0" />
        <span className="leading-none flex items-center">{label}</span>
        <span className="surface-stop-impact-routes">
          {card.routeIds.map((route) => (
            <span key={route} className="surface-stop-route-badge is-small is-bus" style={routeBadgeStyle(route)}>{route}</span>
          ))}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <strong className="block font-bold text-slate-900 dark:text-white">{card.title}</strong>
        {notice.location && notice.location !== card.title ? (
          <p className="text-slate-700 dark:text-slate-200 leading-snug">{notice.location}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 min-w-0">
          {normalizeDashboardSourceLabel(notice.source)} / {formatImpactTimestamp(notice.updatedAt)}
        </p>
        {onOpenNotice ? (
          <button
            type="button"
            onClick={() => onOpenNotice(notice)}
            aria-label={`Open ${label} details: ${card.title}${card.routeIds.length > 1 ? ` (routes ${card.routeIds.join(", ")})` : ""}`}
            className={`ml-auto inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold leading-none text-slate-900 dark:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:scale-95 ${BUTTON_TONE_CLASS[tone]}`}
          >
            <BadgeInfo size={16} className="shrink-0 text-current" aria-hidden="true" />
            <span className="truncate leading-none flex items-center">View Details</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
