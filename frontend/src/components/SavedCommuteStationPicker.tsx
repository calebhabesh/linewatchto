"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
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

function lineTextColor(lineId: string) {
  return lineId === "line-1" ? "#111827" : "#ffffff";
}

function lineById(lineId: string) {
  return STATION_SEARCH_LINES.find((line) => line.id === lineId);
}

function StationLineBadge({ line }: { line: StationSearchLine }) {
  return (
    <span
      className="commute-station-line-badge"
      style={{ backgroundColor: line.color, color: lineTextColor(line.id) }}
      aria-hidden="true"
    >
      {line.number}
    </span>
  );
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
      className={`commute-station-option ${selected ? "selected" : ""}`}
      onClick={() => onChoose(station.id)}
      title={disabled ? `${disabledReason}${accessibilityLabel}` : `${station.name}${accessibilityLabel}`}
    >
      <span className="commute-station-option-name">
        <span>{station.name}</span>
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
  const open = isOpen !== undefined ? isOpen : localOpen;
  const setOpen = onOpenChange !== undefined ? onOpenChange : setLocalOpen;
  const [query, setQuery] = useState("");
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === value) ?? null,
    [stations, value],
  );
  const results = useMemo(() => searchStations(stations, query, 8), [stations, query]);
  const lineGroups = useMemo(() => buildStationLineGroups(stations), [stations]);
  const isExpanded = Boolean(expandedLineId) && !query.trim();

  useEffect(() => {
    if (!open) return;

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 40);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current && !rootRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (!open || !rootRef.current) return;

    const updateCoords = () => {
      const trigger = rootRef.current?.querySelector(".commute-station-trigger");
      if (trigger) {
        const rect = trigger.getBoundingClientRect();
        let left = rect.left + window.scrollX;
        const extraWidth = expandedLineId ? 280 : 0;
        const popWidth = rect.width + extraWidth;
        if (left + popWidth > window.innerWidth + window.scrollX - 16) {
          left = window.innerWidth + window.scrollX - popWidth - 16;
        }
        if (left < 16) left = 16;
        window.setTimeout(() => {
          setCoords({
            top: rect.bottom + window.scrollY,
            left,
            width: popWidth,
          });
        }, 0);
      }
    };

    updateCoords();
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);

    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open, expandedLineId]);

  function chooseStation(stationId: string) {
    if (stationId === blockedStationId) return;
    onChange(stationId);
    setOpen(false);
    setQuery("");
    setExpandedLineId(null);
  }

  function clearSearchOrClose() {
    if (query.trim()) {
      setQuery("");
      return;
    }
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="commute-station-picker" data-open={open ? "true" : "false"}>
      <span className="commute-station-label">{label}</span>
      <button
        type="button"
        className="commute-station-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span>{selectedStation?.name ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open
        ? createPortal(
            <div
              ref={popoverRef}
              id={panelId}
              className="commute-station-popover"
              role="listbox"
              aria-label={`${label} station choices`}
              data-expanded={isExpanded ? "true" : "false"}
              style={
                coords
                  ? {
                      position: "absolute",
                      top: `${coords.top + 6}px`,
                      left: `${coords.left}px`,
                      width: `${coords.width}px`,
                      right: "auto",
                      zIndex: 9999,
                    }
                  : undefined
              }
            >
              <div className="commute-station-search-row">
                <Search size={15} aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="search"
                  role="searchbox"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      clearSearchOrClose();
                    }
                  }}
                  placeholder="Search stations"
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
                    {lineGroups.map((group) => {
                      const expanded = expandedLineId === group.line.id;
                      return (
                        <button
                          key={group.line.id}
                          type="button"
                          className={`commute-station-line-trigger ${expanded ? "active" : ""}`}
                          onClick={() => setExpandedLineId((current) => current === group.line.id ? null : group.line.id)}
                          aria-expanded={expanded}
                        >
                          <span>
                            <StationLineBadge line={group.line} />
                            Line {group.line.number} {group.line.name}
                          </span>
                          <ChevronRight size={15} aria-hidden="true" className="commute-station-line-chevron" />
                        </button>
                      );
                    })}
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
                      <div className="commute-station-stations-column-header">
                        <div className="flex items-center gap-2 mb-3 px-1">
                          {(() => {
                            const line = lineGroups.find((g) => g.line.id === expandedLineId)?.line;
                            if (!line) return null;
                            return (
                              <>
                                <span
                                  className="commute-station-line-badge"
                                  style={{ backgroundColor: line.color, color: lineTextColor(line.id) }}
                                >
                                  {line.number}
                                </span>
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
                  ) : null}
                </div>
              )}
            </div>,
            document.querySelector(".linewatch-shell") || document.body,
          )
        : null}
    </div>
  );
}
