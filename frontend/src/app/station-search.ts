import {
  STATION_LINE_DEFINITIONS,
  STATION_LINE_STATION_IDS,
  type StationSummary,
} from "./station-data.ts";
import type { NetworkId } from "./regional-data.ts";

type MatchKind = "exact" | "acronym" | "prefix" | "token-prefix" | "substring" | "subsequence";

export type StationSearchLine = {
  id: string;
  number: string;
  name: string;
  color: string;
  icon: string;
};

export type StationLineGroup = {
  line: StationSearchLine;
  stations: StationSummary[];
};

export type StationSearchResult = {
  station: StationSummary;
  score: number;
  matchKind: MatchKind;
  lineIds: string[];
};

export type StationSearchCatalogs = Record<NetworkId, StationSummary[]>;

export type NetworkStationSearchResult = StationSearchResult & {
  networkId: NetworkId;
};

export type NetworkStationLineGroup = StationLineGroup & {
  networkId: NetworkId;
};

export const STATION_SEARCH_LINES: StationSearchLine[] = Object.values(STATION_LINE_DEFINITIONS).map((line) => ({
  id: line.id,
  number: line.number,
  name: line.name,
  color: line.color,
  icon: `/assets/linewatch/${line.id}-legend.svg?v=2`,
}));

export const REGIONAL_STATION_SEARCH_LINES: StationSearchLine[] = [
  { id: "regional-br", number: "BR", name: "Barrie", color: "#155ba0", icon: "/assets/linewatch/go-br-legend.svg?v=2" },
  { id: "regional-ki", number: "KI", name: "Kitchener", color: "#138336", icon: "/assets/linewatch/go-ki-legend.svg?v=2" },
  { id: "regional-le", number: "LE", name: "Lakeshore East", color: "#ee2722", icon: "/assets/linewatch/go-le-legend.svg?v=2" },
  { id: "regional-lw", number: "LW", name: "Lakeshore West", color: "#8b0a31", icon: "/assets/linewatch/go-lw-legend.svg?v=2" },
  { id: "regional-mi", number: "MI", name: "Milton", color: "#f47216", icon: "/assets/linewatch/go-mi-legend.svg?v=2" },
  { id: "regional-rh", number: "RH", name: "Richmond Hill", color: "#27adea", icon: "/assets/linewatch/go-rh-legend.svg?v=2" },
  { id: "regional-st", number: "ST", name: "Stouffville", color: "#774111", icon: "/assets/linewatch/go-st-legend.svg?v=2" },
  { id: "regional-up", number: "UP", name: "Union Pearson Express", color: "#4084cd", icon: "/assets/linewatch/up-express-legend.svg?v=2" },
];

export const ALL_STATION_SEARCH_LINES = [...STATION_SEARCH_LINES, ...REGIONAL_STATION_SEARCH_LINES];

export function stationSearchLineById(lineId: string) {
  return ALL_STATION_SEARCH_LINES.find((line) => line.id === lineId);
}

export function normalizeStationQuery(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bst\.?(?=\s|$)/g, "saint")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

function acronym(value: string) {
  return normalizeStationQuery(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0])
    .join("");
}

function tokenPrefixScore(queryTokens: string[], targetTokens: string[]) {
  let cursor = 0;

  for (const queryToken of queryTokens) {
    const nextIndex = targetTokens.findIndex((targetToken, index) => {
      return index >= cursor && targetToken.startsWith(queryToken);
    });

    if (nextIndex === -1) {
      return null;
    }

    cursor = nextIndex + 1;
  }

  return cursor;
}

function subsequencePenalty(query: string, target: string) {
  let cursor = -1;
  let gaps = 0;

  for (const character of query) {
    const nextIndex = target.indexOf(character, cursor + 1);
    if (nextIndex === -1) {
      return null;
    }

    if (cursor >= 0) {
      gaps += nextIndex - cursor - 1;
    }
    cursor = nextIndex;
  }

  return gaps + Math.max(0, target.length - query.length);
}

