import { STATION_LINE_DEFINITIONS, STATION_LINE_STATION_IDS } from "./station-data.ts";
import { REGIONAL_ROUTE_DEFINITIONS, REGIONAL_ROUTE_STATIONS, stationName } from "./regional-data.ts";

export type StationConnectionKind = "go" | "via" | "up" | "airport" | "ttc";

export type StationConnection = {
  kind: StationConnectionKind;
  label: string;
  detail: string;
  icon?: string;
};

export type InterNetworkConnection = {
  ttcStationId: string;
  regionalStationId: string;
  services: readonly ("go" | "up")[];
};

// These links are product data as well as map annotations. Keeping the paired
// station ids here lets station details, search, and future routing reuse the
// same reviewed relationship instead of inferring it from SVG artwork.
export const INTER_NETWORK_CONNECTIONS: readonly InterNetworkConnection[] = [
  { ttcStationId: "union", regionalStationId: "union", services: ["go", "up"] },
  { ttcStationId: "dundas-west", regionalStationId: "bloor", services: ["go", "up"] },
  { ttcStationId: "kipling", regionalStationId: "kipling", services: ["go"] },
  { ttcStationId: "downsview-park", regionalStationId: "downsview-park", services: ["go"] },
  { ttcStationId: "mount-dennis", regionalStationId: "mount-dennis", services: ["go", "up"] },
  { ttcStationId: "main-street", regionalStationId: "danforth", services: ["go"] },
  { ttcStationId: "kennedy", regionalStationId: "kennedy", services: ["go"] },
  { ttcStationId: "leslie", regionalStationId: "oriole", services: ["go"] },
] as const;

const VIA_STATION_IDS = new Set([
  "union",
  "kitchener",
  "stratford",
  "durham-college-oshawa",
  "guelph-central",
  "georgetown",
  "oakville",
  "aldershot",
  "brampton-innovation-district",
  "malton",
  "st-catharines",
  "niagara-falls",
  "guildwood",
]);

const REGIONAL_AIRPORT_CONNECTIONS: Readonly<Record<string, StationConnection>> = {
  "pearson-airport": {
    kind: "airport",
    label: "Pearson Airport",
    detail: "Airport Terminal Connection",
  },
  union: {
    kind: "airport",
    label: "Billy Bishop Airport",
    detail: "Nearby Airport Connection",
  },
};

const TTC_LINE_LEGENDS: Record<string, string> = {
  "line-1": "/assets/linewatch/line-1-legend.svg",
  "line-2": "/assets/linewatch/line-2-legend.svg",
  "line-4": "/assets/linewatch/line-4-legend.svg",
  "line-5": "/assets/linewatch/line-5-legend.svg",
  "line-6": "/assets/linewatch/line-6-legend.svg",
};

function goDetailForTtcStation(regionalStationId: string): string {
  if (regionalStationId === "union") {
    return "All GO Lines";
  }
  const matchingRoutes = REGIONAL_ROUTE_DEFINITIONS.filter(
    (route) => route.number !== "UP" && REGIONAL_ROUTE_STATIONS[route.number]?.includes(regionalStationId),
  );
  if (matchingRoutes.length === 1) {
    return `${matchingRoutes[0].name} Line`;
  }
  if (matchingRoutes.length > 1) {
    return `${matchingRoutes.map((r) => `${r.name} Line`).join(", ")}`;
  }
  return "Regional Rail Connection";
}

function upDetailForTtcStation(regionalStationId: string): string {
  if (regionalStationId === "union") {
    return "Union Station";
  }
  return stationName(regionalStationId);
}

export function ttcStationConnections(stationId: string): StationConnection[] {
  const link = INTER_NETWORK_CONNECTIONS.find((connection) => connection.ttcStationId === stationId);
  if (!link) return [];

  const connections: StationConnection[] = [];
  for (const service of link.services) {
    if (service === "go") {
      connections.push({
        kind: "go",
        label: "GO Transit",
        detail: goDetailForTtcStation(link.regionalStationId),
      });
    } else if (service === "up") {
      connections.push({
        kind: "up",
        label: "UP Express",
        detail: upDetailForTtcStation(link.regionalStationId),
      });
    }
  }

  if (stationId === "union") {
    connections.splice(1, 0, { kind: "via", label: "VIA Rail", detail: "Intercity Rail Connection" });
  }
  return connections;
}

export function regionalStationConnections(stationId: string): StationConnection[] {
  const connections: StationConnection[] = [];
  if (VIA_STATION_IDS.has(stationId)) {
    connections.push({ kind: "via", label: "VIA Rail", detail: "Intercity Rail Connection" });
  }
  const airport = REGIONAL_AIRPORT_CONNECTIONS[stationId];
  if (airport) connections.push(airport);

  const ttcStationId = ttcStationIdForRegionalStation(stationId);
  const matchedTtcLines = Object.values(STATION_LINE_DEFINITIONS).filter((line) =>
    STATION_LINE_STATION_IDS[line.id]?.includes(ttcStationId),
  );
  for (const line of matchedTtcLines) {
    connections.push({
      kind: "ttc",
      label: `Line ${line.number}`,
      detail: line.name,
      icon: TTC_LINE_LEGENDS[line.id],
    });
  }

  return connections;
}

export function ttcStationIdForRegionalStation(regionalStationId: string): string {
  return INTER_NETWORK_CONNECTIONS.find(
    (connection) => connection.regionalStationId === regionalStationId,
  )?.ttcStationId ?? regionalStationId;
}
