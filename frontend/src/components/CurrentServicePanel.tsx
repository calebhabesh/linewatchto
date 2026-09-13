"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BusFront, Info, TrainFront } from "lucide-react";
import type { DashboardData } from "../app/DataContext";
import type { ImpactSelection } from "../app/linewatch-data";
import type { SurfaceNoticeResponse, SurfaceNoticeDetail } from "../app/surface-notice-data";
import { currentServiceSummary, currentSurfaceNotices, getCanonicalAlertTitle } from "../app/current-service";
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

const COLLAPSED_LIST_HEIGHT = 116;

export function CurrentServicePanel({ data, notices, onNotice, onImpact, onNotices }: Props) {
  const [now, setNow] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartHeight = useRef<number>(COLLAPSED_LIST_HEIGHT);
  const currentHeightRef = useRef<number>(COLLAPSED_LIST_HEIGHT);
  const dragMoved = useRef(false);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const frame = requestAnimationFrame(update);
    const timer = window.setInterval(update, 30_000);
    return () => { cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, []);

  const measureMaxContentHeight = () => {
    const lists = sectionRef.current?.querySelectorAll<HTMLElement>(".current-service-list");
    let maxContent = COLLAPSED_LIST_HEIGHT;
    lists?.forEach((l) => {
      if (l.scrollHeight > maxContent) maxContent = l.scrollHeight;
    });
    return Math.max(maxContent, 340);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    dragStartY.current = e.clientY;
    dragMoved.current = false;

    const listEl = sectionRef.current?.querySelector<HTMLElement>(".current-service-list");
    const currentH = listEl ? listEl.clientHeight : (isExpanded ? 400 : COLLAPSED_LIST_HEIGHT);
    dragStartHeight.current = currentH;
    currentHeightRef.current = currentH;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (dragStartY.current === null) return;
      const delta = dragStartY.current - moveEvent.clientY;

      if (!dragMoved.current && Math.abs(delta) > 3) {
        dragMoved.current = true;
        setIsDragging(true);
      }

      if (dragMoved.current) {
        const maxH = measureMaxContentHeight();
        const minH = COLLAPSED_LIST_HEIGHT;
        const targetH = Math.max(minH, Math.min(maxH, dragStartHeight.current + delta));
        currentHeightRef.current = targetH;
        sectionRef.current?.style.setProperty("--custom-sheet-height", `${targetH}px`);
      }
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);

      dragStartY.current = null;
      setIsDragging(false);

      if (dragMoved.current) {
        const lists = sectionRef.current?.querySelectorAll<HTMLElement>(".current-service-list");
        let maxContent = COLLAPSED_LIST_HEIGHT;
        lists?.forEach((l) => {
          if (l.scrollHeight > maxContent) maxContent = l.scrollHeight;
        });
        const maxH = Math.max(maxContent, 340);
        const minH = COLLAPSED_LIST_HEIGHT;
        const h = currentHeightRef.current;

        if (h <= minH + 20) {
          setIsExpanded(false);
          sectionRef.current?.style.removeProperty("--custom-sheet-height");
        } else if (h >= maxH - 20) {
          setIsExpanded(true);
          sectionRef.current?.style.removeProperty("--custom-sheet-height");
        } else {
          setIsExpanded(true);
        }
      }
    };

    const onPointerCancel = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      dragStartY.current = null;
      setIsDragging(false);
      sectionRef.current?.style.removeProperty("--custom-sheet-height");
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  };

  const handleToggleExpand = () => {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    sectionRef.current?.style.removeProperty("--custom-sheet-height");
    setIsExpanded((prev) => !prev);
  };

  const summary = currentServiceSummary(data, now);
  const railLines = summary.fresh
    ? data.lineStatuses.map(line => ({
        line,
        rows: summary.rows.filter(row => row.lineId === line.id),
      }))
    : summary.rows.length > 0
      ? data.lineStatuses.map(line => ({
          line,
          rows: summary.rows.filter(row => row.lineId === line.id),
        })).filter(item => item.rows.length > 0)
      : [];
  const affectedLines = railLines.filter(item => item.rows.length > 0);
  const closedLines = railLines.filter(item => item.rows.length === 0 && (item.line.status === ("closed" as string) || item.line.statusLabel.toLowerCase() === "closed"));
  const clearLines = railLines.filter(item => item.rows.length === 0 && item.line.status !== ("closed" as string) && item.line.statusLabel.toLowerCase() !== "closed");
  const activeCount = summary.rows.length;
  const surfaceRows = notices?.fresh && now > 0 ? currentSurfaceNotices(notices.notices, now) : [];
  const visibleNoticeCount = Math.min(surfaceRows.length, 6);

  return <section
    ref={sectionRef}
    className="current-service"
    aria-label="Current Service"
    data-expanded={isExpanded ? "true" : "false"}
    data-dragging={isDragging ? "true" : undefined}
  >
    <div
      className="current-service-handle-container"
      data-dragging={isDragging ? "true" : undefined}
      data-expanded={isExpanded ? "true" : undefined}
    >
      <button
        type="button"
        className="current-service-handle"
        aria-label={isExpanded ? "Collapse current service sheet" : "Expand current service sheet"}
        aria-expanded={isExpanded}
        onClick={handleToggleExpand}
        onPointerDown={handlePointerDown}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            sectionRef.current?.style.removeProperty("--custom-sheet-height");
            setIsExpanded(true);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            sectionRef.current?.style.removeProperty("--custom-sheet-height");
            setIsExpanded(false);
          }
        }}
      >
        <span className="station-sheet-drag-ridges" aria-hidden="true">
          <span /><span /><span />
        </span>
      </button>
    </div>
    <header className="current-service-heading"><h2>Current Service</h2><span>Active alerts, delays & planned closures starting within 24h</span></header>
    {!summary.fresh && <p key={`avail-${data.networkId}`} className="current-service-availability">{data.availability === "fixture" ? "Demo data · Current status unavailable" : "Current status unavailable"}</p>}
    <div key={data.networkId} className="current-service-columns">
      <section aria-label="Rail service status">
        <h3>
          <TrainFront size={13} aria-hidden="true" />
          {data.networkId === "ttc" ? "Subway & Light Rail" : "GO & UP Rail"}
          {summary.fresh && (
            <span
              className="current-service-active-count"
              data-count={activeCount > 0 ? "positive" : "zero"}
              data-single-digit={activeCount < 10 ? "true" : "false"}
              aria-label={`${activeCount} rail alerts, delays, and closures`}
            >
              {activeCount}
            </span>
          )}
        </h3>
        {data.snapshot && <p className="p-2 text-xs">Current status unknown.{data.snapshot?.savedAt != null ? " Saved reports follow; service may have changed." : " Connect for service information."}</p>}
        <ServiceList rail>
          {summary.fresh && affectedLines.length === 0 && closedLines.length === 0 && clearLines.length > 0 ? (
            <div
              className="current-service-all-clear"
              aria-label={data.networkId === "regional"
                ? "All GO and UP rail corridors operating normally"
                : "Normal service on all subway and light rail lines"}
            >
              <div className="current-service-reassurance-badges" aria-hidden="true">
                {clearLines.map(item => (
                  <LineBadge key={item.line.id} lineId={item.line.id} lineNumber={item.line.number} size={20} />
                ))}
              </div>
              <p className="current-service-clear">
                <GoodServiceCheckIcon size={16} />
                <span>
                  {data.networkId === "regional"
                    ? "All GO & UP rail corridors operating normally"
                    : "Normal service on all subway & light rail lines"}
                </span>
              </p>
            </div>
          ) : (
            <>
              {affectedLines.map(item => (
                <div className="current-service-line" key={item.line.id}>
                  <div className="current-service-line-badge-wrap">
                    <LineBadge lineId={item.line.id} lineNumber={item.rows[0].lineNumber} size={24} />
                  </div>
                  <div className="current-service-line-copy">
                    {item.rows.map(row => {
                      const timingLabel = row.timing
                        ? (row.priority === 2 && !row.timing.startsWith("Starts ") && !row.timing.startsWith("Ends ") ? "Starts " : "") + row.timing
                        : null;
                      return (
                        <button type="button" className="current-service-impact current-service-impact--compact" key={`${row.kind}:${row.id}`} onClick={() => onImpact({ kind: row.kind, id: row.id })}>
                          <span className="current-service-impact-heading">
                            <strong data-kind={row.iconKind || row.kind}><ImpactTypeIcon kind={row.iconKind || row.kind} size={16} />{getCanonicalAlertTitle(row)}</strong>
                          </span>
                          {timingLabel && <span className="current-service-impact-timing">{timingLabel}</span>}
                          <span className="current-service-impact-location">{row.location}{row.direction && <span className="current-service-inline-direction"> · {row.direction}</span>}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {closedLines.map(item => (
                <div className="current-service-line current-service-line--closed" key={item.line.id}>
                  <div className="current-service-line-badge-wrap">
                    <LineBadge lineId={item.line.id} lineNumber={item.line.number} size={24} />
                  </div>
                  <div className="current-service-line-copy current-service-line-copy--clear">
                    <p className="current-service-clear">
                      <Info size={16} aria-hidden="true" />
                      <span>Closed</span>
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
          {summary.fresh && !summary.rows.length && !clearLines.length && !closedLines.length && (
            <p className="current-service-clear"><GoodServiceCheckIcon size={14} /><span>No active alerts, delays, or upcoming closures</span></p>
          )}
        </ServiceList>
        {summary.fresh && (affectedLines.length > 0 || closedLines.length > 0) && clearLines.length > 0 && (
          <div
            className="current-service-reassurance"
            aria-label={data.networkId === "regional"
              ? `${clearLines.length} other corridor${clearLines.length === 1 ? "" : "s"} operating normally`
              : `Normal service on Lines ${clearLines.map(item => item.line.number).join(", ")}`}
          >
            <div className="current-service-reassurance-badges" aria-hidden="true">
              {clearLines.map(item => (
                <LineBadge key={item.line.id} lineId={item.line.id} lineNumber={item.line.number} size={18} />
              ))}
            </div>
            <GoodServiceCheckIcon size={14} />
            <span className="current-service-reassurance-text">
              {data.networkId === "regional"
                ? `${clearLines.length} other corridor${clearLines.length === 1 ? "" : "s"} operating normally`
                : "Normal service"}
            </span>
          </div>
        )}
      </section>
      <section aria-label="Surface service notices">
        <h3>
          <BusFront size={13} aria-hidden="true" />
          {data.networkId === "ttc" ? "Streetcar / Bus Alerts" : "Service Notices"}
          {notices?.fresh && now > 0 && (
            <span
              className="current-service-active-count"
              data-count={surfaceRows.length > 0 ? "positive" : "zero"}
              data-single-digit={surfaceRows.length > 3 ? "false" : Math.min(surfaceRows.length, 3) < 10 ? "true" : "false"}
              aria-label={`${Math.min(surfaceRows.length, 3)} notices shown${surfaceRows.length > 3 ? ", more available in all notices" : ""}`}
            >
              {Math.min(surfaceRows.length, 3)}{surfaceRows.length > 3 ? "+" : ""}
            </span>
          )}
        </h3>
        <ServiceList>
          {surfaceRows.slice(0, visibleNoticeCount).map((notice) => <button type="button" className="current-service-notice" key={notice.id} onClick={() => onNotice(notice)}>
            <span className="current-service-routes">{(notice.routeIds.length ? notice.routeIds : [data.networkId === "ttc" ? "TTC" : "GO"]).map((route) => <span className="current-service-route" key={route}>{route}</span>)}</span>
            <span className="current-service-notice-copy">
              <strong data-category={notice.category}>
                <SurfaceCategoryIcon category={notice.category} size={12} className="shrink-0" />
                {noticeLabels[notice.category] || "Notice"}
              </strong>
              <span className="current-service-notice-text">{notice.location || notice.title}</span>
            </span>
          </button>)}
          {!surfaceRows.length && <p className="current-service-empty">{!notices || notices.fresh && now === 0 ? "Loading notices…" : notices.fresh ? "No current notices reported" : "Current notices unavailable"}</p>}
        </ServiceList>
        <button type="button" className="current-service-all" onClick={onNotices}>{surfaceRows.length > visibleNoticeCount ? `${surfaceRows.length - visibleNoticeCount} more · ` : ""}All {data.networkId === "ttc" ? "streetcar and bus notices" : "service notices"}<ArrowRight size={12} aria-hidden="true" /></button>
      </section>
    </div>
  </section>;
}
