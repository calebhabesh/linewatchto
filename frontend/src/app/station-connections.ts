export type StationConnectionKind = "go" | "via" | "up" | "airport";

export type StationConnection = {
  kind: StationConnectionKind;
  label: string;
  detail: string;
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

const SERVICE_PRESENTATION: Record<"go" | "up", StationConnection> = {
  go: { kind: "go", label: "GO Transit", detail: "Regional Rail Connection" },
  up: { kind: "up", label: "UP Express", detail: "Airport Rail Connection" },
};

export function ttcStationConnections(stationId: string): StationConnection[] {
  const link = INTER_NETWORK_CONNECTIONS.find((connection) => connection.ttcStationId === stationId);
  const connections = link?.services.map((service) => SERVICE_PRESENTATION[service]) ?? [];
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
  return connections;
}

export function ttcStationIdForRegionalStation(regionalStationId: string): string {
  return INTER_NETWORK_CONNECTIONS.find(
    (connection) => connection.regionalStationId === regionalStationId,
  )?.ttcStationId ?? regionalStationId;
}
