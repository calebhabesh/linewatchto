"use client";

import { useMemo, useRef, useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import type { AccountSavedStation } from "../app/saved-station-data";
import { filterAndSortSavedStations, type SavedStationSort } from "../app/saved-stations";
import type { StationSummary } from "../app/station-data";
import { ToolbarSelectMenu, type ToolbarSelectOption } from "./ImpactListToolbar";

type Props = {
  savedStations: AccountSavedStation[];
  stations: StationSummary[];
  loading: boolean;
  error: string | null;
  pendingStationIds: Set<string>;
  onSave: (stationId: string) => Promise<boolean>;
  onRemove: (stationId: string) => Promise<boolean>;
  onSelectStation: (stationId: string) => void;
  onRetry: () => void;
  onBack: () => void;
  onClose: () => void;
};

const LINES = [
  { id: "line-1", number: "1", name: "Yonge-University", color: "#F8C300", text: "#111827" },
  { id: "line-2", number: "2", name: "Bloor-Danforth", color: "#00923F", text: "#ffffff" },
  { id: "line-4", number: "4", name: "Sheppard", color: "#A21A68", text: "#ffffff" },
  { id: "line-5", number: "5", name: "Eglinton Crosstown", color: "#EB8738", text: "#111827" },
  { id: "line-6", number: "6", name: "Finch West", color: "#969594", text: "#111827" },
] as const;

const SORT_OPTIONS: Array<{ value: SavedStationSort; label: string }> = [
  { value: "attention", label: "Needs Attention" },
  { value: "name", label: "Name A-Z" },
  { value: "recent", label: "Recently Saved" },
  { value: "oldest", label: "Oldest Saved" },
  { value: "line", label: "Line" },
];

const LINE_OPTIONS: ToolbarSelectOption<string>[] = [
  { value: "all", label: "All Lines" },
  ...LINES.map((line) => ({ value: line.id, label: line.name, lineId: line.id })),
];

function StationLineBadges({ lineIds }: { lineIds: string[] }) {
  return (
    <span className="my-stations-line-badges" aria-label={lineIds.map((id) => `Line ${id.replace("line-", "")}`).join(", ")}>
      {lineIds.map((id) => {
        const line = LINES.find((candidate) => candidate.id === id);
        if (!line) return null;
        return <span key={id} style={{ backgroundColor: line.color, color: line.text }}>{line.number}</span>;
      })}
    </span>
  );
}

function stationState(station: StationSummary) {
  const counts = station.accessOutageCounts ?? { elevator: 0, escalator: 0 };
  const outageCount = counts.elevator + counts.escalator;
  if (station.hasActiveImpact) {
    return { label: "Active station impact", tone: "impact" };
  }
  if (outageCount > 0 || station.accessStatus === "outage") {
    return {
      label: `${Math.max(outageCount, 1)} accessibility ${Math.max(outageCount, 1) === 1 ? "outage" : "outages"}`,
      tone: "outage",
    };
  }
  return { label: "No active station impacts", tone: "clear" };
}

function SavedStationRow({
  saved,
  pending,
  onOpen,
  onRemove,
}: {
  saved: AccountSavedStation;
  pending: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const state = stationState(saved.station);
  return (
    <div className="my-stations-row">
      <button type="button" className="my-stations-row-main" onClick={onOpen}>
        <span className="my-stations-row-copy">
          <span className="my-stations-row-heading">
            <strong>{saved.station.name}</strong>
            <StationLineBadges lineIds={saved.station.lineIds} />
          </span>
          <span className={`my-stations-state ${state.tone}`}>{state.label}</span>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="my-stations-bookmark saved"
        onClick={onRemove}
        disabled={pending}
        aria-pressed="true"
        aria-label={`Remove ${saved.station.name} from My Stations`}
      >
        <Bookmark size={20} fill="currentColor" aria-hidden="true" />
      </button>
    </div>
  );
}

export function MyStationsPanel({
  savedStations,
  stations,
  loading,
  error,
  pendingStationIds,
  onSave,
  onRemove,
  onSelectStation,
  onRetry,
  onBack,
  onClose,
}: Props) {
  const [mode, setMode] = useState<"list" | "add">("list");
  const [query, setQuery] = useState("");
  const [lineId, setLineId] = useState("all");
  const [sort, setSort] = useState<SavedStationSort>("attention");
  const [lastRemoved, setLastRemoved] = useState<AccountSavedStation | null>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const savedIds = useMemo(() => new Set(savedStations.map((saved) => saved.station.id)), [savedStations]);
  const visible = useMemo(
    () => filterAndSortSavedStations(savedStations, query, lineId, sort),
    [savedStations, query, lineId, sort],
  );
  const pickerStations = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-CA");
    return stations
      .filter((station) => !needle || station.name.toLocaleLowerCase("en-CA").includes(needle))
      .filter((station) => lineId === "all" || station.lineIds.includes(lineId))
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name, "en-CA"));
  }, [lineId, query, stations]);
  const pickerGroups = useMemo(() => {
    if (query.trim()) {
      return [{ id: "search-results", label: "Search Results", line: null, stations: pickerStations }];
    }

    return LINES
      .filter((line) => lineId === "all" || line.id === lineId)
      .map((line) => ({
        id: line.id,
        label: `Line ${line.number} ${line.name}`,
        line,
        stations: pickerStations.filter((station) => station.lineIds.includes(line.id)),
      }))
      .filter((group) => group.stations.length > 0);
  }, [lineId, pickerStations, query]);
  const compactEmpty = mode === "list" && !loading && !error && savedStations.length === 0;

  async function remove(saved: AccountSavedStation) {
    if (await onRemove(saved.station.id)) {
      setLastRemoved(saved);
    }
  }

  async function undoRemove() {
    if (!lastRemoved) return;
    const restored = await onSave(lastRemoved.station.id);
    if (restored) setLastRemoved(null);
  }

  function leavePicker() {
    setMode("list");
    setQuery("");
    setLineId("all");
    window.setTimeout(() => modeButtonRef.current?.focus(), 0);
  }

  return (
    <section className={`my-stations-panel${compactEmpty ? " my-stations-panel-empty" : ""} panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl`} aria-label="My Stations">
      <div className="panel-heading my-stations-heading @container border-b border-black/10 dark:border-white/10 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-1 sm:gap-3 min-w-0">
        <div className="my-stations-title flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => mode === "add" ? leavePicker() : onBack()}
            className="p-1 sm:p-2 -ml-1.5 sm:ml-0 mr-1 sm:mr-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            aria-label={mode === "add" ? "Back to My Stations" : "Back"}
          >
            <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-slate-300" />
          </button>
          <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-3 whitespace-nowrap">
            <Bookmark className="my-stations-title-icon w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-sky-500 shrink-0" fill="none" aria-hidden="true" />
            <span>My Stations</span>
          </h2>
        </div>
        <div className="my-stations-heading-actions flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="my-stations-count" aria-label={`${savedStations.length} saved stations`}>{savedStations.length}</span>
          <button type="button" className="my-stations-close p-1 sm:p-2 -mr-1.5 sm:mr-0 ml-1 sm:ml-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center" onClick={onClose} aria-label="Close My Stations">
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        </div>
      </div>

      <div className="my-stations-body">
        <div className="my-stations-controls">
          <div className="my-stations-controls-top">
            <label className={`impact-list-search my-stations-search${mode === "add" ? " picker-nudge" : ""}`}>
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">{mode === "add" ? "Search all stations" : "Search saved stations"}</span>
              <input
                type="search"
                className="submenu-search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === "add" ? "Search All Stations..." : "Search saved stations..."}
              />
            </label>
            <button
              ref={modeButtonRef}
              type="button"
              className={`my-stations-mode-action ${mode === "list" ? "my-stations-add" : "my-stations-done"}`}
              onClick={() => {
                if (mode === "add") {
                  leavePicker();
                } else {
                  setMode("add");
                  setQuery("");
                  setLineId("all");
                }
              }}
              aria-label={mode === "list" ? "Add Station" : "Done adding stations"}
            >
              <span key={mode} className="my-stations-mode-action-content">
                {mode === "list" ? <Plus size={16} aria-hidden="true" /> : null}
                {mode === "list" ? (
                  <>
                    <span className="my-stations-add-wide">Add Station</span>
                    <span className="my-stations-add-compact">Add</span>
                  </>
                ) : <span>Done</span>}
              </span>
            </button>
          </div>
          <div className="my-stations-selects">
            <ToolbarSelectMenu
              ariaLabel="Filter stations by line"
              prefix="Line"
              value={lineId}
              options={LINE_OPTIONS}
              onChange={setLineId}
            />
            <ToolbarSelectMenu
              ariaLabel="Sort saved stations"
              prefix="Sort"
              value={mode === "add" ? "name" : sort}
              options={SORT_OPTIONS}
              onChange={setSort}
              disabled={mode === "add"}
            />
          </div>
        </div>

        {error ? (
          <div className="my-stations-empty" role="alert">
            <p>Could not load saved stations</p>
            <button type="button" onClick={onRetry}>Retry</button>
          </div>
        ) : loading ? (
          <div className="my-stations-empty" role="status"><p>Loading saved stations...</p></div>
        ) : mode === "add" ? (
          <div className="my-stations-list my-stations-picker-list" aria-label="Add stations">
            {pickerGroups.map((group) => (
              <section className="my-stations-picker-section" key={group.id} aria-labelledby={`station-group-${group.id}`}>
                <h3
                  id={`station-group-${group.id}`}
                  className={`my-stations-picker-section-heading${group.line ? " has-line-accent" : ""}`}
                  style={group.line ? { borderLeftColor: group.line.color } : undefined}
                >
                  {group.line ? (
                    <span className="my-stations-picker-line-number" style={{ backgroundColor: group.line.color, color: group.line.text }}>
                      {group.line.number}
                    </span>
                  ) : null}
                  <span>{group.label}</span>
                  <span className="my-stations-picker-section-count">{group.stations.length}</span>
                </h3>
                <div className="my-stations-picker-section-rows">
                  {group.stations.map((station) => {
                    const saved = savedIds.has(station.id);
                    const pending = pendingStationIds.has(station.id);
                    return (
                      <div className="my-stations-picker-row" key={`${group.id}-${station.id}`}>
                        <span className="my-stations-row-copy">
                          <span className="my-stations-row-heading"><strong>{station.name}</strong><StationLineBadges lineIds={station.lineIds} /></span>
                          <span className={`my-stations-state ${stationState(station).tone}`}>{stationState(station).label}</span>
                        </span>
                        <button
                          type="button"
                          className={`my-stations-picker-action${saved ? " saved" : ""}`}
                          onClick={() => saved ? void onRemove(station.id) : void onSave(station.id)}
                          disabled={pending}
                          aria-pressed={saved}
                          aria-label={saved ? `Remove ${station.name} from My Stations` : `Save ${station.name} to My Stations`}
                        >
                          <Bookmark size={24} fill={saved ? "currentColor" : "none"} />
                          <span>{pending ? (saved ? "Removing..." : "Saving...") : saved ? "Saved" : "Save"}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {pickerStations.length === 0 ? <div className="my-stations-empty"><p>No Stations Match</p></div> : null}
          </div>
        ) : savedStations.length === 0 ? (
          <div className="my-stations-empty">
            <p>No Saved Stations</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="my-stations-empty">
            <p>No Saved Stations Match</p>
            <button type="button" onClick={() => { setQuery(""); setLineId("all"); }}>Clear Filters</button>
          </div>
        ) : (
          <div className="my-stations-list" aria-label="Saved stations">
            {visible.map((saved) => (
              <SavedStationRow
                key={saved.station.id}
                saved={saved}
                pending={pendingStationIds.has(saved.station.id)}
                onOpen={() => onSelectStation(saved.station.id)}
                onRemove={() => void remove(saved)}
              />
            ))}
          </div>
        )}
      </div>

      {lastRemoved ? (
        <div className="my-stations-undo" role="status">
          <span>{lastRemoved.station.name} removed</span>
          <button type="button" onClick={() => void undoRemove()}>Undo</button>
          <button type="button" onClick={() => setLastRemoved(null)} aria-label="Dismiss undo"><X size={15} /></button>
        </div>
      ) : null}
    </section>
  );
}
