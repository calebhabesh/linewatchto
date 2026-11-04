"use client";

import { useEffect, useState } from "react";
import { CalendarCheck2, ChevronRight, LoaderCircle, LocateFixed } from "lucide-react";
import type { NetworkId } from "../app/dashboard-contract";
import {
  formatStopDistance,
  nearStopKey,
  NEAR_ME_RADIUS_METERS,
  previewDepartures,
  previewTimeLabel,
  type NearMeState,
  type NearStop,
  type StopDeparturePreview,
} from "../app/stops-near-me";
import type { RecentStop } from "../app/recent-stops";
import type { PreparedSurfaceIndex, SurfaceSearchRoute, SurfaceSearchStop } from "../app/surface-search";
import { nearMeStore, useRecentStops, useStopsNearMe } from "../hooks/useStopsNearMe";
import { LiveSignalIcon } from "./LiveSignalIcon";
import { RouteBadges, StopCode, surfaceRouteBadgeStyle, type ResultKeyboard } from "./SurfaceSearchResults";

/**
 * The empty search box's first rows (plan 14, U6): Stops Near Me, which asks
 * for location only when tapped, then the stops last opened on this device.
 * Distances come from the local stop index; only the nearest few stops'
 * departures are requested, by stop number, and every time says whether it
 * is live or scheduled.
 */

const NETWORK_LABEL: Record<NetworkId, string> = { ttc: "TTC", regional: "GO" };
const PREVIEW_TICK_MS = 30_000;

type OpenStop = (code: string, network: NetworkId, position?: { lon: number; lat: number }) => void;

function spokenTime(at: string, now: number) {
  const label = previewTimeLabel(at, now);
  if (label === "Due") return "due";
  return label.endsWith("min") ? `in ${label}` : `at ${label}`;
}

function previewSpeech(preview: StopDeparturePreview | undefined, now: number) {
  if (preview?.status !== "ready") return "";
  const next = previewDepartures(preview.departures, now);
  if (next.length === 0) return ". No departures soon";
  return `. Next: ${next.map((departure) => `${departure.route} ${spokenTime(departure.at, now)}, ${departure.status === "live" ? "live estimate" : "scheduled"}`).join("; ")}`;
}

function DeparturePreview({ preview, now, routeLookup, network }: {
  preview: StopDeparturePreview | undefined;
  now: number;
  network: NetworkId;
  routeLookup: (network: NetworkId, route: string) => SurfaceSearchRoute | null;
}) {
  if (!preview || preview.status === "unavailable") return null;
  if (preview.status === "loading") {
    return <span className="stops-near-me-departures is-loading" aria-hidden="true">Loading Departures…</span>;
  }
  const next = previewDepartures(preview.departures, now);
  if (next.length === 0) return <span className="stops-near-me-departures" aria-hidden="true">No departures soon</span>;
  return (
    <span className="stops-near-me-departures" aria-hidden="true">
      {next.map((departure) => {
        const route = routeLookup(network, departure.route);
        return (
          <span key={`${departure.route}:${departure.at}`} className="stops-near-me-departure" data-departure-status={departure.status}>
            <span
              className="surface-search-route-badge"
              style={surfaceRouteBadgeStyle(route ?? { network, route: departure.route, color: "#00853E", textColor: "#FFFFFF" }, 1.5)}
            >
              {departure.route}
            </span>
            <span className="stops-near-me-minutes">{previewTimeLabel(departure.at, now)}</span>
            {departure.status === "live"
              ? <LiveSignalIcon size={12} className="text-emerald-600 dark:text-emerald-400" />
              : <CalendarCheck2 size={12} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />}
          </span>
        );
      })}
    </span>
  );
}

function StopRow({ stop, name, distance, preview, now, keyboard, routeLookup, onOpen, kind }: {
  stop: Pick<SurfaceSearchStop, "network" | "code" | "routes"> & Partial<Pick<SurfaceSearchStop, "lon" | "lat">>;
  name: string;
  distance: number | null;
  preview?: StopDeparturePreview;
  now: number;
  keyboard: ResultKeyboard;
  routeLookup: (network: NetworkId, route: string) => SurfaceSearchRoute | null;
  onOpen: () => void;
  kind: "near" | "recent";
}) {
  const { ref, onKeyDown } = keyboard();
  const network = NETWORK_LABEL[stop.network];
  const distanceText = distance === null ? "" : formatStopDistance(distance);
  const routes = stop.routes.length > 0 ? `, routes ${stop.routes.join(", ")}` : "";
  return (
    <button
      ref={ref}
      type="button"
      className="global-search-resource-result surface-search-stop-result stops-near-me-stop"
      data-near-me-stop={kind === "near" ? stop.code : undefined}
      data-recent-stop={kind === "recent" ? stop.code : undefined}
      data-surface-stop-network={stop.network}
      aria-label={`Stop ${stop.code}, ${name}, ${network}${distanceText ? `, ${distanceText} away` : ""}${routes}${previewSpeech(preview, now)}. Departures`}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      <StopCode stop={stop} />
      <span>
        <strong>{name}</strong>
        <span className="stops-near-me-meta">
          <span className={`stops-near-me-network is-${stop.network}`}>{network}</span>
          {distanceText ? <span className="stops-near-me-distance">{distanceText}</span> : null}
          {stop.routes.length > 0 ? <RouteBadges stop={stop} routes={stop.routes} routeLookup={routeLookup} /> : null}
        </span>
        <DeparturePreview preview={preview} now={now} network={stop.network} routeLookup={routeLookup} />
      </span>
      <ChevronRight size={17} aria-hidden="true" />
    </button>
  );
}

