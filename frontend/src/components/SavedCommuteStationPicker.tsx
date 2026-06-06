"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import {
  buildStationLineGroups,
  searchStations,
  STATION_SEARCH_LINES,
  type StationSearchLine,
} from "../app/station-search";
import type { StationSummary } from "../app/station-data";

type Props = {
  label: string;
  placeholder: string;
  value: string;
  stations: StationSummary[];
  blockedStationId?: string;
  blockedLabel?: string;
  onChange: (stationId: string) => void;
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

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      className={`commute-station-option ${selected ? "selected" : ""}`}
      onClick={() => onChoose(station.id)}
      title={disabled ? disabledReason : station.name}
    >
      <span className="commute-station-option-name">{station.name}</span>
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
}: Props) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === value) ?? null,
    [stations, value],
  );
  const results = useMemo(() => searchStations(stations, query, 8), [stations, query]);
  const lineGroups = useMemo(() => buildStationLineGroups(stations), [stations]);

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
  }, [open]);

  useEffect(() => {
    if (!open || !rootRef.current) return;

    const updateCoords = () => {
      const trigger = rootRef.current?.querySelector(".commute-station-trigger");
      if (trigger) {
        const rect = trigger.getBoundingClientRect();
        setCoords({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
    };

    updateCoords();
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);

    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open]);

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
        onClick={() => setOpen((current) => !current)}
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
                <div className="commute-station-lines">
                  {lineGroups.map((group) => {
                    const expanded = expandedLineId === group.line.id;
                    return (
                      <div key={group.line.id} className="commute-station-line-group">
                        <button
                          type="button"
                          className="commute-station-line-trigger"
                          aria-expanded={expanded}
                          onClick={() => setExpandedLineId((current) => current === group.line.id ? null : group.line.id)}
                        >
                          <span>
                            <StationLineBadge line={group.line} />
                            Line {group.line.number} {group.line.name}
                          </span>
                          <ChevronRight size={15} aria-hidden="true" />
                        </button>
                        {expanded ? (
                          <div className="commute-station-options">
                            {group.stations.map((station) => (
                              <StationOption
                                key={`${group.line.id}-${station.id}`}
                                station={station}
                                selected={station.id === value}
                                disabled={station.id === blockedStationId}
                                disabledReason={blockedLabel}
                                onChoose={chooseStation}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>,
            document.querySelector(".linewatch-shell") || document.body,
          )
        : null}
    </div>
  );
}
