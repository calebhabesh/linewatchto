"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MutableRefObject } from "react";
import { Bookmark, Bus, ChevronRight, LoaderCircle, Navigation, Search, X } from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import {
  IMPACT_SEARCH_CATEGORIES,
  matchImpactCategories,
  searchDashboardImpacts,
  type ImpactSearchResult,
} from "../app/alert-search";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import {
  buildNetworkStationLineGroups,
  searchStationsAcrossNetworks,
  stationSearchLineById,
  type NetworkStationLineGroup,
  type StationSearchLine,
  type StationSearchCatalogs,
} from "../app/station-search";
import {
  type StationSummary,
  isStationWheelchairAccessible,
  isStationElevatorAccessible,
  isStationWashroomAvailable,
  isStationParkingAvailable,
} from "../app/station-data";
import { stationImpactKindsByStation } from "../app/station-impact-types";
import { getSurfaceNotices, type SurfaceNoticeDetail } from "../app/surface-notice-data";
import type { AccountSavedCommute } from "../app/account-data";
import type { NetworkId } from "../app/regional-data";
import {
  matchGlobalDestinations,
  searchSavedCommutes,
  searchSurfaceNotices,
  searchTransitLines,
  type GlobalDestinationView,
} from "../app/unified-search";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { LineBadge } from "./ImpactCardFields";
import { TransitLineBadge } from "./TransitLineBadge";
import { StationImpactTypeBadges } from "./StationImpactTypeBadges";
import { StationOutageBadge } from "./StationOutageBadge";

const BROWSE_IMPACT_CATEGORIES = (
  ["suspension", "delay", "planned-closure", "reduced-speed-zone"] satisfies ImpactKind[]
).map((kind) => IMPACT_SEARCH_CATEGORIES.find((category) => category.kind === kind)!);

