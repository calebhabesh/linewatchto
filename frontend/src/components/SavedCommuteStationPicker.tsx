"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import {
  buildStationLineGroups,
  searchStations,
  stationSearchLineById,
  type StationSearchLine,
} from "../app/station-search";
import {
  type StationSummary,
  isStationWheelchairAccessible,
  isStationElevatorAccessible,
} from "../app/station-data";
import {
  calculateMobilePickerAlignmentScroll,
  calculateCommuteStationPopoverCoords,
  isVisualKeyboardOpen,
  type CommuteStationPopoverCoords,
} from "./commute-station-popover";
import { TransitLineBadge } from "./TransitLineBadge";

type Props = {
  label: string;
  placeholder: string;
  value: string;
  stations: StationSummary[];
  blockedStationId?: string;
  blockedLabel?: string;
  onChange: (stationId: string) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function lineById(lineId: string) {
  return stationSearchLineById(lineId);
}

function StationLineBadge({ line }: { line: StationSearchLine }) {
  return <TransitLineBadge lineId={line.id} lineNumber={line.number} lineName={line.name} size={20} decorative />;
}

function StationOption({
  station,
  selected,
  disabled,
  disabledReason,
  onChoose,
}: {
  station: StationSummary;
  selected: boolean;
  disabled: boolean;
  disabledReason: string;
  onChoose: (stationId: string) => void;
}) {
  const lines = station.lineIds
    .map((lineId) => lineById(lineId))
    .filter((line): line is StationSearchLine => Boolean(line));

  const isWheelchair = isStationWheelchairAccessible(station.id, station.lineIds);
  const hasElevator = isStationElevatorAccessible(station.id, station.lineIds);

  let accessibilityLabel = "";
  if (isWheelchair) accessibilityLabel += " (Wheelchair Accessible)";
  if (hasElevator) accessibilityLabel += " (Elevator Access)";

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      className={`site-dropdown-option commute-station-option ${selected ? "selected" : ""}`}
      onClick={() => onChoose(station.id)}
      title={disabled ? `${disabledReason}${accessibilityLabel}` : `${station.name}${accessibilityLabel}`}
    >
      <span className="commute-station-option-name">
        <span className="commute-station-name-text">{station.name}</span>
        {isWheelchair && (
          <span className="inline-flex items-center justify-center shrink-0" title="Wheelchair accessible">
            <Image
              src="/assets/linewatch/wheel-chair-symbol.svg"
              alt="Wheelchair accessible"
              width={12}
              height={12}
              className="rounded-[1.5px] drop-shadow-[0_0_1px_rgba(0,103,167,0.3)]"
            />
          </span>
        )}
        {hasElevator && (
          <span className="inline-flex items-center justify-center shrink-0" title="Elevator available">
            <Image
              src="/assets/linewatch/elevator-icon.svg"
              alt="Elevator available"
              width={12}
              height={12}
              className="drop-shadow-[0_0_1px_rgba(0,130,201,0.3)]"
            />
          </span>
        )}
      </span>
      <span className="commute-station-line-badges">
        {lines.map((line) => (
          <StationLineBadge key={line.id} line={line} />
        ))}
      </span>
    </button>
  );
}

