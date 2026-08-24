import {
  lineStatuses,
  type LineStatus,
} from "./linewatch-data.ts";
import {
  REGIONAL_ROUTE_DEFINITIONS,
  REGIONAL_ROUTE_LINKS,
  REGIONAL_ROUTE_STATIONS,
  isRegionalStationBicycleLockupAvailable,
  isRegionalStationElevatorAccessible,
  isRegionalStationParkingAvailable,
  isRegionalStationPpudoAvailable,
  isRegionalStationWashroomAvailable,
  isRegionalStationWheelchairAccessible,
  isRegionalStationWifiAvailable,
  regionalRouteIdsByStation,
  regionalStations,
  stationName as regionalStationName,
  type NetworkId,
  type RegionalRouteCode,
} from "./regional-data.ts";
import {
  STATION_LINE_DEFINITIONS,
  STATION_LINE_STATION_IDS,
  fallbackStationDetails,
  fallbackStationSummaries,
  type StationSummary,
} from "./station-data.ts";

export type TransitGuideNetworkSlug = "ttc" | "go-up";

export type TransitGuideRoute = {
  id: string;
  slug: string;
  number: string;
  name: string;
  color: string;
  textColor: "dark" | "light";
  routeLabel: string;
  directionLabel: string;
  description: string;
  networkId: NetworkId;
  networkSlug: TransitGuideNetworkSlug;
  stationIds: readonly string[];
};

export type TransitGuideAmenity = {
  label: string;
  available: boolean;
};

export type TransitGuideStationRoute = TransitGuideRoute & {
  wheelchairAccessible: boolean;
  hasElevator: boolean;
};

export type TransitGuideStation = {
  id: string;
  slug: string;
  name: string;
  networkId: NetworkId;
  networkSlug: TransitGuideNetworkSlug;
  routes: TransitGuideStationRoute[];
  interchange: boolean;
  wheelchairAccessible: boolean;
  amenities: TransitGuideAmenity[];
};

const TTC_ROUTE_DETAILS: Record<string, Pick<TransitGuideRoute, "slug" | "directionLabel" | "description">> = {
  "line-1": {
    slug: "1-yonge-university",
    directionLabel: "Northbound / Southbound",
    description: "Line 1 connects Vaughan Metropolitan Centre and Finch through the University branch, Union Station, and the Yonge corridor.",
  },
  "line-2": {
    slug: "2-bloor-danforth",
    directionLabel: "Eastbound / Westbound",
    description: "Line 2 crosses Toronto between Kipling and Kennedy along the Bloor-Danforth corridor.",
  },
  "line-4": {
    slug: "4-sheppard",
    directionLabel: "Eastbound / Westbound",
    description: "Line 4 connects Sheppard-Yonge and Don Mills along Sheppard Avenue East.",
  },
  "line-5": {
    slug: "5-eglinton",
    directionLabel: "Eastbound / Westbound",
    description: "LineWatchTO maps Line 5 across the Eglinton corridor from Mount Dennis to Kennedy and labels current information according to source availability.",
  },
  "line-6": {
    slug: "6-finch-west",
    directionLabel: "Eastbound / Westbound",
    description: "LineWatchTO maps Line 6 between Humber College and Finch West and labels current information according to source availability.",
  },
};

const REGIONAL_DIRECTION_LABELS: Record<RegionalRouteCode, string> = {
  BR: "Northbound / Southbound",
  KI: "Eastbound / Westbound",
  LE: "Eastbound / Westbound",
  LW: "Eastbound / Westbound",
  MI: "Eastbound / Westbound",
  RH: "Northbound / Southbound",
  ST: "Northbound / Southbound",
  UP: "Eastbound / Westbound",
};

