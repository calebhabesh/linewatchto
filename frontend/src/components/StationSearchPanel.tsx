"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MutableRefObject } from "react";
import { AlertTriangle, ChevronRight, Search, X } from "lucide-react";
import {
  buildStationLineGroups,
  searchStations,
  STATION_SEARCH_LINES,
  type StationSearchLine,
} from "../app/station-search";
import {
  type StationSummary,
  isStationWheelchairAccessible,
  isStationElevatorAccessible,
} from "../app/station-data";

type Props = {
  open: boolean;
  stations: StationSummary[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
  onClose: () => void;
  onClosedFocusTarget?: () => void;
  /** Controlled search query — owned by the header input bar */
  query: string;
  onQueryChange: (value: string) => void;
  /** Ref forwarded from the header input so keyboard nav can focus it */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** The panel fills this ref with its keydown handler so the shell can wire it to the header input */
  keyDownHandlerRef?: React.MutableRefObject<((event: React.KeyboardEvent<HTMLInputElement>) => void) | null>;
  isMobile: boolean;
};

const OUTAGE_ICON_SRC = {
  elevator: "/assets/linewatch/outages/elevator.svg",
  escalator: "/assets/linewatch/outages/escalator.svg",
} as const;

function lineTextColor(lineId: string) {
  return lineId === "line-1" ? "#111827" : "#ffffff";
}

function lineById(lineId: string) {
  return STATION_SEARCH_LINES.find((line) => line.id === lineId);
}

function StationLineBadge({ line }: { line: StationSearchLine }) {
  return (
    <span
      className="station-search-line-badge"
      style={{ backgroundColor: line.color, color: lineTextColor(line.id) }}
      aria-label={`Line ${line.number}`}
      title={`Line ${line.number} ${line.name}`}
    >
      {line.number}
    </span>
  );
}

function formatOutageLabel(assetType: "elevator" | "escalator", count: number) {
  const label = assetType === "elevator" ? "Elevator" : "Escalator";
  return `${count} ${label} ${count === 1 ? "Outage" : "Outages"}`;
}

function StationOutageBadge({
  assetType,
  count,
}: {
  assetType: "elevator" | "escalator";
  count: number;
}) {
  const label = formatOutageLabel(assetType, count);

  return (
    <span className="station-search-outage-badge" aria-label={label} title={label}>
      <Image
        src={OUTAGE_ICON_SRC[assetType]}
        alt=""
        width={22}
        height={22}
        aria-hidden="true"
      />
      <span className="station-search-outage-count">{count}</span>
    </span>
  );
}

function StationMetaFlags({ station }: { station: StationSummary }) {
  const outageCounts = station.accessOutageCounts ?? { elevator: 0, escalator: 0 };
  const hasAccessOutages = outageCounts.elevator > 0 || outageCounts.escalator > 0;

  if (!station.hasActiveImpact && !hasAccessOutages) {
    return null;
  }

  return (
    <span className="station-search-flags">
      {station.hasActiveImpact ? (
        <span className="station-search-flag station-search-flag-impact">
          <AlertTriangle size={12} />
          Impact
        </span>
      ) : null}
      {outageCounts.elevator > 0 ? (
        <StationOutageBadge assetType="elevator" count={outageCounts.elevator} />
      ) : null}
      {outageCounts.escalator > 0 ? (
        <StationOutageBadge assetType="escalator" count={outageCounts.escalator} />
      ) : null}
    </span>
  );
}

function StationButton({
  station,
  selected,
  onSelect,
  buttonRef,
  onKeyDown,
}: {
  station: StationSummary;
  selected: boolean;
  onSelect: (stationId: string) => void;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
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
      ref={buttonRef}
      onKeyDown={onKeyDown}
      type="button"
      className={`station-search-station ${selected ? "selected" : ""}`}
      onClick={() => onSelect(station.id)}
      aria-current={selected ? "true" : undefined}
      aria-label={`${station.name} station search result${accessibilityLabel}`}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="station-search-station-name !inline-block">{station.name}</span>
          {isWheelchair && (
            <span className="inline-flex items-center justify-center shrink-0" title="Wheelchair accessible">
              <Image
                src="/assets/linewatch/wheel-chair-symbol.svg"
                alt="Wheelchair accessible"
                width={14}
                height={14}
                className="rounded-[2px] drop-shadow-[0_0_1px_rgba(0,103,167,0.4)] dark:drop-shadow-[0_0_1.5px_rgba(0,103,167,0.6)]"
              />
            </span>
          )}
          {hasElevator && (
            <span className="inline-flex items-center justify-center shrink-0" title="Elevator available">
              <Image
                src="/assets/linewatch/elevator-icon.svg"
                alt="Elevator available"
                width={14}
                height={14}
                className="drop-shadow-[0_0_1px_rgba(0,130,201,0.4)] dark:drop-shadow-[0_0_1.5px_rgba(0,130,201,0.6)]"
              />
            </span>
          )}
        </span>
        <StationMetaFlags station={station} />
      </span>
      <span className="station-search-line-badges" aria-hidden="true">
        {lines.map((line) => (
          <StationLineBadge key={line.id} line={line} />
        ))}
      </span>
    </button>
  );
}

export function StationSearchPanel({
  open,
  stations,
  selectedStationId,
  onSelectStation,
  onClose,
  onClosedFocusTarget,
  query,
  onQueryChange,
  inputRef,
  keyDownHandlerRef,
  isMobile,
}: Props) {
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const results = useMemo(() => searchStations(stations, query), [query, stations]);
  const lineGroups = useMemo(() => buildStationLineGroups(stations), [stations]);
  const isExpanded = Boolean(expandedLineId) && !query.trim();
  const stationsColumnRef = useRef<HTMLDivElement>(null);

  const resultButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lineTriggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stationButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const handleResize = () => {
      setViewportHeight(visualViewport.height);
    };

    if (open) {
      visualViewport.addEventListener("resize", handleResize);
      visualViewport.addEventListener("scroll", handleResize);
      handleResize();
    } else {
      window.setTimeout(() => {
        setViewportHeight(null);
      }, 0);
    }

    return () => {
      visualViewport.removeEventListener("resize", handleResize);
      visualViewport.removeEventListener("scroll", handleResize);
    };
  }, [open]);

  useEffect(() => {
    if (stationsColumnRef.current) {
      stationsColumnRef.current.scrollTop = 0;
    }
  }, [expandedLineId]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedLineId(null);
      setIsInputFocused(false);
      return;
    }

    if (isMobile) {
      return; // Do not auto-focus on mobile to prevent automatic keyboard popup
    }

    const targetInput = inputRef.current;
    const focusTimer = window.setTimeout(() => targetInput?.focus(), 60);
    return () => window.clearTimeout(focusTimer);
    // inputRef is a stable ref object – excluding from deps is intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMobile]);

  function chooseStation(stationId: string) {
    onSelectStation(stationId);
    onClose();
    onClosedFocusTarget?.();
  }

  function focusItem(refs: MutableRefObject<Array<HTMLButtonElement | null>>, index: number) {
    const buttons = refs.current.filter((button): button is HTMLButtonElement => Boolean(button));
    if (buttons.length === 0) return;
    buttons[((index % buttons.length) + buttons.length) % buttons.length]?.focus();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query.trim()) {
        onQueryChange("");
      } else {
        onClose();
        onClosedFocusTarget?.();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (query.trim()) {
        focusItem(resultButtonRefs, 0);
      } else {
        focusItem(lineTriggerRefs, 0);
      }
      return;
    }

    if (event.key === "Enter" && query.trim() && results[0]) {
      event.preventDefault();
      chooseStation(results[0].station.id);
    }
  }

  // Register the keydown handler with the shell so the header input can call it
  useEffect(() => {
    if (keyDownHandlerRef) {
      keyDownHandlerRef.current = handleInputKeyDown;
    }
  });


  const activeLineGroup = useMemo(() => {
    return lineGroups.find((group) => group.line.id === expandedLineId) || lineGroups[0];
  }, [lineGroups, expandedLineId]);

  function handleResultKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      onClosedFocusTarget?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(resultButtonRefs, index + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        inputRef.current?.focus();
      } else {
        focusItem(resultButtonRefs, index - 1);
      }
    }
  }

  function handleLineTriggerKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      onClosedFocusTarget?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(lineTriggerRefs, index + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        inputRef.current?.focus();
      } else {
        focusItem(lineTriggerRefs, index - 1);
      }
      return;
    }
    if (event.key === "ArrowRight" && !expandedLineId) {
      event.preventDefault();
      setExpandedLineId(lineGroups[index]?.line.id ?? null);
      window.setTimeout(() => focusItem(stationButtonRefs, 0), 0);
    }
  }

  function handleStationButtonKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      onClosedFocusTarget?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(stationButtonRefs, index + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        focusItem(lineTriggerRefs, Math.max(0, lineGroups.findIndex((group) => group.line.id === activeLineGroup?.line.id)));
      } else {
        focusItem(stationButtonRefs, index - 1);
      }
    }
  }

  return (
    <section
      id="station-search-panel"
      className={`station-search-panel panel-strong ${open ? "open" : ""}`}
      aria-label="Station search"
      aria-hidden={!open}
      inert={!open ? true : undefined}
      data-station-search-panel
      data-open={open ? "true" : "false"}
      data-expanded={isExpanded ? "true" : "false"}
      data-searching={query.trim() ? "true" : "false"}
      data-input-focused={isInputFocused ? "true" : "false"}
      style={
        viewportHeight
          ? ({ "--visual-viewport-height": `${viewportHeight}px` } as React.CSSProperties)
          : undefined
      }
    >
      {isMobile && (
        <div className="station-search-input-row">
          <Search size={18} className="station-search-input-icon" aria-hidden="true" />
          <input
            ref={mobileInputRef}
            type="search"
            role="searchbox"
            aria-label="Station Search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            placeholder="Station Search..."
            className="station-search-input"
          />
          <button
            type="button"
            className="station-search-clear"
            onClick={() => {
              if (query) {
                onQueryChange("");
              } else {
                onClose();
                onClosedFocusTarget?.();
              }
            }}
            aria-label={query ? "Clear station search" : "Close station search"}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="station-search-content">
        {query.trim() ? (
          <div className="station-search-results" aria-label="Station search results">
            {results.length > 0 ? (
              results.map((result, index) => (
                <StationButton
                   key={result.station.id}
                   station={result.station}
                   selected={selectedStationId === result.station.id}
                   onSelect={chooseStation}
                   buttonRef={(element) => { resultButtonRefs.current[index] = element; }}
                   onKeyDown={(event) => handleResultKeyDown(index, event)}
                />
              ))
            ) : (
              <div className="station-search-empty" role="status">
                No mapped station matches.
              </div>
            )}
          </div>
        ) : (
          <div className="station-search-browse-container" aria-label="Browse stations by line">
            <div className="station-search-lines-column">
              {lineGroups.map((group, index) => {
                const expanded = expandedLineId === group.line.id;

                return (
                  <div
                    key={group.line.id}
                    className={`station-search-line-group ${expanded ? "expanded" : ""}`}
                  >
                    <button
                      ref={(element) => { lineTriggerRefs.current[index] = element; }}
                      onKeyDown={(event) => handleLineTriggerKeyDown(index, event)}
                      type="button"
                      className={`station-search-line-trigger ${expanded ? "active" : ""}`}
                      onClick={() => setExpandedLineId((current) => current === group.line.id ? null : group.line.id)}
                      aria-expanded={expanded}
                      aria-controls="station-search-stations-column"
                    >
                      <div className="flex items-center gap-2">
                        <Image src={group.line.icon} alt="" width={34} height={34} aria-hidden="true" />
                        <span className="station-search-line-copy">
                          <span className="station-search-line-title">Line {group.line.number}</span>
                          <span className="station-search-line-name">{group.line.name}</span>
                        </span>
                      </div>
                      <span className="station-search-line-action">
                        <span className="station-search-line-action-text">List View</span>
                        <ChevronRight size={17} className="station-search-line-chevron" aria-hidden="true" />
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div
              ref={stationsColumnRef}
              id="station-search-stations-column"
              className="station-search-stations-column"
              role="region"
              aria-label={activeLineGroup ? `${activeLineGroup.line.name} stations` : "Transit stations"}
              aria-hidden={!isExpanded}
            >
              {activeLineGroup && (
                <>
                  {expandedLineId ? (
                    <button
                      type="button"
                      className="station-search-mobile-back"
                      onClick={() => setExpandedLineId(null)}
                    >
                      Back to Lines
                    </button>
                  ) : null}
                  <div className="station-search-stations-column-header">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span
                        className="station-search-line-badge"
                        style={{ backgroundColor: activeLineGroup.line.color, color: lineTextColor(activeLineGroup.line.id) }}
                      >
                        {activeLineGroup.line.number}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {activeLineGroup.line.name} Stations
                      </span>
                    </div>
                  </div>
                  <div className="station-search-stations-list">
                    {activeLineGroup.stations.map((station, index) => (
                      <StationButton
                        key={`${activeLineGroup.line.id}-${station.id}`}
                        station={station}
                        selected={selectedStationId === station.id}
                        onSelect={chooseStation}
                        buttonRef={(element) => { stationButtonRefs.current[index] = element; }}
                        onKeyDown={(event) => handleStationButtonKeyDown(index, event)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