type Props = {
  open: boolean;
  stationCatalogs: StationSearchCatalogs;
  currentNetwork: NetworkId;
  selectedStationId: string | null;
  onSelectStation: (stationId: string, networkId: NetworkId) => void;
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
  savedStationKeys: Set<string>;
  pendingSavedStationIds: Set<string>;
  onToggleSavedStation: (stationId: string, networkId: NetworkId) => void;
  onRequestSignIn: () => void;
  savedCommutes: AccountSavedCommute[];
  surfaceSearchEnabled: boolean;
  onOpenDestination: (view: GlobalDestinationView) => void;
  onOpenSavedCommute: (commuteId: string) => void;
  onOpenSurfaceNotice: (notice: SurfaceNoticeDetail) => void;
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
            {result.activeNow ? <span>Active Now</span> : null}
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

function GlobalDestinationBadge({ view }: { view: GlobalDestinationView }) {
  if (view === "accessibility-outages") {
    return (
      <span className="global-search-resource-icon global-search-resource-icon--standard">
        <Image
          src="/assets/linewatch/accessibility-alert.svg"
          alt=""
          width={24}
          height={24}
          aria-hidden="true"
        />
      </span>
    );
  }

  const Icon = view === "commutes"
    ? Navigation
    : view === "my-stations"
      ? Bookmark
      : Bus;

  return (
    <span className="global-search-resource-icon">
      <Icon size={18} aria-hidden="true" />
    </span>
  );
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
  networkId,
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
  networkId: NetworkId;
  impactKinds: ImpactKind[];
  selected: boolean;
  onSelect: (stationId: string, networkId: NetworkId) => void;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  saved: boolean;
  pending: boolean;
  authenticated: boolean;
  onToggleSaved: (stationId: string, networkId: NetworkId) => void;
  onRequestSignIn: () => void;
}) {
  const lines = station.lineIds
    .map((lineId) => lineById(lineId))
    .filter((line): line is StationSearchLine => Boolean(line));

  const isWheelchair = isStationWheelchairAccessible(station.id, station.lineIds, networkId);
  const hasElevator = networkId === "ttc" && isStationElevatorAccessible(station.id, station.lineIds);
  const hasWashroom = networkId === "ttc" && isStationWashroomAvailable(station.id);
  const hasParking = networkId === "ttc" && isStationParkingAvailable(station.id);

  let accessibilityLabel = "";
  if (isWheelchair) accessibilityLabel += " (Wheelchair Accessible)";
  if (hasElevator) accessibilityLabel += " (Elevator Access)";
  if (hasWashroom) accessibilityLabel += " (Washrooms Available)";
  if (hasParking) accessibilityLabel += " (Parking Available)";

  return (
    <div className="station-search-station-row">
      <button
        ref={buttonRef}
        onKeyDown={onKeyDown}
        type="button"
        className={`station-search-station ${selected ? "selected" : ""}`}
        onClick={() => onSelect(station.id, networkId)}
        aria-current={selected ? "true" : undefined}
        aria-label={`${station.name} ${networkId === "ttc" ? "TTC" : "GO and UP"} station search result${accessibilityLabel}`}
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
                className="h-[14px] w-[14px] rounded-[2px] drop-shadow-[0_0_1px_rgba(0,130,201,0.22)] dark:drop-shadow-[0_0_1.5px_rgba(0,130,201,0.3)]"
              />
            </span>
          )}
          {hasElevator && (
            <span className="inline-flex items-center justify-center shrink-0" title="Elevator available">
              <Image
                src="/assets/linewatch/outages/elevator.svg"
                alt="Elevator available"
                width={14}
                height={14}
                className="h-[14px] w-[14px] drop-shadow-[0_0_1px_rgba(0,130,201,0.22)] dark:drop-shadow-[0_0_1.5px_rgba(0,130,201,0.3)]"
              />
            </span>
          )}
          {hasWashroom && (
            <span className="inline-flex items-center justify-center shrink-0" title="Washrooms available">
              <Image
                src="/assets/linewatch/washroom.svg"
                alt="Washrooms available"
                width={14}
                height={14}
                className="h-[14px] w-[14px] drop-shadow-[0_0_1px_rgba(0,0,0,0.22)]"
              />
            </span>
          )}
          {hasParking && (
            <span className="inline-flex items-center justify-center shrink-0" title="Parking available">
              <Image
                src="/assets/linewatch/parking.svg"
                alt="Parking available"
                width={14}
                height={14}
                className="h-[14px] w-[14px] rounded-full drop-shadow-[0_0_1px_rgba(33,178,82,0.3)]"
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
          onToggleSaved(station.id, networkId);
        }}
        disabled={pending}
        aria-pressed={saved}
        aria-label={`${saved ? "Remove" : "Save"} ${station.name} (${networkId === "ttc" ? "TTC" : "GO/UP"}) ${saved ? "from" : "to"} My Stations`}
      >
        {pending ? <LoaderCircle size={18} className="station-search-bookmark-spinner" /> : <Bookmark size={19} fill={saved ? "currentColor" : "none"} />}
      </button>
    </div>
  );
}

