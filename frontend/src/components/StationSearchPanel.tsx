"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AlertTriangle, ChevronRight, Search, X } from "lucide-react";
import {
  buildStationLineGroups,
  searchStations,
  STATION_SEARCH_LINES,
  type StationSearchLine,
} from "../app/station-search";
import type { StationSummary } from "../app/station-data";

type Props = {
  open: boolean;
  stations: StationSummary[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
  onClose: () => void;
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
      className="station-search-line-badge"
      style={{ backgroundColor: line.color, color: lineTextColor(line.id) }}
      aria-label={`Line ${line.number}`}
      title={`Line ${line.number} ${line.name}`}
    >
      {line.number}
    </span>
  );
}

function StationMetaFlags({ station }: { station: StationSummary }) {
  if (!station.hasActiveImpact && station.accessStatus === "normal") {
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
      {station.accessStatus !== "normal" ? (
        <span className={`station-search-flag station-search-flag-access access-${station.accessStatus}`}>
          Access
        </span>
      ) : null}
    </span>
  );
}

function StationButton({
  station,
  selected,
  onSelect,
}: {
  station: StationSummary;
  selected: boolean;
  onSelect: (stationId: string) => void;
}) {
  const lines = station.lineIds
    .map((lineId) => lineById(lineId))
    .filter((line): line is StationSearchLine => Boolean(line));

  return (
    <button
      type="button"
      className={`station-search-station ${selected ? "selected" : ""}`}
      onClick={() => onSelect(station.id)}
      aria-current={selected ? "true" : undefined}
      aria-label={`${station.name} station search result`}
    >
      <span className="min-w-0">
        <span className="station-search-station-name">{station.name}</span>
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

export function StationSearchPanel({ open, stations, selectedStationId, onSelectStation, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const results = useMemo(() => searchStations(stations, query), [query, stations]);
  const lineGroups = useMemo(() => buildStationLineGroups(stations), [stations]);
  const isExpanded = Boolean(expandedLineId) && !query.trim();
  const stationsColumnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stationsColumnRef.current) {
      stationsColumnRef.current.scrollTop = 0;
    }
  }, [expandedLineId]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setExpandedLineId(null);
      return;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  function chooseStation(stationId: string) {
    onSelectStation(stationId);
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query.trim()) {
        setQuery("");
      } else {
        onClose();
      }
      return;
    }

    if (event.key === "Enter" && query.trim() && results[0]) {
      event.preventDefault();
      chooseStation(results[0].station.id);
    }
  }

  const activeLineGroup = useMemo(() => {
    return lineGroups.find((group) => group.line.id === expandedLineId) || lineGroups[0];
  }, [lineGroups, expandedLineId]);

  return (
    <section
      className={`station-search-panel panel-strong ${open ? "open" : ""}`}
      aria-label="Station search"
      aria-hidden={!open}
      inert={!open ? true : undefined}
      data-station-search-panel
      data-open={open ? "true" : "false"}
      data-expanded={isExpanded ? "true" : "false"}
    >
      <div className="station-search-input-row">
        <Search size={18} className="station-search-input-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          aria-label="Search mapped stations"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search stations"
          className="station-search-input"
        />
        <button
          type="button"
          className="station-search-clear"
          onClick={() => (query ? setQuery("") : onClose())}
          aria-label={query ? "Clear station search" : "Close station search"}
        >
          <X size={18} />
        </button>
      </div>

      <div className="station-search-content">
        {query.trim() ? (
          <div className="station-search-results" aria-label="Station search results">
            {results.length > 0 ? (
              results.map((result) => (
                <StationButton
                   key={result.station.id}
                   station={result.station}
                   selected={selectedStationId === result.station.id}
                   onSelect={chooseStation}
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
              {lineGroups.map((group) => {
                const expanded = expandedLineId === group.line.id;

                return (
                  <div
                    key={group.line.id}
                    className={`station-search-line-group ${expanded ? "expanded" : ""}`}
                  >
                    <button
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
                    {activeLineGroup.stations.map((station) => (
                      <StationButton
                        key={`${activeLineGroup.line.id}-${station.id}`}
                        station={station}
                        selected={selectedStationId === station.id}
                        onSelect={chooseStation}
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
