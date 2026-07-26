import type { SurfaceNoticeDetail } from "./surface-notice-data.ts";
import {
  ALL_STATION_SEARCH_LINES,
  normalizeStationQuery,
  type StationSearchLine,
} from "./station-search.ts";

export type GlobalDestinationView =
  | "accessibility-outages"
  | "commutes"
  | "my-stations"
  | "surface-notices";

export type GlobalDestination = {
  view: GlobalDestinationView;
  label: string;
  description: string;
  aliases: string[];
};

export type TransitLineSearchResult = {
  line: StationSearchLine;
  score: number;
};

export type SearchableSavedCommute = {
  id: string;
  label: string;
  originStationName: string;
  destinationStationName: string;
  routeLabel: string;
  impact: {
    statusLabel: string;
  };
};

export type SavedCommuteSearchResult<T extends SearchableSavedCommute = SearchableSavedCommute> = {
  commute: T;
  score: number;
};

export type SurfaceNoticeSearchResult = {
  notice: SurfaceNoticeDetail;
  score: number;
};

export const GLOBAL_SEARCH_DESTINATIONS: GlobalDestination[] = [
  {
    view: "commutes",
    label: "Saved Commutes",
    description: "Open monitored routes and travel-time impacts",
    aliases: ["saved commute", "saved commutes", "commute", "commutes", "route", "routes", "trip", "trips", "saved"],
  },
  {
    view: "my-stations",
    label: "My Stations",
    description: "Open your station watchlist",
    aliases: ["my station", "my stations", "saved station", "saved stations", "watchlist", "bookmark", "bookmarks", "saved"],
  },
  {
    view: "accessibility-outages",
    label: "Accessibility Outages",
    description: "Elevator and escalator outage drill-downs",
    aliases: ["accessibility", "accessibility outage", "elevator", "escalator", "outage", "outages"],
  },
  {
    view: "surface-notices",
    label: "Streetcar & Bus Notices",
    description: "Search route, stop, detour, and bypass notices",
    aliases: ["streetcar", "bus", "surface", "surface notice", "service notice", "detour", "bypass", "route notice"],
  },
];

function scoreText(documentValue: string, queryValue: string) {
  const document = normalizeStationQuery(documentValue);
  const query = normalizeStationQuery(queryValue);
  if (!query) return null;
  if (document === query) return 0;
  if (document.startsWith(query)) return 10;
  if (document.includes(query)) return 20 + document.indexOf(query);

  const tokens = query.split(" ").filter(Boolean);
  if (tokens.every((token) => document.includes(token))) return 60;
  return null;
}

export function searchTransitLines(
  visibleLineIds: string[],
  query: string,
  limit = 5,
): TransitLineSearchResult[] {
  const visible = new Set(visibleLineIds);
  return ALL_STATION_SEARCH_LINES
    .filter((line) => visible.has(line.id))
    .map((line) => {
      const lineLabel = line.id.startsWith("regional-")
        ? `${line.number} ${line.name} ${line.name === "Union Pearson Express" ? "UP Express" : ""}`
        : `Line ${line.number} ${line.name}`;
      const score = scoreText(lineLabel, query);
      return score === null ? null : { line, score };
    })
    .filter((result): result is TransitLineSearchResult => result !== null)
    .sort((a, b) => a.score - b.score || a.line.name.localeCompare(b.line.name))
    .slice(0, limit);
}

export function matchGlobalDestinations(query: string, limit = 4) {
  const normalizedQuery = normalizeStationQuery(query);
  if (!normalizedQuery) return [];

  return GLOBAL_SEARCH_DESTINATIONS
    .map((destination) => {
      const scores = destination.aliases
        .map((alias) => scoreText(alias, normalizedQuery))
        .filter((score): score is number => score !== null);
      if (scores.length === 0) return null;
      return { ...destination, score: Math.min(...scores) };
    })
    .filter((result): result is GlobalDestination & { score: number } => result !== null)
    .sort((a, b) => a.score - b.score || GLOBAL_SEARCH_DESTINATIONS.findIndex((item) => item.view === a.view) - GLOBAL_SEARCH_DESTINATIONS.findIndex((item) => item.view === b.view))
    .slice(0, limit);
}

export function searchSavedCommutes<T extends SearchableSavedCommute>(
  commutes: T[],
  query: string,
  limit = 5,
): SavedCommuteSearchResult<T>[] {
  return commutes
    .map((commute) => {
      const score = scoreText(
        [
          commute.label,
          commute.originStationName,
          commute.destinationStationName,
          commute.routeLabel,
          commute.impact.statusLabel,
        ].join(" "),
        query,
      );
      return score === null ? null : { commute, score };
    })
    .filter((result): result is SavedCommuteSearchResult<T> => result !== null)
    .sort((a, b) => a.score - b.score || a.commute.label.localeCompare(b.commute.label))
    .slice(0, limit);
}

export function searchSurfaceNotices(
  notices: SurfaceNoticeDetail[],
  query: string,
  limit = 5,
): SurfaceNoticeSearchResult[] {
  return notices
    .map((notice) => {
      const score = scoreText(
        [
          notice.category,
          notice.routeType,
          ...notice.routeIds,
          notice.title,
          notice.description,
          notice.location,
          ...notice.stopIds,
          ...(notice.stops ?? []).flatMap((stop) => [stop.stopId, stop.stopName]),
          notice.direction,
          notice.cause,
        ].filter(Boolean).join(" "),
        query,
      );
      return score === null ? null : { notice, score };
    })
    .filter((result): result is SurfaceNoticeSearchResult => result !== null)
    .sort((a, b) => a.score - b.score || b.notice.updatedAt.localeCompare(a.notice.updatedAt))
    .slice(0, limit);
}
