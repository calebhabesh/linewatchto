"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BusFront, Info, TrainFront } from "lucide-react";
import type { DashboardData } from "../app/DataContext";
import type { ImpactSelection } from "../app/linewatch-data";
import type { SurfaceNoticeResponse, SurfaceNoticeDetail } from "../app/surface-notice-data";
import { currentServiceSummary, currentSurfaceNotices } from "../app/current-service";
import { LineBadge } from "./ImpactCardFields";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { SurfaceCategoryIcon } from "./SurfaceCategoryIcon";


type Props = {
  data: DashboardData;
  notices: SurfaceNoticeResponse | null;
  onNotice: (notice: SurfaceNoticeDetail) => void;
  onImpact: (selection: NonNullable<ImpactSelection>) => void;
  onStatus: () => void;
  onNotices: () => void;
};

const noticeLabels: Record<string, string> = {
  "no-service": "No Service",
  detour: "Detour",
  bypass: "Bypass",
  "service-change": "Service Change",
};

function ServiceList({ children, rail = false }: { children: ReactNode; rail?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      element.dataset.moreAbove = String(element.scrollTop > 1);
      element.dataset.moreBelow = String(element.scrollHeight - element.clientHeight - element.scrollTop > 1);
    };
    const resize = new ResizeObserver(update);
    const observeSizes = () => {
      resize.disconnect();
      resize.observe(element);
      for (const child of element.children) resize.observe(child);
      update();
    };
    const mutations = new MutationObserver(observeSizes);
    mutations.observe(element, { childList: true, subtree: true, characterData: true });
    element.addEventListener("scroll", update, { passive: true });
    observeSizes();
    return () => {
      resize.disconnect();
      mutations.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, []);
  return <div ref={ref} className={`current-service-list${rail ? " current-service-rail-list" : ""}`}>{children}</div>;
}

function GoodServiceCheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="current-service-good-service-icon shrink-0"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7.25" fill="#16a34a" />
      <path
        d="M4.75 8.25L6.75 10.25L11.25 5.75"
        stroke="#ffffff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CurrentServicePanel({ data, notices, onNotice, onImpact, onNotices }: Props) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const frame = requestAnimationFrame(update);
    const timer = window.setInterval(update, 30_000);
    return () => { cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, []);
  const summary = currentServiceSummary(data, now);
  const railGroups = [...new Set(summary.rows.map(row => row.lineId))].map(lineId => ({
    lineId,
    rows: summary.rows.filter(row => row.lineId === lineId),
  }));
  const activeCount = summary.rows.length;
  const surfaceRows = notices?.fresh && now > 0 ? currentSurfaceNotices(notices.notices, now) : [];

  return <section className="current-service" data-map-chooser-keepout aria-label="Current Service">
    <header className="current-service-heading"><h2>Current Service</h2><span>Active alerts, delays & planned closures starting within 24h</span></header>
    {!summary.fresh && <p className="current-service-availability">{data.availability === "fixture" ? "Demo data · Current status unavailable" : "Current status unavailable"}</p>}
    <div className="current-service-columns">
      <section aria-label="Rail service status">
        <h3><TrainFront size={13} aria-hidden="true" />{data.networkId === "ttc" ? "Subway & Light Rail" : "GO & UP Rail"}{summary.fresh && <span className="current-service-active-count" aria-label={`${activeCount} rail alerts, delays, and closures`}>{activeCount}</span>}</h3>
        <ServiceList rail>
          {railGroups.map(group => <div className="current-service-line" key={group.lineId}>
            <div className="current-service-line-badge-wrap">
              <LineBadge lineId={group.lineId} lineNumber={group.rows[0].lineNumber} size={24} />
            </div>
            <div className="current-service-line-copy">
              {group.rows.map(row => {
                const timingLabel = row.timing
                  ? (row.priority === 2 && !row.timing.startsWith("Starts ") && !row.timing.startsWith("Ends ") ? "Starts " : "") + row.timing
                  : null;
                return (
                  <button type="button" className="current-service-impact current-service-impact--compact" key={`${row.kind}:${row.id}`} onClick={() => onImpact({ kind: row.kind, id: row.id })}>
                    <span className="current-service-impact-heading">
                      <strong data-kind={row.iconKind || row.kind}><ImpactTypeIcon kind={row.iconKind || row.kind} size={16} />{row.condition === "Upcoming Closure" ? "Planned Closure" : row.condition}</strong>
                    </span>
                    {timingLabel && <span className="current-service-impact-timing">{timingLabel}</span>}
                    <span className="current-service-impact-location">{row.location}{row.direction && <span className="current-service-inline-direction"> · {row.direction}</span>}</span>
                  </button>
                );
              })}
            </div>
          </div>)}
          {summary.unaffected.map(line => {
            const isClosed = line.status === ("closed" as string) || line.statusLabel.toLowerCase() === "closed";
            return (
              <div className="current-service-line current-service-line--unaffected" key={line.id}>
                <div className="current-service-line-badge-wrap">
                  <LineBadge lineId={line.id} lineNumber={line.number} size={24} />
                </div>
                <div className="current-service-line-copy current-service-line-copy--clear">
                  <p className="current-service-clear">
                    {isClosed ? <Info size={16} aria-hidden="true" /> : <GoodServiceCheckIcon size={16} />}
                    <span>{isClosed ? "Closed" : "Good Service"}</span>
                  </p>
                </div>
              </div>
            );
          })}
          {summary.fresh && !summary.rows.length && <p className="current-service-clear"><GoodServiceCheckIcon size={14} /><span>No active alerts, delays, or upcoming closures</span></p>}
        </ServiceList>
      </section>
      <section aria-label="Surface service notices">
        <h3><BusFront size={13} aria-hidden="true" />{data.networkId === "ttc" ? "Streetcar / Bus Alerts" : "Service Notices"}{notices?.fresh && now > 0 && <span className="current-service-active-count" aria-label={`${Math.min(surfaceRows.length, 3)} notices shown${surfaceRows.length > 3 ? ", more available in all notices" : ""}`}>{Math.min(surfaceRows.length, 3)}{surfaceRows.length > 3 ? "+" : ""}</span>}</h3>
        <ServiceList>
          {surfaceRows.slice(0, 3).map((notice) => <button type="button" className="current-service-notice" key={notice.id} onClick={() => onNotice(notice)}>
            <span className="current-service-routes">{(notice.routeIds.length ? notice.routeIds : [data.networkId === "ttc" ? "TTC" : "GO"]).map((route) => <span className="current-service-route" key={route}>{route}</span>)}</span>
            <span className="current-service-notice-copy">
              <strong data-category={notice.category}>
                <SurfaceCategoryIcon category={notice.category} size={12} className="shrink-0" />
                {noticeLabels[notice.category] || "Notice"}
              </strong>
              <span>{notice.location || notice.title}</span>
            </span>
          </button>)}
          {!surfaceRows.length && <p className="current-service-empty">{!notices || notices.fresh && now === 0 ? "Loading notices…" : notices.fresh ? "No current notices reported" : "Current notices unavailable"}</p>}
        </ServiceList>
        <button type="button" className="current-service-all" onClick={onNotices}>{surfaceRows.length > 3 ? `${surfaceRows.length - 3} more · ` : ""}All {data.networkId === "ttc" ? "surface alerts" : "service notices"}<ArrowRight size={12} aria-hidden="true" /></button>
      </section>
    </div>
  </section>;
}