function rowSubtitle(state: NearMeState) {
  switch (state.status) {
    case "asking": return "Finding your location…";
    case "ready": return "Tap to update for where you are now";
    case "idle": return "Uses your location only on this device";
    default: return "Tap to try again";
  }
}

function StatusMessage({ state }: { state: NearMeState }) {
  let message: string | null = null;
  switch (state.status) {
    case "denied":
      message = "Location is blocked for this site. To list stops near you, allow location for this site in your browser or phone settings, then tap Stops Near Me again. Search still works by stop number, street or route.";
      break;
    case "unsupported":
      message = "This browser can't share your location. Search still works by stop number, street or route.";
      break;
    case "no-fix":
      message = "Couldn't find your location. Check that location services are on, then try again. Search still works by stop number, street or route.";
      break;
    case "index-unavailable":
      message = "The stop list hasn't downloaded yet. Check your connection and try again.";
      break;
    case "ready": {
      const notes: string[] = [];
      if (state.result.stops.length === 0) notes.push("No TTC or GO stops within 1 km of you.");
      else if (state.result.widened) notes.push(`No stops within ${NEAR_ME_RADIUS_METERS} m. Showing stops within 1 km.`);
      if (state.lowAccuracy) {
        notes.push(`Your location is approximate (within about ${formatStopDistance(state.accuracyMeters)}), so these may not be the nearest stops.`);
      }
      message = notes.join(" ") || null;
      break;
    }
    default:
      break;
  }
  return (
    <p className="stops-near-me-status" role="status" data-near-me-state={state.status} data-near-me-low-accuracy={state.status === "ready" && state.lowAccuracy ? "true" : undefined}>
      {message}
    </p>
  );
}

export function StopsNearMe({
  indexes,
  keyboard,
  routeLookup,
  onOpenStop,
}: {
  indexes: readonly PreparedSurfaceIndex[];
  keyboard: ResultKeyboard;
  routeLookup: (network: NetworkId, route: string) => SurfaceSearchRoute | null;
  onOpenStop: OpenStop;
}) {
  const { state, previews } = useStopsNearMe();
  const recent = useRecentStops();
  const [now, setNow] = useState(() => Date.now());
  const showingTimes = state.status === "ready" && previews.size > 0;

  useEffect(() => {
    if (!showingTimes) return;
    const tick = window.setInterval(() => setNow(Date.now()), PREVIEW_TICK_MS);
    return () => window.clearInterval(tick);
  }, [showingTimes]);
  useEffect(() => {
    // A new list or a newly arrived time: count minutes from now.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, [previews, state]);

  const recentStop = (entry: RecentStop) => {
    const index = indexes.find((candidate) => candidate.network === entry.network);
    const at = index?.stopByCode.get(entry.code);
    return at === undefined ? null : index!.stops[at];
  };

  const { ref, onKeyDown } = keyboard();
  const asking = state.status === "asking";
  const nearStops: NearStop[] = state.status === "ready" ? state.result.stops : [];
  return (
    <section className="stops-near-me" aria-label="Stops near me and recent stops" data-stops-near-me={state.status}>
      <button
        ref={ref}
        type="button"
        className="global-search-resource-result stops-near-me-trigger"
        aria-describedby="stops-near-me-note"
        aria-busy={asking || undefined}
        onClick={() => nearMeStore.locate()}
        onKeyDown={onKeyDown}
      >
        <span className="global-search-resource-icon" aria-hidden="true">
          {asking ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" /> : <LocateFixed size={18} />}
        </span>
        <span>
          <strong>Stops Near Me</strong>
          <small id="stops-near-me-note">{rowSubtitle(state)}</small>
        </span>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
      <StatusMessage state={state} />
      {nearStops.length > 0 ? (
        <div className="stops-near-me-list" aria-label={`Stops within ${formatStopDistance(state.status === "ready" ? state.result.radiusMeters : NEAR_ME_RADIUS_METERS)}`} role="group">
          {nearStops.map(({ stop, distanceMeters }) => (
            <StopRow
              key={nearStopKey(stop)}
              kind="near"
              stop={stop}
              name={stop.name}
              distance={distanceMeters}
              preview={previews.get(nearStopKey(stop))}
              now={now}
              keyboard={keyboard}
              routeLookup={routeLookup}
              onOpen={() => onOpenStop(stop.code, stop.network, { lon: stop.lon, lat: stop.lat })}
            />
          ))}
        </div>
      ) : null}
      {recent.length > 0 ? (
        <div className="stops-near-me-recent" role="group" aria-labelledby="recent-stops-heading">
          <div className="global-search-group-heading">
            <h3 id="recent-stops-heading">Recent Stops</h3>
          </div>
          {recent.map((entry) => {
            const known = recentStop(entry);
            return (
              <StopRow
                key={`${entry.network}:${entry.code}`}
                kind="recent"
                stop={known ?? { ...entry, routes: [] }}
                name={known?.name ?? `Stop ${entry.code}`}
                distance={null}
                now={now}
                keyboard={keyboard}
                routeLookup={routeLookup}
                onOpen={() => onOpenStop(entry.code, entry.network, known ? { lon: known.lon, lat: known.lat } : undefined)}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