const TTC_STATION_SLUG_OVERRIDES: Record<string, string> = {
  greenwoood: "greenwood",
  o_connor: "o-connor",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function ttcRouteFromStatus(status: LineStatus): TransitGuideRoute {
  const details = TTC_ROUTE_DETAILS[status.id];
  return {
    id: status.id,
    slug: details.slug,
    number: status.number,
    name: status.name,
    color: status.color,
    textColor: status.id === "line-1" || status.id === "line-6" ? "dark" : "light",
    routeLabel: status.route,
    directionLabel: details.directionLabel,
    description: details.description,
    networkId: "ttc",
    networkSlug: "ttc",
    stationIds: STATION_LINE_STATION_IDS[status.id] ?? [],
  };
}

export const ttcGuideRoutes: TransitGuideRoute[] = lineStatuses.map(ttcRouteFromStatus);

export const regionalGuideRoutes: TransitGuideRoute[] = REGIONAL_ROUTE_DEFINITIONS.map((route) => {
  const stationIds = REGIONAL_ROUTE_STATIONS[route.number];
  const firstStation = regionalStationName(stationIds[0]);
  const lastStation = regionalStationName(stationIds[stationIds.length - 1]);
  return {
    id: route.id,
    slug: slugify(route.name),
    number: route.number,
    name: route.name,
    color: route.color,
    textColor: route.number === "MI" ? "dark" : "light",
    routeLabel: `${firstStation} – ${lastStation}`,
    directionLabel: REGIONAL_DIRECTION_LABELS[route.number],
    description: route.number === "UP"
      ? "UP Express connects Union Station and Pearson Airport, with stops at Bloor, Mount Dennis, and Weston represented on the LineWatchTO regional map."
      : `The ${route.name} corridor connects ${firstStation} with ${lastStation} through the GO rail network represented by LineWatchTO.`,
    networkId: "regional",
    networkSlug: "go-up",
    stationIds,
  };
});

export const allTransitGuideRoutes = [...ttcGuideRoutes, ...regionalGuideRoutes];

const ttcRouteById = new Map(ttcGuideRoutes.map((route) => [route.id, route]));
const regionalRouteById = new Map(regionalGuideRoutes.map((route) => [route.id, route]));

function ttcStationSlug(stationId: string) {
  return TTC_STATION_SLUG_OVERRIDES[stationId] ?? slugify(stationId);
}

function ttcAmenities(station: StationSummary): TransitGuideAmenity[] {
  return [
    { label: "Elevator", available: Boolean(station.hasElevator) },
    { label: "Washroom", available: Boolean(station.hasWashroom) },
    { label: "Parking", available: Boolean(station.hasParking) },
    { label: "Bicycle lockup", available: Boolean(station.hasBicycleLockup) },
    { label: "Bicycle repair", available: Boolean(station.hasBicycleRepair) },
    { label: "Bike Share Toronto", available: Boolean(station.hasBikeShare) },
    { label: "Passenger pick-up/drop-off", available: Boolean(station.hasPpudo) },
  ];
}

export const ttcGuideStations: TransitGuideStation[] = fallbackStationSummaries.stations.map((station) => {
  const detail = fallbackStationDetails[station.id];
  const routes = (detail?.lines ?? [])
    .map((line) => {
      const route = ttcRouteById.get(line.id);
      return route ? {
        ...route,
        wheelchairAccessible: line.wheelchairAccessible,
        hasElevator: line.hasElevator,
      } : null;
    })
    .filter((route): route is TransitGuideStationRoute => route !== null);

  return {
    id: station.id,
    slug: ttcStationSlug(station.id),
    name: station.name,
    networkId: "ttc",
    networkSlug: "ttc",
    routes,
    interchange: routes.length > 1,
    wheelchairAccessible: routes.some((route) => route.wheelchairAccessible),
    amenities: ttcAmenities(station),
  };
});

export const regionalGuideStations: TransitGuideStation[] = regionalStations.map((station) => {
  const routes = (regionalRouteIdsByStation[station.id] ?? [])
    .map((routeId) => regionalRouteById.get(routeId))
    .filter((route): route is TransitGuideRoute => route !== undefined)
    .map((route) => ({
      ...route,
      wheelchairAccessible: isRegionalStationWheelchairAccessible(station.id),
      hasElevator: isRegionalStationElevatorAccessible(station.id),
    }));

  return {
    id: station.id,
    slug: slugify(station.id),
    name: station.name,
    networkId: "regional",
    networkSlug: "go-up",
    routes,
    interchange: routes.length > 1,
    wheelchairAccessible: isRegionalStationWheelchairAccessible(station.id),
    amenities: [
      { label: "Elevator", available: isRegionalStationElevatorAccessible(station.id) },
      { label: "Washroom", available: isRegionalStationWashroomAvailable(station.id) },
      { label: "Parking", available: isRegionalStationParkingAvailable(station.id) },
      { label: "Bicycle lockup", available: isRegionalStationBicycleLockupAvailable(station.id) },
      { label: "Passenger pick-up/drop-off", available: isRegionalStationPpudoAvailable(station.id) },
      { label: "Wi-Fi", available: isRegionalStationWifiAvailable(station.id) },
    ],
  };
});

export const allTransitGuideStations = [...ttcGuideStations, ...regionalGuideStations];

export function findTransitGuideRoute(networkSlug: TransitGuideNetworkSlug, routeSlug: string) {
  const routes = networkSlug === "ttc" ? ttcGuideRoutes : regionalGuideRoutes;
  return routes.find((route) => route.slug === routeSlug);
}

export function findTransitGuideStation(networkSlug: TransitGuideNetworkSlug, stationSlug: string) {
  const stations = networkSlug === "ttc" ? ttcGuideStations : regionalGuideStations;
  return stations.find((station) => station.slug === stationSlug);
}

export function stationGuidePath(station: Pick<TransitGuideStation, "networkSlug" | "slug">) {
  return `/${station.networkSlug}/stations/${station.slug}`;
}

export function routeGuidePath(route: Pick<TransitGuideRoute, "networkSlug" | "slug">) {
  return route.networkSlug === "ttc"
    ? `/ttc/lines/${route.slug}`
    : `/go-up/corridors/${route.slug}`;
}

export function stationsForGuideRoute(route: TransitGuideRoute) {
  const stations = route.networkSlug === "ttc" ? ttcGuideStations : regionalGuideStations;
  const byId = new Map(stations.map((station) => [station.id, station]));
  return route.stationIds
    .map((stationId) => byId.get(stationId))
    .filter((station): station is TransitGuideStation => station !== undefined);
}

export function adjacentStationsForGuideStation(station: TransitGuideStation) {
  return station.routes.map((route) => {
    const links = route.networkSlug === "ttc"
      ? (route.stationIds.slice(0, -1).map((stationId, index) => [stationId, route.stationIds[index + 1]] as const))
      : REGIONAL_ROUTE_LINKS[route.number as RegionalRouteCode];
    const adjacentIds = links.flatMap(([stationAId, stationBId]) => {
      if (stationAId === station.id) return [stationBId];
      if (stationBId === station.id) return [stationAId];
      return [];
    });
    const networkStations = route.networkSlug === "ttc" ? ttcGuideStations : regionalGuideStations;
    const byId = new Map(networkStations.map((candidate) => [candidate.id, candidate]));
    return {
      route,
      stations: [...new Set(adjacentIds)]
        .map((stationId) => byId.get(stationId))
        .filter((candidate): candidate is TransitGuideStation => candidate !== undefined),
    };
  });
}

export function transitGuideSitemapPages() {
  const fixedPages = [
    { path: "/", changeFrequency: "hourly" as const, priority: 1 },
    { path: "/explore", changeFrequency: "monthly" as const, priority: 0.8 },
    { path: "/ttc", changeFrequency: "monthly" as const, priority: 0.9 },
    { path: "/go-up", changeFrequency: "monthly" as const, priority: 0.9 },
    { path: "/ttc/reliability", changeFrequency: "monthly" as const, priority: 0.7 },
    { path: "/go-up/reliability", changeFrequency: "monthly" as const, priority: 0.7 },
  ];
  const routePages = allTransitGuideRoutes.map((route) => ({
    path: routeGuidePath(route),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));
  const stationPages = allTransitGuideStations.map((station) => ({
    path: stationGuidePath(station),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
  return [...fixedPages, ...routePages, ...stationPages];
}

export function stationLineDefinition(lineId: string) {
  return STATION_LINE_DEFINITIONS[lineId];
}