export function SavedCommuteStationPicker({
  label,
  placeholder,
  value,
  stations,
  blockedStationId,
  blockedLabel = "Already selected",
  onChange,
  isOpen,
  onOpenChange,
}: Props) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const [mobileInline, setMobileInline] = useState(false);
  const open = isOpen !== undefined ? isOpen : localOpen;
  const setOpen = onOpenChange !== undefined ? onOpenChange : setLocalOpen;
  const [query, setQuery] = useState("");
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [coords, setCoords] = useState<CommuteStationPopoverCoords | null>(null);

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === value) ?? null,
    [stations, value],
  );
  const results = useMemo(() => searchStations(stations, query, 8), [stations, query]);
  const lineGroups = useMemo(() => buildStationLineGroups(stations), [stations]);
  const isExpanded = Boolean(expandedLineId) && !query.trim();

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobileInline(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;

    const mobileViewport = window.matchMedia("(max-width: 767px)").matches;
    const focusTimer = mobileViewport
      ? null
      : window.setTimeout(() => inputRef.current?.focus(), 40);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest(".panel-heading")) {
        return;
      }
      if (
        rootRef.current && !rootRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (!open || !rootRef.current) {
      setCoords(null);
      return;
    }

    const updateCoords = () => {
      const trigger = rootRef.current?.querySelector(".commute-station-trigger");
      if (trigger) {
        const rect = trigger.getBoundingClientRect();
        const visualViewport = window.visualViewport;
        const viewport = {
          left: visualViewport?.offsetLeft ?? 0,
          top: visualViewport?.offsetTop ?? 0,
          width: visualViewport?.width ?? window.innerWidth,
          height: visualViewport?.height ?? window.innerHeight,
        };
        const mobileViewport = window.matchMedia("(max-width: 767px)").matches;
        const scrollContainer = rootRef.current?.closest(".floating-panel-scroll");
        const containerRect = scrollContainer ? scrollContainer.getBoundingClientRect() : null;
        const mobileSearchActive = mobileViewport && (
          inputFocused || isVisualKeyboardOpen(viewport, window.innerHeight)
        );

        setCoords(calculateCommuteStationPopoverCoords({
          trigger: rect,
          viewport,
          container: containerRect,
          mobile: mobileViewport,
          expanded: Boolean(expandedLineId),
          mobileSearchActive,
        }));
      }
    };

    updateCoords();
    const visualViewport = window.visualViewport;
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    visualViewport?.addEventListener("resize", updateCoords);
    visualViewport?.addEventListener("scroll", updateCoords);

    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
      visualViewport?.removeEventListener("resize", updateCoords);
      visualViewport?.removeEventListener("scroll", updateCoords);
    };
  }, [open, expandedLineId, inputFocused]);

  useEffect(() => {
    if (!open || !inputFocused || !mobileInline) return;

    let alignmentFrame: number | null = null;
    const alignPickerToScrollTop = () => {
      const picker = rootRef.current;
      const scrollArea = picker?.closest<HTMLElement>(".commute-grid");
      if (!picker || !scrollArea) return;

      const scrollBy = calculateMobilePickerAlignmentScroll(
        picker.getBoundingClientRect().top,
        scrollArea.getBoundingClientRect().top,
      );
      if (Math.abs(scrollBy) > 1) {
        const targetScrollTop = Math.max(0, scrollArea.scrollTop + scrollBy);
        scrollArea.scrollTop = targetScrollTop;
      }
    };
    const scheduleAlignment = () => {
      if (alignmentFrame !== null) window.cancelAnimationFrame(alignmentFrame);
      alignmentFrame = window.requestAnimationFrame(alignPickerToScrollTop);
    };

    scheduleAlignment();
    const earlyAlignmentTimer = window.setTimeout(alignPickerToScrollTop, 80);
    const settledAlignmentTimer = window.setTimeout(alignPickerToScrollTop, 240);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", scheduleAlignment);

    return () => {
      if (alignmentFrame !== null) window.cancelAnimationFrame(alignmentFrame);
      window.clearTimeout(earlyAlignmentTimer);
      window.clearTimeout(settledAlignmentTimer);
      visualViewport?.removeEventListener("resize", scheduleAlignment);
    };
  }, [open, inputFocused, mobileInline]);

  function chooseStation(stationId: string) {
    if (stationId === blockedStationId) return;
    onChange(stationId);
    setOpen(false);
    setQuery("");
    setExpandedLineId(null);
    setInputFocused(false);
  }

  function clearSearchOrClose() {
    if (query.trim()) {
      setQuery("");
      return;
    }
    setOpen(false);
  }

  function mountPopover(popover: ReactNode) {
    if (mobileInline) return popover;
    return createPortal(popover, document.querySelector(".linewatch-shell") || document.body);
  }

  return (
    <div ref={rootRef} className="commute-station-picker" data-open={open ? "true" : "false"}>
      <span className="commute-station-label">{label}</span>
      <button
        type="button"
        className="site-dropdown-trigger commute-station-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span>{selectedStation?.name ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open
        ? mountPopover(
            <div
              ref={popoverRef}
              id={panelId}
              className="site-dropdown-menu commute-station-popover"
              role="listbox"
              aria-label={`${label} station choices`}
              data-expanded={isExpanded ? "true" : "false"}
              data-searching={query.trim() ? "true" : "false"}
              data-input-focused={inputFocused ? "true" : "false"}
              data-mobile-inline={mobileInline ? "true" : "false"}
              data-placement={coords?.placement ?? "below"}
              style={coords
                ? mobileInline
                  ? {
                      maxHeight: `${coords.maxHeight}px`,
                      zIndex: 9999,
                    }
                  : {
                      position: "fixed",
                      top: coords.top !== undefined ? `${coords.top}px` : "auto",
                      bottom: coords.bottom !== undefined ? `${coords.bottom}px` : "auto",
                      left: `${coords.left}px`,
                      width: `${coords.width}px`,
                      maxHeight: `${coords.maxHeight}px`,
                      right: "auto",
                      zIndex: 9999,
                    }
                : undefined}
            >
              <div className="commute-station-search-row">
                <Search size={15} aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="search"
                  role="searchbox"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      clearSearchOrClose();
                    }
                  }}
                  placeholder="Station Search..."
                  className="submenu-search-input"
                  aria-label={`Search ${label.toLowerCase()} stations`}
                />
                <button type="button" onClick={clearSearchOrClose} aria-label={query ? "Clear station search" : "Close station choices"}>
                  <X size={15} />
                </button>
              </div>

              {query.trim() ? (
                <div className="commute-station-options">
                  {results.length > 0 ? (
                    results.map((result) => (
                      <StationOption
                        key={result.station.id}
                        station={result.station}
                        selected={result.station.id === value}
                        disabled={result.station.id === blockedStationId}
                        disabledReason={blockedLabel}
                        onChoose={chooseStation}
                      />
                    ))
                  ) : (
                    <p className="commute-station-empty">No mapped station matches.</p>
                  )}
                </div>
              ) : (
                <div className="commute-station-browse-container">
                  <div className="commute-station-lines-column">
                    <div className="commute-station-lines-list">
                      {lineGroups.map((group) => {
                        const expanded = expandedLineId === group.line.id;
                        return (
                          <button
                            key={group.line.id}
                            type="button"
                            className={`site-dropdown-option commute-station-line-trigger ${expanded ? "selected active" : ""}`}
                            onClick={() => setExpandedLineId((current) => current === group.line.id ? null : group.line.id)}
                            aria-expanded={expanded}
                          >
                            <span>
                              <StationLineBadge line={group.line} />
                              {group.line.id.startsWith("regional-")
                                ? `${group.line.number} ${group.line.name}`
                                : `Line ${group.line.number} ${group.line.name}`}
                            </span>
                            <ChevronRight size={15} aria-hidden="true" className="commute-station-line-chevron" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {expandedLineId ? (
                    <div className="commute-station-stations-column">
                      <button
                        type="button"
                        className="commute-station-mobile-back"
                        onClick={() => setExpandedLineId(null)}
                      >
                        Back to Lines
                      </button>
                      <div className="commute-station-stations-scroll">
                        <div className="commute-station-stations-scroll-content">
                          <div className="commute-station-stations-column-header">
                            <div className="flex items-center gap-2 mb-0 pl-0 pr-1">
                              {(() => {
                                const line = lineGroups.find((g) => g.line.id === expandedLineId)?.line;
                                if (!line) return null;
                                return (
                                  <>
                                    <TransitLineBadge lineId={line.id} lineNumber={line.number} lineName={line.name} size={20} decorative />
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                      {line.name} Stations
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="commute-station-options">
                            {lineGroups
                              .find((group) => group.line.id === expandedLineId)
                              ?.stations.map((station) => (
                                <StationOption
                                  key={`${expandedLineId}-${station.id}`}
                                  station={station}
                                  selected={station.id === value}
                                  disabled={station.id === blockedStationId}
                                  disabledReason={blockedLabel}
                                  onChoose={chooseStation}
                                />
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>,
          )
        : null}
    </div>
  );
}