export function StationSearchPanel({
  open,
  stationCatalogs,
  currentNetwork,
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
  savedStationKeys,
  pendingSavedStationIds,
  onToggleSavedStation,
  onRequestSignIn,
  savedCommutes,
  surfaceSearchEnabled,
  onOpenDestination,
  onOpenSavedCommute,
  onOpenSurfaceNotice,
}: Props) {
  const dashboardData = useDashboardData();
  const searchPlaceholder = "Search Stations and Alerts...";
  const stationImpactKinds = useMemo(
    () => stationImpactKindsByStation(dashboardData),
    [dashboardData],
  );
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const currentStations = stationCatalogs[currentNetwork];
  const stationResults = useMemo(
    () => searchStationsAcrossNetworks(stationCatalogs, currentNetwork, query),
    [currentNetwork, query, stationCatalogs],
  );
  const savedStationResults = useMemo(
    () => stationResults.filter((result) => savedStationKeys.has(`${result.networkId}:${result.station.id}`)),
    [savedStationKeys, stationResults],
  );
  const otherStationResults = useMemo(
    () => stationResults.filter((result) => !savedStationKeys.has(`${result.networkId}:${result.station.id}`)),
    [savedStationKeys, stationResults],
  );
  const lineResults = useMemo(
    () => searchTransitLines(
      [...new Set(Object.values(stationCatalogs).flatMap((stations) => stations.flatMap((station) => station.lineIds)))],
      query,
    ).sort((a, b) => {
      const aNetwork: NetworkId = a.line.id.startsWith("regional-") ? "regional" : "ttc";
      const bNetwork: NetworkId = b.line.id.startsWith("regional-") ? "regional" : "ttc";
      if (a.score !== b.score) return a.score - b.score;
      if (aNetwork !== bNetwork) return aNetwork === currentNetwork ? -1 : 1;
      return a.line.name.localeCompare(b.line.name);
    }),
    [currentNetwork, query, stationCatalogs],
  );
  const destinationResults = useMemo(() => matchGlobalDestinations(query), [query]);
  const savedCommuteResults = useMemo(
    () => searchSavedCommutes(savedCommutes, query),
    [query, savedCommutes],
  );
  const [surfaceNotices, setSurfaceNotices] = useState<SurfaceNoticeDetail[]>([]);
  const surfaceNoticesRequestedNetworkRef = useRef<NetworkId | null>(null);
  const surfaceNoticeResults = useMemo(
    () => searchSurfaceNotices(surfaceNotices, query),
    [query, surfaceNotices],
  );
  const impactGroups = useMemo(
    () => searchDashboardImpacts(dashboardData, currentStations, query),
    [currentStations, dashboardData, query],
  );
  const matchedCategories = useMemo(() => matchImpactCategories(query), [query]);
  const lineGroups = useMemo(
    () => buildNetworkStationLineGroups(stationCatalogs, currentNetwork),
    [currentNetwork, stationCatalogs],
  );
  const networkResultOrder: NetworkId[] = currentNetwork === "ttc"
    ? ["ttc", "regional"]
    : ["regional", "ttc"];
  const isExpanded = Boolean(expandedLineId) && !query.trim();
  const stationsColumnRef = useRef<HTMLDivElement>(null);

  const resultButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lineTriggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stationButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !surfaceSearchEnabled || surfaceNoticesRequestedNetworkRef.current === currentNetwork) return;

    let active = true;
    surfaceNoticesRequestedNetworkRef.current = currentNetwork;
    void getSurfaceNotices({ limit: 100, networkId: currentNetwork }).then((result) => {
      if (!active) return;
      setSurfaceNotices(result.data.fresh ? result.data.notices : []);
    });
    return () => {
      active = false;
    };
  }, [currentNetwork, open, surfaceSearchEnabled]);

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

  function chooseStation(stationId: string, networkId: NetworkId) {
    onSelectStation(stationId, networkId);
    onClose();
    onClosedFocusTarget?.();
  }

  function chooseImpact(nextSelection: NonNullable<ImpactSelection>) {
    onSelectImpact(nextSelection);
  }

  function chooseCategory(kind: ImpactKind) {
    onOpenImpactCategory(kind);
  }

  function chooseLine(lineId: string) {
    onQueryChange("");
    setExpandedLineId(lineId);
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
      if (destinationResults[0]) {
        onOpenDestination(destinationResults[0].view);
      } else if (lineResults[0]) {
        chooseLine(lineResults[0].line.id);
      } else if (savedStationResults[0]) {
        chooseStation(savedStationResults[0].station.id, savedStationResults[0].networkId);
      } else if (otherStationResults[0]) {
        chooseStation(otherStationResults[0].station.id, otherStationResults[0].networkId);
      } else if (savedCommuteResults[0]) {
        onOpenSavedCommute(savedCommuteResults[0].commute.id);
      } else if (impactGroups[0]?.results[0]) {
        chooseImpact(impactGroups[0].results[0].selection);
      } else if (surfaceNoticeResults[0]) {
        onOpenSurfaceNotice(surfaceNoticeResults[0].notice);
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


  const activeLineGroup = useMemo<NetworkStationLineGroup | undefined>(() => {
    return lineGroups.find((group) => group.line.id === expandedLineId) || lineGroups[0];
  }, [lineGroups, expandedLineId]);

  let nextResultButtonIndex = 0;

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
      aria-label="Global LineWatchTO search"
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
            {destinationResults.length > 0 || lineResults.length > 0 || stationResults.length > 0 || savedCommuteResults.length > 0 || impactGroups.length > 0 || surfaceNoticeResults.length > 0 || matchedCategories.length > 0 ? (
              <div className="station-search-results-list global-search-results-list">
                {destinationResults.length > 0 ? (
                  <section className="global-search-group" aria-labelledby="global-search-destinations-heading">
                    <div className="global-search-group-heading">
                      <h3 id="global-search-destinations-heading">Go to</h3>
                    </div>
                    {destinationResults.map((destination) => {
                      const keyboardIndex = nextResultButtonIndex++;
                      return (
                        <button
                          key={destination.view}
                          ref={(element) => { resultButtonRefs.current[keyboardIndex] = element; }}
                          type="button"
                          className="global-search-resource-result"
                          onClick={() => onOpenDestination(destination.view)}
                          onKeyDown={(event) => handleResultKeyDown(keyboardIndex, event)}
                        >
                          <GlobalDestinationBadge view={destination.view} />
                          <span>
                            <strong>{destination.label}</strong>
                            <small>{destination.description}</small>
                          </span>
                          <ChevronRight size={17} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </section>
                ) : null}

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

                {lineResults.length > 0 ? (
                  <section className="global-search-group" aria-labelledby="global-search-lines-heading">
                    <div className="global-search-group-heading">
                      <h3 id="global-search-lines-heading">Lines</h3>
                    </div>
                    {lineResults.map((result) => {
                      const keyboardIndex = nextResultButtonIndex++;
                      return (
                        <button
                          key={result.line.id}
                          ref={(element) => { resultButtonRefs.current[keyboardIndex] = element; }}
                          type="button"
                          className="global-search-resource-result"
                          onClick={() => chooseLine(result.line.id)}
                          onKeyDown={(event) => handleResultKeyDown(keyboardIndex, event)}
                        >
                          <span className="global-search-resource-icon global-search-resource-icon--standard">
                            <TransitLineBadge
                              lineId={result.line.id}
                              lineNumber={result.line.number}
                              lineName={result.line.name}
                              size={28}
                              decorative
                            />
                          </span>
                          <span>
                            <strong>{result.line.id.startsWith("regional-") ? result.line.number : `Line ${result.line.number}`} · {result.line.name}</strong>
                            <small>{result.line.id.startsWith("regional-") ? "GO/UP Rail" : "TTC Subway & LRT"} · Browse stations</small>
                          </span>
                          <ChevronRight size={17} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </section>
                ) : null}

                {savedStationResults.length > 0 ? (
                  <section className="global-search-group" aria-labelledby="global-search-saved-stations-heading">
                    <div className="global-search-group-heading">
                      <h3 id="global-search-saved-stations-heading">Saved stations</h3>
                      <span>{savedStationResults.length}</span>
                    </div>
                    {networkResultOrder.map((networkId) => {
                      const networkResults = savedStationResults.filter((result) => result.networkId === networkId);
                      if (networkResults.length === 0) return null;
                      return (
                        <div key={networkId} className="global-search-network-subgroup">
                          <div className={`global-search-network-heading ${networkId}`}>
                            {networkId === "ttc" ? "TTC Subway & LRT" : "GO/UP Rail"}
                          </div>
                          {networkResults.map((result) => {
                            const keyboardIndex = nextResultButtonIndex++;
                            return (
                              <StationButton
                                key={`${result.networkId}:${result.station.id}`}
                                station={result.station}
                                networkId={result.networkId}
                                impactKinds={result.networkId === currentNetwork ? stationImpactKinds.get(result.station.id) ?? [] : []}
                                selected={result.networkId === currentNetwork && selectedStationId === result.station.id}
                                onSelect={chooseStation}
                                buttonRef={(element) => { resultButtonRefs.current[keyboardIndex] = element; }}
                                onKeyDown={(event) => handleResultKeyDown(keyboardIndex, event)}
                                saved
                                pending={pendingSavedStationIds.has(result.station.id)}
                                authenticated={authenticated}
                                onToggleSaved={onToggleSavedStation}
                                onRequestSignIn={onRequestSignIn}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </section>
                ) : null}

                {otherStationResults.length > 0 ? (
                  <section className="global-search-group" aria-labelledby="global-search-stations-heading">
                    <div className="global-search-group-heading">
                      <h3 id="global-search-stations-heading">Stations</h3>
                      <span>{otherStationResults.length}</span>
                    </div>
                    {networkResultOrder.map((networkId) => {
                      const networkResults = otherStationResults.filter((result) => result.networkId === networkId);
                      if (networkResults.length === 0) return null;
                      return (
                        <div key={networkId} className="global-search-network-subgroup">
                          <div className={`global-search-network-heading ${networkId}`}>
                            {networkId === "ttc" ? "TTC Subway & LRT" : "GO/UP Rail"}
                          </div>
                          {networkResults.map((result) => {
                            const keyboardIndex = nextResultButtonIndex++;
                            return (
                              <StationButton
                                key={`${result.networkId}:${result.station.id}`}
                                station={result.station}
                                networkId={result.networkId}
                                impactKinds={result.networkId === currentNetwork ? stationImpactKinds.get(result.station.id) ?? [] : []}
                                selected={result.networkId === currentNetwork && selectedStationId === result.station.id}
                                onSelect={chooseStation}
                                buttonRef={(element) => { resultButtonRefs.current[keyboardIndex] = element; }}
                                onKeyDown={(event) => handleResultKeyDown(keyboardIndex, event)}
                                saved={false}
                                pending={pendingSavedStationIds.has(result.station.id)}
                                authenticated={authenticated}
                                onToggleSaved={onToggleSavedStation}
                                onRequestSignIn={onRequestSignIn}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </section>
                ) : null}

                {savedCommuteResults.length > 0 ? (
                  <section className="global-search-group" aria-labelledby="global-search-commutes-heading">
                    <div className="global-search-group-heading">
                      <h3 id="global-search-commutes-heading">My Commutes</h3>
                      <span>{savedCommuteResults.length}</span>
                    </div>
                    {savedCommuteResults.map(({ commute }) => {
                      const keyboardIndex = nextResultButtonIndex++;
                      return (
                        <button
                          key={commute.id}
                          ref={(element) => { resultButtonRefs.current[keyboardIndex] = element; }}
                          type="button"
                          className="global-search-resource-result"
                          onClick={() => onOpenSavedCommute(commute.id)}
                          onKeyDown={(event) => handleResultKeyDown(keyboardIndex, event)}
                        >
                          <span className="global-search-resource-icon"><Navigation size={18} /></span>
                          <span>
                            <strong>{commute.label}</strong>
                            <small>{commute.originStationName} to {commute.destinationStationName} · {commute.impact.statusLabel}</small>
                          </span>
                          <ChevronRight size={17} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </section>
                ) : null}

                {impactGroups.map((group) => (
                  <section key={group.kind} className="global-search-group" aria-labelledby={`global-search-${group.kind}-heading`}>
                    <div className="global-search-group-heading">
                      <h3 id={`global-search-${group.kind}-heading`}>
                        <ImpactTypeIcon kind={group.kind} size={14} />
                        {group.label}
                      </h3>
                      <button type="button" onClick={() => chooseCategory(group.kind)}>View all</button>
                    </div>
                    {group.results.map((result) => {
                      const keyboardIndex = nextResultButtonIndex++;
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

                {surfaceNoticeResults.length > 0 ? (
                  <section className="global-search-group" aria-labelledby="global-search-surface-heading">
                    <div className="global-search-group-heading">
                      <h3 id="global-search-surface-heading">{currentNetwork === "regional" ? "GO / UP Notices" : "Streetcar & Bus Notices"}</h3>
                      <button type="button" onClick={() => onOpenDestination("surface-notices")}>View all</button>
                    </div>
                    {surfaceNoticeResults.map(({ notice }) => {
                      const keyboardIndex = nextResultButtonIndex++;
                      const routes = notice.routeIds.length > 0 ? `Route ${notice.routeIds.join(", ")}` : notice.routeType;
                      return (
                        <button
                          key={notice.id}
                          ref={(element) => { resultButtonRefs.current[keyboardIndex] = element; }}
                          type="button"
                          className="global-search-resource-result"
                          onClick={() => onOpenSurfaceNotice(notice)}
                          onKeyDown={(event) => handleResultKeyDown(keyboardIndex, event)}
                        >
                          <span className="global-search-resource-icon"><Bus size={18} /></span>
                          <span>
                            <strong>{notice.title}</strong>
                            <small>{routes}{notice.location ? ` · ${notice.location}` : ""}</small>
                          </span>
                          <ChevronRight size={17} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </section>
                ) : null}
              </div>
            ) : (
              <div className="station-search-empty" role="status">
                No station, line, alert, saved item, or service notice matches.
              </div>
            )}
          </div>
        ) : (
          <div className="station-search-browse-container" aria-label="Browse stations by line">
            <div className="station-search-lines-column">
              <div className="global-search-browse-alerts" aria-label="Browse alert categories">
                <span>Browse alerts</span>
                <div>
                  {BROWSE_IMPACT_CATEGORIES.map((category) => (
                    <button key={category.kind} type="button" onClick={() => chooseCategory(category.kind)}>
                      <ImpactTypeIcon kind={category.kind} size={15} />
                      {category.label}
                    </button>
                  ))}
                </div>
              </div>
              {lineGroups.map((group, index) => {
                const expanded = expandedLineId === group.line.id;
                const previousGroup = lineGroups[index - 1];
                const startsNetworkSection = !previousGroup || previousGroup.networkId !== group.networkId;

                return (
                  <div key={`${group.networkId}:${group.line.id}`}>
                    {startsNetworkSection ? (
                      <div className={`station-search-network-heading ${group.networkId}`}>
                        {group.networkId === "ttc" ? "TTC Subway & LRT" : "GO/UP Rail"}
                        {group.networkId === currentNetwork ? <span>Current map</span> : null}
                      </div>
                    ) : null}
                    <div
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
                          <TransitLineBadge
                            lineId={group.line.id}
                            lineNumber={group.line.number}
                            lineName={group.line.name}
                            size={30}
                            decorative
                          />
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
                  <div className={`station-search-stations-column-header ${activeLineGroup.networkId}`}>
                    <div className="station-search-stations-column-heading-content">
                      <TransitLineBadge lineId={activeLineGroup.line.id} lineNumber={activeLineGroup.line.number} lineName={activeLineGroup.line.name} size={24} />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {activeLineGroup.line.name} Stations · {activeLineGroup.networkId === "ttc" ? "TTC" : "GO/UP"}
                      </span>
                    </div>
                  </div>
                  <div className="station-search-stations-list">
                    {activeLineGroup.stations.map((station, index) => (
                      <StationButton
                        key={`${activeLineGroup.line.id}-${station.id}`}
                        station={station}
                        networkId={activeLineGroup.networkId}
                        impactKinds={activeLineGroup.networkId === currentNetwork ? stationImpactKinds.get(station.id) ?? [] : []}
                        selected={activeLineGroup.networkId === currentNetwork && selectedStationId === station.id}
                        onSelect={chooseStation}
                        buttonRef={(element) => { stationButtonRefs.current[index] = element; }}
                        onKeyDown={(event) => handleStationButtonKeyDown(index, event)}
                        saved={savedStationKeys.has(`${activeLineGroup.networkId}:${station.id}`)}
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
