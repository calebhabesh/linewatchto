"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MutableRefObject } from "react";
import { Bookmark, ChevronRight, LoaderCircle, Search, X } from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import {
  IMPACT_SEARCH_CATEGORIES,
  matchImpactCategories,
  searchDashboardImpacts,
  type ImpactSearchResult,
} from "../app/alert-search";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
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
import { stationImpactKindsByStation } from "../app/station-impact-types";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { LineBadge } from "./ImpactCardFields";
import { TransitLineBadge } from "./TransitLineBadge";
import { StationImpactTypeBadges } from "./StationImpactTypeBadges";
import { StationOutageBadge } from "./StationOutageBadge";

type Props = {
  open: boolean;
  stations: StationSummary[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
  onSelectImpact: (selection: NonNullable<ImpactSelection>) => void;
  onOpenImpactCategory: (kind: ImpactKind) => void;
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
  authenticated: boolean;
  savedStationIds: Set<string>;
  pendingSavedStationIds: Set<string>;
  onToggleSavedStation: (stationId: string) => void;
  onRequestSignIn: () => void;
};

function ImpactSearchButton({
  result,
  onSelect,
  buttonRef,
  onKeyDown,
}: {
  result: ImpactSearchResult;
  onSelect: (selection: NonNullable<ImpactSelection>) => void;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`global-search-impact-result ${result.categoryKind}`}
      onClick={() => onSelect(result.selection)}
      onKeyDown={onKeyDown}
      aria-label={`${result.categoryLabel}: Line ${result.lineNumber}, ${result.title}, ${result.location}`}
    >
      <span className="global-search-impact-icon" aria-hidden="true">
        <ImpactTypeIcon kind={result.categoryKind} size={17} />
      </span>
      <span className="global-search-impact-copy">
        <span className="global-search-impact-heading">
          <LineBadge lineId={result.lineId} lineNumber={result.lineNumber} />
          <strong>{result.title}</strong>
        </span>
        <span className="global-search-impact-location">
          {result.location}{result.displayDirection ? ` · ${result.displayDirection}` : ""}
        </span>
        {result.activeNow || result.shuttle || result.nightly ? (
          <span className="global-search-impact-badges">
            {result.activeNow ? <span>Active now</span> : null}
            {result.shuttle ? <span>Shuttle</span> : null}
            {result.nightly ? <span>Nightly</span> : null}
          </span>
        ) : null}
      </span>
      <ChevronRight size={17} aria-hidden="true" />
    </button>
  );
}

function lineById(lineId: string) {
  return stationSearchLineById(lineId);
}

function StationLineBadge({ line }: { line: StationSearchLine }) {
  return <TransitLineBadge lineId={line.id} lineNumber={line.number} lineName={line.name} size={24} />;
}

