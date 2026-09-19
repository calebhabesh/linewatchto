"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BusFront, Info, TrainFront } from "lucide-react";
import type { DashboardData } from "../app/DataContext";
import type { ImpactSelection } from "../app/linewatch-data";
import type { SurfaceNoticeResponse, SurfaceNoticeDetail } from "../app/surface-notice-data";
import {
  currentServiceSummary,
  currentSurfaceNotices,
  getCanonicalAlertTitle,
  getLineStatusPresentation,
  getPlannedClosureCountBadgeLabel,
} from "../app/current-service";
import { DESKTOP_SERVICE_SHEET_STORAGE_KEY, parseDesktopServiceSheetPosition } from "../app/desktop-service-sheet-state";
import { LineBadge } from "./ImpactCardFields";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { SurfaceCategoryIcon } from "./SurfaceCategoryIcon";
import { goNoticeRouteBadgeStyle, goNoticeRouteLabel } from "../app/go-bus-route-colors";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import { surfaceNoticePreviewLocation } from "../app/surface-notice-groups";


type Props = {
  overlapSelectors?: string;
  data: DashboardData;
  notices: SurfaceNoticeResponse | null;
  onNotice: (notice: SurfaceNoticeDetail) => void;
  onImpact: (selection: NonNullable<ImpactSelection>) => void;
  onStatus: () => void;
  onCategory: (view: "closures" | "reduced-speed-zones", lineId?: string) => void;
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

export function GoodServiceCheckIcon({ size = 16 }: { size?: number }) {
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

function desktopContentHeight(panel: HTMLElement): number {
  let height = COLLAPSED_LIST_HEIGHT;
  panel.querySelectorAll<HTMLElement>(".current-service-list").forEach(list => {
    // A fixed height inflates scrollHeight. Measure natural overflow with no height floor.
    const previousTransition = list.style.transition;
    list.style.transition = "none";
    const previousHeight = list.style.height;
    const previousMax = list.style.maxHeight;
    list.style.height = "0px";
    list.style.maxHeight = "none";
    height = Math.max(height, list.scrollHeight);
    list.style.height = previousHeight;
    list.style.maxHeight = previousMax;
    void list.offsetHeight;
    list.style.transition = previousTransition;
  });
  return Math.max(COLLAPSED_LIST_HEIGHT, Math.min(height, window.innerHeight - 200));
}

export function CurrentServicePanel({ data, notices, onNotice, onImpact, onStatus, onCategory, onNotices, overlapSelectors = "" }: Props) {
  const [now, setNow] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [positionReady, setPositionReady] = useState(false);
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

  useLayoutEffect(() => {
    const panel = sectionRef.current;
    const shell = panel?.closest(".linewatch-shell");
    if (!panel || !shell || !overlapSelectors) return;
    const obstacles = [...shell.querySelectorAll<HTMLElement>(overlapSelectors)];
    const measure = () => {
      const a = panel.getBoundingClientRect();
      const overlaps = obstacles.some((obstacle) => {
        const b = obstacle.getBoundingClientRect();
        return b.width > 0 && b.height > 0
          && a.left < b.right && a.right > b.left
          && a.top < b.bottom && a.bottom > b.top;
      });
      panel.style.visibility = overlaps ? "hidden" : "";
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    obstacles.forEach((obstacle) => observer.observe(obstacle));
    window.addEventListener("resize", measure);
    shell.addEventListener("transitionend", measure);
    shell.addEventListener("animationend", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      shell.removeEventListener("transitionend", measure);
      shell.removeEventListener("animationend", measure);
      panel.style.visibility = "";
    };
  }, [overlapSelectors]);

  useLayoutEffect(() => {
    if (!sectionRef.current?.closest(".desktop-status-chip-row-container")) return;
    let revealFrame = 0;
    const frame = requestAnimationFrame(() => {
      try {
        const saved = parseDesktopServiceSheetPosition(window.localStorage.getItem(DESKTOP_SERVICE_SHEET_STORAGE_KEY));
        if (saved) {
          setIsExpanded(saved.expanded);
          const height = Math.max(COLLAPSED_LIST_HEIGHT,
            Math.min(saved.height ?? (saved.expanded ? 460 : COLLAPSED_LIST_HEIGHT), window.innerHeight - 200));
          sectionRef.current?.style.setProperty("--custom-sheet-height", `${height}px`);
        }
      } catch {
        // Storage may be unavailable in private browsing.
      }
      // Let the restored geometry commit without height transitions before revealing it.
      revealFrame = requestAnimationFrame(() => {
        const panel = sectionRef.current;
        if (panel) {
          const requested = parseFloat(panel.style.getPropertyValue("--custom-sheet-height")) || COLLAPSED_LIST_HEIGHT;
          panel.style.setProperty("--custom-sheet-height", `${Math.min(requested, desktopContentHeight(panel))}px`);
        }
        setPositionReady(true);
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(revealFrame); };
  }, []);

  const savePosition = (expanded: boolean, height: number | null = null) => {
    if (!sectionRef.current?.closest(".desktop-status-chip-row-container")) return;
    try {
      window.localStorage.setItem(DESKTOP_SERVICE_SHEET_STORAGE_KEY, JSON.stringify({ expanded, height }));
    } catch {
      // Keep the sheet usable when storage is blocked or full.
    }
  };

  useLayoutEffect(() => {
    const panel = sectionRef.current;
    if (!panel?.closest(".desktop-status-chip-row-container") || !positionReady) return;
    const clamp = () => {
      const max = desktopContentHeight(panel);
      const requested = parseFloat(panel.style.getPropertyValue("--custom-sheet-height"))
        || (isExpanded ? 460 : COLLAPSED_LIST_HEIGHT);
      if (requested > max) panel.style.setProperty("--custom-sheet-height", `${max}px`);
    };
    clamp();
    const observer = new MutationObserver(clamp);
    observer.observe(panel, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", clamp);
    return () => { observer.disconnect(); window.removeEventListener("resize", clamp); };
  }, [positionReady, isExpanded]);

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
        const maxH = sectionRef.current ? desktopContentHeight(sectionRef.current) : COLLAPSED_LIST_HEIGHT;
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
        const h = currentHeightRef.current;
        const expanded = h > COLLAPSED_LIST_HEIGHT;
        setIsExpanded(expanded);
        savePosition(expanded, h);

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
    savePosition(!isExpanded);
    setIsExpanded(!isExpanded);
  };

  const summary = currentServiceSummary(data, now);
  const affectedLines = data.lineStatuses
    .map((line) => {
      const rows = summary.rows.filter((row) => row.lineId === line.id);
      const closureCount = (summary.upcoming ?? []).filter((c) => c.lineId === line.id).length;
      const rszCount = countReducedSpeedZones(
        (data.reducedSpeedZones ?? []).filter((rsz) => rsz.lineId === line.id),
      );
      return {
        line,
        rows,
        closureCount,
        rszCount,
      };
    })
    .filter((item) => item.rows.length > 0);
  const remainingLines = data.lineStatuses
    .filter((line) => !affectedLines.some((item) => item.line.id === line.id))
    .map((line) => ({
      line,
      presentation: getLineStatusPresentation(line, data, summary),
      closureCount: (summary.upcoming ?? []).filter((c) => c.lineId === line.id).length,
    }));
  const activeCount = summary.rows.length;
  const surfaceRows = notices?.fresh && now > 0
    ? currentSurfaceNotices(notices.notices, now, data.networkId === "ttc")
    : [];
  const visibleNoticeCount = Math.min(surfaceRows.length, 3);

  return <section
    ref={sectionRef}
    className="current-service"
    aria-label="Current Service"
    data-expanded={isExpanded ? "true" : "false"}
    data-position-ready={positionReady ? "true" : "false"}
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
          {affectedLines.map((item) => (
            <div className="current-service-line" key={item.line.id}>
              <div className="current-service-line-badge-wrap">
                <LineBadge lineId={item.line.id} lineNumber={item.rows[0].lineNumber} size={28} />
              </div>
              <div className="current-service-line-copy">
                <div className="current-service-line-copy-main" data-has-impacts="true">
                  {item.rows.map((row) => {
                    const timingLabel = row.timing
                      ? (row.priority === 2 && !row.timing.startsWith("Starts ") && !row.timing.startsWith("Ends ") ? "Starts " : "") + row.timing
                      : null;
                    return (
                      <button
                        type="button"
                        className="current-service-impact current-service-impact--compact"
                        data-impact-kind={row.iconKind || row.kind}
                        key={`${row.kind}:${row.id}`}
                        onClick={() => onImpact({ kind: row.kind, id: row.id })}
                      >
                        <span className="current-service-impact-heading">
                          <strong data-kind={row.iconKind || row.kind}>
                            <ImpactTypeIcon kind={row.iconKind || row.kind} size={16} />
                            {getCanonicalAlertTitle(row)}
                          </strong>
                        </span>
                        <span className="current-service-impact-location">{row.condition} · {row.location}</span>
                        {row.direction && <span className="current-service-impact-direction">{row.direction}</span>}
                        {timingLabel && <span className="current-service-impact-timing">{timingLabel}</span>}
                      </button>
                    );
                  })}
                </div>
                {(item.closureCount > 0 || item.rszCount > 0) && (
                  <div className="current-service-sub-badges">
                    {item.closureCount > 0 && (
                      <button
                        type="button"
                        className="current-service-badge-incident-button"
                        onClick={() => onCategory("closures", item.line.id)}
                        title={`View ${item.line.name} Planned Closures`}
                        aria-label={`${item.line.name}: ${getPlannedClosureCountBadgeLabel(item.closureCount)}`}
                      >
                        <span className="current-service-planned-pill">
                          <ImpactTypeIcon kind="planned-closure" size={11} />
                          <span>{getPlannedClosureCountBadgeLabel(item.closureCount)}</span>
                        </span>
                      </button>
                    )}
                    {item.rszCount > 0 && (
                      <button
                        type="button"
                        className="current-service-badge-incident-button"
                        onClick={() => onCategory("reduced-speed-zones", item.line.id)}
                        title={`View ${item.line.name} Reduced Speed Zones`}
                        aria-label={`${item.line.name}: ${item.rszCount > 1 ? `${item.rszCount} Reduced Speed Zones` : "Reduced Speed Zones"}`}
                      >
                        <span className="current-service-rsz-pill">
                          <ImpactTypeIcon kind="reduced-speed-zone" size={11} />
                          <span>
                            {item.rszCount > 1
                              ? `${item.rszCount} Reduced Speed Zones`
                              : "Reduced Speed Zones"}
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {remainingLines.map(({ line, presentation, closureCount }) => (
            <div className={`current-service-line current-service-line--${presentation.state}`} key={line.id}>
              <div className="current-service-line-badge-wrap">
                <LineBadge lineId={line.id} lineNumber={line.number} size={28} />
              </div>
              <div className="current-service-line-copy">
                <button
                  type="button"
                  className="current-service-clear-btn w-full text-left"
                  onClick={onStatus}
                  aria-label={`${line.name}: ${presentation.label}`}
                >
                  <div className="current-service-line-copy-main">
                    {presentation.isNormal ? (
                      <span className="current-service-normal-label">
                        <GoodServiceCheckIcon size={16} />
                        <strong>{presentation.label}</strong>
                      </span>
                    ) : presentation.state === "closed" ? (
                      <span className="desktop-status-remaining-status desktop-status-remaining-status--closed">
                        <Info size={16} aria-hidden="true" />
                        <strong>{presentation.label}</strong>
                      </span>
                    ) : (
                      <span className="desktop-status-remaining-status desktop-status-remaining-status--info">
                        <Info size={16} aria-hidden="true" />
                        <span>{presentation.label}</span>
                      </span>
                    )}
                  </div>
                </button>
                {(closureCount > 0 || presentation.hasRsz) && (
                  <div className="current-service-sub-badges">
                    {closureCount > 0 && (
                      <button
                        type="button"
                        className="current-service-badge-incident-button"
                        onClick={() => onCategory("closures", line.id)}
                        title={`View ${line.name} Planned Closures`}
                        aria-label={`${line.name}: ${getPlannedClosureCountBadgeLabel(closureCount)}`}
                      >
                        <span className="current-service-planned-pill">
                          <ImpactTypeIcon kind="planned-closure" size={11} />
                          <span>{getPlannedClosureCountBadgeLabel(closureCount)}</span>
                        </span>
                      </button>
                    )}
                    {presentation.hasRsz && (
                      <button
                        type="button"
                        className="current-service-badge-incident-button"
                        onClick={() => onCategory("reduced-speed-zones", line.id)}
                        title={`View ${line.name} Reduced Speed Zones`}
                        aria-label={`${line.name}: ${presentation.rszCount && presentation.rszCount > 1 ? `${presentation.rszCount} Reduced Speed Zones` : "Reduced Speed Zones"}`}
                      >
                        <span className="current-service-rsz-pill">
                          <ImpactTypeIcon kind="reduced-speed-zone" size={11} />
                          <span>
                            {presentation.rszCount && presentation.rszCount > 1
                              ? `${presentation.rszCount} Reduced Speed Zones`
                              : "Reduced Speed Zones"}
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {!affectedLines.length && !remainingLines.length && (
            <p className="current-service-clear">
              <GoodServiceCheckIcon size={14} />
              <span>No active alerts, delays, or upcoming closures</span>
            </p>
          )}
        </ServiceList>
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
            {notice.routeIds.length ? <span className="current-service-routes">
              {notice.routeIds.map((route) => (
                <span
                  className="current-service-route"
                  key={route}
                  style={data.networkId === "regional" ? goNoticeRouteBadgeStyle(route) : undefined}
                  aria-label={data.networkId === "regional" ? goNoticeRouteLabel(route) : undefined}
                >
                  {route}
                </span>
              ))}
            </span> : null}
            <span className="current-service-notice-copy" data-category={notice.category}>
              <strong data-category={notice.category}>
                <SurfaceCategoryIcon category={notice.category} size={12} className="shrink-0" />
                {noticeLabels[notice.category] || "Notice"}
              </strong>
              <span className="current-service-notice-text">{surfaceNoticePreviewLocation(notice, data.networkId === "ttc")}</span>
            </span>
          </button>)}
          {!surfaceRows.length && <p className="current-service-empty">{!notices || notices.fresh && now === 0 ? "Loading notices…" : notices.fresh ? "No current notices reported" : "Current notices unavailable"}</p>}
        </ServiceList>
        <button type="button" className="current-service-all" onClick={onNotices}>{surfaceRows.length > visibleNoticeCount ? `${surfaceRows.length - visibleNoticeCount} more · ` : ""}All {data.networkId === "ttc" ? "streetcar and bus notices" : "service notices"}<ArrowRight size={12} aria-hidden="true" /></button>
      </section>
    </div>
  </section>;
}