function scoreStation(station: StationSummary, query: string): Pick<StationSearchResult, "score" | "matchKind"> | null {
  const normalizedName = normalizeStationQuery(station.name);
  const normalizedQuery = normalizeStationQuery(query);
  const compactName = compact(normalizedName);
  const compactQuery = compact(normalizedQuery);

  if (!compactQuery) {
    return null;
  }

  const stationAcronym = acronym(station.name);

  if (normalizedName === normalizedQuery || compactName === compactQuery) {
    return { score: 0, matchKind: "exact" };
  }

  if (stationAcronym === compactQuery) {
    return { score: 2, matchKind: "acronym" };
  }

  if (normalizedName.startsWith(normalizedQuery) || compactName.startsWith(compactQuery)) {
    return { score: 8, matchKind: "prefix" };
  }

  if (stationAcronym.startsWith(compactQuery)) {
    return { score: 12, matchKind: "acronym" };
  }

  const tokenScore = tokenPrefixScore(normalizedQuery.split(" "), normalizedName.split(" "));
  if (tokenScore !== null) {
    return { score: 20 + tokenScore, matchKind: "token-prefix" };
  }

  if (normalizedName.includes(normalizedQuery) || compactName.includes(compactQuery)) {
    return { score: 40, matchKind: "substring" };
  }

  const penalty = subsequencePenalty(compactQuery, compactName);
  if (penalty !== null) {
    return { score: 80 + penalty, matchKind: "subsequence" };
  }

  return null;
}

export function buildStationLineGroups(stations: StationSummary[]): StationLineGroup[] {
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const visibleLineIds = new Set(stations.flatMap((station) => station.lineIds));
  const lines = ALL_STATION_SEARCH_LINES.filter((line) => visibleLineIds.has(line.id));

  return lines.map((line) => {
    const orderedIds = STATION_LINE_STATION_IDS[line.id] ?? [];
    const orderedStations = orderedIds
      .map((stationId) => stationById.get(stationId))
      .filter((station): station is StationSummary => Boolean(station));
    const orderedStationIds = new Set(orderedStations.map((station) => station.id));
    const appendedStations = stations
      .filter((station) => station.lineIds.includes(line.id) && !orderedStationIds.has(station.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      line,
      stations: [...orderedStations, ...appendedStations],
    };
  }).filter((group) => group.stations.length > 0);
}

export function buildNetworkStationLineGroups(
  catalogs: StationSearchCatalogs,
  currentNetwork: NetworkId,
): NetworkStationLineGroup[] {
  const networkOrder: NetworkId[] = currentNetwork === "ttc"
    ? ["ttc", "regional"]
    : ["regional", "ttc"];

  return networkOrder.flatMap((networkId) =>
    buildStationLineGroups(catalogs[networkId]).map((group) => ({
      ...group,
      networkId,
    })),
  );
}

export function searchStations(stations: StationSummary[], query: string, limit = 12): StationSearchResult[] {
  return stations
    .map((station) => {
      const scored = scoreStation(station, query);
      if (!scored) {
        return null;
      }

      return {
        station,
        score: scored.score,
        matchKind: scored.matchKind,
        lineIds: station.lineIds,
      };
    })
    .filter((result): result is StationSearchResult => Boolean(result))
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }

      return a.station.name.localeCompare(b.station.name);
    })
    .slice(0, limit);
}

export function searchStationsAcrossNetworks(
  catalogs: StationSearchCatalogs,
  currentNetwork: NetworkId,
  query: string,
  limit = 16,
): NetworkStationSearchResult[] {
  const results = (Object.entries(catalogs) as Array<[NetworkId, StationSummary[]]>)
    .flatMap(([networkId, stations]) =>
      searchStations(stations, query, limit).map((result) => ({
        ...result,
        networkId,
      })),
    );

  return results
    .sort((a, b) => {
      const aScore = a.score + (a.networkId === currentNetwork ? 0 : 3);
      const bScore = b.score + (b.networkId === currentNetwork ? 0 : 3);
      if (aScore !== bScore) return aScore - bScore;
      if (a.networkId !== b.networkId) return a.networkId === currentNetwork ? -1 : 1;
      return a.station.name.localeCompare(b.station.name);
    })
    .slice(0, limit);
}
