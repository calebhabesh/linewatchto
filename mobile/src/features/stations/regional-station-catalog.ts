export type RegionalRouteDefinition = {
  id: string;
  number: string;
  name: string;
  color: string;
};

export const REGIONAL_ROUTES: Record<string, RegionalRouteDefinition> = {
  BR: { id: "regional-br", number: "BR", name: "Barrie", color: "#155ba0" },
  KI: { id: "regional-ki", number: "KI", name: "Kitchener", color: "#138336" },
  LE: { id: "regional-le", number: "LE", name: "Lakeshore East", color: "#ee2722" },
  LW: { id: "regional-lw", number: "LW", name: "Lakeshore West", color: "#8b0a31" },
  MI: { id: "regional-mi", number: "MI", name: "Milton", color: "#f47216" },
  RH: { id: "regional-rh", number: "RH", name: "Richmond Hill", color: "#27adea" },
  ST: { id: "regional-st", number: "ST", name: "Stouffville", color: "#774111" },
  UP: { id: "regional-up", number: "UP", name: "UP Express", color: "#4084cd" },
};

export const REGIONAL_ROUTE_STATIONS: Record<string, readonly string[]> = {
  BR: ["union", "downsview-park", "rutherford", "maple", "king-city", "aurora", "newmarket", "east-gwillimbury", "bradford", "barrie-south", "allandale-waterfront"],
  KI: ["union", "bloor", "mount-dennis", "weston", "etobicoke-north", "malton", "bramalea", "brampton-innovation-district", "mount-pleasant", "georgetown", "acton", "guelph-central", "kitchener", "stratford"],
  LE: ["union", "danforth", "scarborough", "eglinton", "guildwood", "rouge-hill", "pickering", "ajax", "whitby", "durham-college-oshawa"],
  LW: ["union", "exhibition", "mimico", "long-branch", "port-credit", "clarkson", "oakville", "bronte", "appleby", "burlington", "aldershot", "west-harbour", "hamilton", "confederation", "st-catharines", "niagara-falls"],
  MI: ["union", "kipling", "dixie", "cooksville", "erindale", "streetsville", "meadowvale", "lisgar", "milton"],
  RH: ["union", "oriole", "old-cummer", "langstaff", "richmond-hill", "gormley", "bloomington"],
  ST: ["union", "kennedy", "agincourt", "milliken", "unionville", "centennial", "markham", "mount-joy", "stouffville", "old-elm"],
  UP: ["union", "bloor", "mount-dennis", "weston", "pearson-airport"],
};

export function getRegionalLinesForStation(stationId: string): RegionalRouteDefinition[] {
  const matching: RegionalRouteDefinition[] = [];
  for (const [code, stations] of Object.entries(REGIONAL_ROUTE_STATIONS)) {
    if (stations.includes(stationId)) {
      const def = REGIONAL_ROUTES[code];
      if (def) matching.push(def);
    }
  }
  return matching;
}

export function formatArrivalClockTime(isoString: string | null | undefined): string | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Toronto",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return null;
  }
}