function StationMetaFlags({ station, impactKinds }: { station: StationSummary; impactKinds: ImpactKind[] }) {
  const outageCounts = station.accessOutageCounts ?? { elevator: 0, escalator: 0 };
  const hasAccessOutages = outageCounts.elevator > 0 || outageCounts.escalator > 0;

  if (impactKinds.length === 0 && !hasAccessOutages) {
    return null;
  }

  return (
    <span className="station-search-flags">
      <StationImpactTypeBadges kinds={impactKinds} />
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
  impactKinds,
  selected,
  onSelect,
  buttonRef,
  onKeyDown,
  saved,
  pending,
  authenticated,
  onToggleSaved,
  onRequestSignIn,
}: {
  station: StationSummary;
  impactKinds: ImpactKind[];
  selected: boolean;
  onSelect: (stationId: string) => void;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  saved: boolean;
  pending: boolean;
  authenticated: boolean;
  onToggleSaved: (stationId: string) => void;
  onRequestSignIn: () => void;
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
    <div className="station-search-station-row">
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
        <StationMetaFlags station={station} impactKinds={impactKinds} />
      </span>
      <span className="station-search-line-badges" aria-hidden="true">
        {lines.map((line) => (
          <StationLineBadge key={line.id} line={line} />
        ))}
      </span>
      </button>
      <button
        type="button"
        className={`station-search-bookmark${saved ? " saved" : ""}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (!authenticated) {
            onRequestSignIn();
            return;
          }
          onToggleSaved(station.id);
        }}
        disabled={pending}
        aria-pressed={saved}
        aria-label={`${saved ? "Remove" : "Save"} ${station.name} ${saved ? "from" : "to"} My Stations`}
      >
        {pending ? <LoaderCircle size={18} className="station-search-bookmark-spinner" /> : <Bookmark size={19} fill={saved ? "currentColor" : "none"} />}
      </button>
    </div>
  );
}

export function StationSearchPanel({
  open,
  stations,
  selectedStationId,
  onSelectStation,
  onSelectImpact,
  onOpenImpactCategory,
  onClose,
  onClosedFocusTarget,
  query,
  onQueryChange,
  inputRef,
  keyDownHandlerRef,
  isMobile,
  authenticated,
  savedStationIds,
  pendingSavedStationIds,
  onToggleSavedStation,
  onRequestSignIn,
}: Props) {
  const dashboardData = useDashboardData();
  const searchPlaceholder = "Search Stations and Alerts...";
  const stationImpactKinds = useMemo(
    () => stationImpactKindsByStation(dashboardData),
    [dashboardData],
  );
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const stationResults = useMemo(() => searchStations(stations, query), [query, stations]);
  const impactGroups = useMemo(
    () => searchDashboardImpacts(dashboardData, stations, query),
    [dashboardData, query, stations],
  );
  const matchedCategories = useMemo(() => matchImpactCategories(query), [query]);
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

  function chooseImpact(nextSelection: NonNullable<ImpactSelection>) {
    onSelectImpact(nextSelection);
  }

  function chooseCategory(kind: ImpactKind) {
    onOpenImpactCategory(kind);
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

    if (event.key === "Enter" && query.trim()) {
      event.preventDefault();
      if (stationResults[0]) {
        chooseStation(stationResults[0].station.id);
      } else if (impactGroups[0]?.results[0]) {
        chooseImpact(impactGroups[0].results[0].selection);
      } else if (matchedCategories[0]) {
        chooseCategory(matchedCategories[0].kind);
      }
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
      aria-label="Station and alert search"
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
            placeholder={searchPlaceholder}
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
          <div className="station-search-results global-search-results" aria-label="Search results">
            {stationResults.length > 0 || impactGroups.length > 0 || matchedCategories.length > 0 ? (
              <div className="station-search-results-list global-search-results-list">
                {matchedCategories.length > 0 ? (
                  <section className="global-search-group" aria-labelledby="global-search-category-heading">
                    <div className="global-search-group-heading">
                      <h3 id="global-search-category-heading">Categories</h3>
                    </div>
                    <div className="global-search-category-shortcuts">
                      {matchedCategories.map((category) => (
                        <button key={category.kind} type="button" onClick={() => chooseCategory(category.kind)}>
                          <ImpactTypeIcon kind={category.kind} size={15} />
                          {category.label}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

                {stationResults.length > 0 ? (
                  <section className="global-search-group" aria-labelledby="global-search-stations-heading">
                    <div className="global-search-group-heading">
                      <h3 id="global-search-stations-heading">Stations</h3>
                      <span>{stationResults.length}</span>
                    </div>
                    {stationResults.map((result, index) => (
                  <StationButton
                    key={result.station.id}
                    station={result.station}
                    impactKinds={stationImpactKinds.get(result.station.id) ?? []}
                    selected={selectedStationId === result.station.id}
                    onSelect={chooseStation}
                    buttonRef={(element) => { resultButtonRefs.current[index] = element; }}
                    onKeyDown={(event) => handleResultKeyDown(index, event)}
                    saved={savedStationIds.has(result.station.id)}
                    pending={pendingSavedStationIds.has(result.station.id)}
                    authenticated={authenticated}
                    onToggleSaved={onToggleSavedStation}
                    onRequestSignIn={onRequestSignIn}
                      />
                    ))}
                  </section>
                ) : null}

                {impactGroups.map((group) => (
                  <section key={group.kind} className="global-search-group" aria-labelledby={`global-search-${group.kind}-heading`}>
                    <div className="global-search-group-heading">
                      <h3 id={`global-search-${group.kind}-heading`}>{group.label}</h3>
                      <button type="button" onClick={() => chooseCategory(group.kind)}>View all</button>
                    </div>
                    {group.results.map((result, resultIndex) => {
                      const keyboardIndex = stationResults.length + impactGroups
                        .slice(0, impactGroups.findIndex((candidate) => candidate.kind === group.kind))
                        .reduce((count, candidate) => count + candidate.results.length, 0) + resultIndex;
                      return (
                        <ImpactSearchButton
                          key={`${result.selection.kind}-${result.selection.id}`}
                          result={result}
                          onSelect={chooseImpact}
                          buttonRef={(element) => { resultButtonRefs.current[keyboardIndex] = element; }}
                          onKeyDown={(event) => handleResultKeyDown(keyboardIndex, event)}
                        />
                      );
                    })}
                  </section>
                ))}
              </div>
            ) : (
              <div className="station-search-empty" role="status">
                No mapped station or dashboard alert matches.
              </div>
            )}
          </div>
        ) : (
          <div className="station-search-browse-container" aria-label="Browse stations by line">
            <div className="station-search-lines-column">
              <div className="global-search-browse-alerts" aria-label="Browse alert categories">
                <span>Browse alerts</span>
                <div>
                  {IMPACT_SEARCH_CATEGORIES.map((category) => (
                    <button key={category.kind} type="button" onClick={() => chooseCategory(category.kind)}>
                      <ImpactTypeIcon kind={category.kind} size={15} />
                      {category.label}
                    </button>
                  ))}
                </div>
              </div>
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
                          <span className="station-search-line-title">
                            {group.line.id.startsWith("regional-") ? group.line.number : `Line ${group.line.number}`}
                          </span>
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
                      <TransitLineBadge lineId={activeLineGroup.line.id} lineNumber={activeLineGroup.line.number} lineName={activeLineGroup.line.name} size={24} />
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
                        impactKinds={stationImpactKinds.get(station.id) ?? []}
                        selected={selectedStationId === station.id}
                        onSelect={chooseStation}
                        buttonRef={(element) => { stationButtonRefs.current[index] = element; }}
                        onKeyDown={(event) => handleStationButtonKeyDown(index, event)}
                        saved={savedStationIds.has(station.id)}
                        pending={pendingSavedStationIds.has(station.id)}
                        authenticated={authenticated}
                        onToggleSaved={onToggleSavedStation}
                        onRequestSignIn={onRequestSignIn}
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
