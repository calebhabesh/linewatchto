export type StationAccessStatus = "normal" | "advisory" | "outage";
export type StationImpactType = "active-alert" | "planned-closure";
export type StationImpactSeverity = "delay" | "suspension" | "planned";

export type StationSummary = {
  id: string;
  name: string;
  mapX: number;
  mapY: number;
  interchange: boolean;
  lineIds: string[];
  hasActiveImpact: boolean;
  accessStatus: StationAccessStatus;
};

export type StationListResponse = {
  generatedAt: string;
  stations: StationSummary[];
};

export type StationLine = {
  id: string;
  number: string;
  name: string;
  color: string;
  platformLabel: string;
};

export type StationAccess = {
  status: StationAccessStatus;
  summary: string;
  updatedAgo: string;
};

export type StationImpact = {
  id: string;
  type: StationImpactType;
  severity: StationImpactSeverity;
  title: string;
  summary: string;
  updatedAgo: string;
  source: string;
};

export type StationArrival = {
  lineId: string;
  direction: string;
  minutes: number;
  label: string;
};

export type StationDetail = {
  id: string;
  name: string;
  mapX: number;
  mapY: number;
  interchange: boolean;
  lines: StationLine[];
  access: StationAccess;
  impacts: StationImpact[];
  arrivals: StationArrival[];
  dataMode: "seeded-demo";
  disclaimer: string;
};

export type StationDataResult<T> = {
  source: "backend" | "fallback";
  data: T;
};

export type StationFetchOptions = {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
};

const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_LINEWATCH_API_BASE_URL ?? "http://localhost:8080";

export const fallbackStationSummaries: StationListResponse = {
  generatedAt: "fallback-demo",
  stations: [
    {
        id: "vaughan-metropolitan-centre",
        name: "Vaughan Metropolitan Centre",
        mapX: 1874,
        mapY: 284,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "spadina",
        name: "Spadina",
        mapX: 3740,
        mapY: 2564,
        interchange: true,
        lineIds: [
            "line-1",
            "line-2"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "st-george",
        name: "St George",
        mapX: 4078,
        mapY: 2602,
        interchange: true,
        lineIds: [
            "line-1",
            "line-2"
        ],
        hasActiveImpact: false,
        accessStatus: "advisory"
    },
    {
        id: "union",
        name: "Union",
        mapX: 4311,
        mapY: 3597,
        interchange: true,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "king",
        name: "King",
        mapX: 4547,
        mapY: 3362,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "bloor-yonge",
        name: "Bloor-Yonge",
        mapX: 4546,
        mapY: 2602,
        interchange: true,
        lineIds: [
            "line-1",
            "line-2"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "eglinton",
        name: "Eglinton",
        mapX: 4547,
        mapY: 1808,
        interchange: true,
        lineIds: [
            "line-1",
            "line-5"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "york-mills",
        name: "York Mills",
        mapX: 4547,
        mapY: 1246,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "sheppard-yonge",
        name: "Sheppard-Yonge",
        mapX: 4546,
        mapY: 1086,
        interchange: true,
        lineIds: [
            "line-1",
            "line-4"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "north-york-centre",
        name: "North York Centre",
        mapX: 4547,
        mapY: 926,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "finch",
        name: "Finch",
        mapX: 4546,
        mapY: 760,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "kipling",
        name: "Kipling",
        mapX: 1076,
        mapY: 2601,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "sherbourne",
        name: "Sherbourne",
        mapX: 4862,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-2"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "castle-frank",
        name: "Castle Frank",
        mapX: 5115,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "kennedy",
        name: "Kennedy",
        mapX: 7346,
        mapY: 1808,
        interchange: true,
        lineIds: [
            "line-2",
            "line-5"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "don-mills",
        name: "Don Mills",
        mapX: 5928,
        mapY: 1084,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "mount-dennis",
        name: "Mount Dennis",
        mapX: 1977,
        mapY: 1804,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "humber-college",
        name: "Humber College",
        mapX: 287,
        mapY: 1157,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "finch-west",
        name: "Finch West",
        mapX: 2510,
        mapY: 840,
        interchange: true,
        lineIds: [
            "line-1",
            "line-6"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "museum",
        name: "Museum",
        mapX: 4077,
        mapY: 2822,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "old-mill",
        name: "Old Mill",
        mapX: 1611,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "islington",
        name: "Islington",
        mapX: 1248,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "royal-york",
        name: "Royal York",
        mapX: 1430,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "jane",
        name: "Jane",
        mapX: 1792,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "runnymede",
        name: "Runnymede",
        mapX: 1973,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "high-park",
        name: "High Park",
        mapX: 2155,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "keele",
        name: "Keele",
        mapX: 2336,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "dundas-west",
        name: "Dundas West",
        mapX: 2518,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "lansdowne",
        name: "Lansdowne",
        mapX: 2699,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "dufferin",
        name: "Dufferin",
        mapX: 2880,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "ossington",
        name: "Ossington",
        mapX: 3062,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "christie",
        name: "Christie",
        mapX: 3243,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "bathurst",
        name: "Bathurst",
        mapX: 3424,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "college",
        name: "College",
        mapX: 4547,
        mapY: 2957,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "bay",
        name: "Bay",
        mapX: 4312,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "broadview",
        name: "Broadview",
        mapX: 5296,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "chester",
        name: "Chester",
        mapX: 5478,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "pape",
        name: "Pape",
        mapX: 5659,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "donlands",
        name: "Donlands",
        mapX: 5840,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "greenwoood",
        name: "Greenwoood",
        mapX: 6022,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "coxwell",
        name: "Coxwell",
        mapX: 6203,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "woodbine",
        name: "Woodbine",
        mapX: 6385,
        mapY: 2603,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "main-street",
        name: "Main Street",
        mapX: 6566,
        mapY: 2600,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "victoria-park",
        name: "Victoria Park",
        mapX: 6830,
        mapY: 2339,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "warden",
        name: "Warden",
        mapX: 7094,
        mapY: 2075,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "queens-park",
        name: "Queens Park",
        mapX: 4077,
        mapY: 2957,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "st-patrick",
        name: "St. Patrick",
        mapX: 4077,
        mapY: 3092,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "osgoode",
        name: "Osgoode",
        mapX: 4076,
        mapY: 3227,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "st-andrew",
        name: "St. Andrew",
        mapX: 4077,
        mapY: 3362,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "queen",
        name: "Queen",
        mapX: 4547,
        mapY: 3227,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "tmu",
        name: "TMU",
        mapX: 4547,
        mapY: 3092,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "wellesley",
        name: "Wellesley",
        mapX: 4547,
        mapY: 2821,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "rosedale",
        name: "Rosedale",
        mapX: 4546,
        mapY: 2409,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "summerhill",
        name: "Summerhill",
        mapX: 4547,
        mapY: 2274,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "st-clair",
        name: "St. Clair",
        mapX: 4547,
        mapY: 2139,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "davisville",
        name: "Davisville",
        mapX: 4547,
        mapY: 2005,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "mount-pleasant",
        name: "Mount Pleasant",
        mapX: 4862,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "lawrence",
        name: "Lawrence",
        mapX: 4548,
        mapY: 1516,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "bayview",
        name: "Bayview",
        mapX: 4893,
        mapY: 1086,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "bessarion",
        name: "Bessarion",
        mapX: 5239,
        mapY: 1086,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "leslie",
        name: "Leslie",
        mapX: 5585,
        mapY: 1086,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "leaside",
        name: "Leaside",
        mapX: 5034,
        mapY: 1811,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "laird",
        name: "Laird",
        mapX: 5205,
        mapY: 1811,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "sunnybrook-park",
        name: "Sunnybrook Park",
        mapX: 5377,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "don-valley",
        name: "Don Valley",
        mapX: 5549,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "wynford",
        name: "Wynford",
        mapX: 5892,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "sloane",
        name: "Sloane",
        mapX: 6064,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "pharmacy",
        name: "Pharmacy",
        mapX: 6407,
        mapY: 1811,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "hakimi-lebovic",
        name: "Hakimi Lebovic",
        mapX: 6579,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "golden-mile",
        name: "Golden Mile",
        mapX: 6750,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "birchmount",
        name: "Birchmount",
        mapX: 6922,
        mapY: 1811,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "ionview",
        name: "Ionview",
        mapX: 7094,
        mapY: 1811,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "dupont",
        name: "Dupont",
        mapX: 3734,
        mapY: 2274,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "st-clair-west",
        name: "St. Clair West",
        mapX: 3506,
        mapY: 2139,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "avenue",
        name: "Avenue",
        mapX: 4199,
        mapY: 1811,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "chaplin",
        name: "Chaplin",
        mapX: 3853,
        mapY: 1811,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "forest-hill",
        name: "Forest Hill",
        mapX: 3506,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "oakwood",
        name: "Oakwood",
        mapX: 2701,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "fairbank",
        name: "Fairbank",
        mapX: 2519,
        mapY: 1811,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "caledonia",
        name: "Caledonia",
        mapX: 2337,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "keelesdale",
        name: "Keelesdale",
        mapX: 2156,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "glencairn",
        name: "Glencairn",
        mapX: 2937,
        mapY: 1651,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "lawrence-west",
        name: "Lawrence West",
        mapX: 2937,
        mapY: 1516,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "yorkdale",
        name: "Yorkdale",
        mapX: 2937,
        mapY: 1381,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "wilson",
        name: "Wilson",
        mapX: 2936,
        mapY: 1246,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "sheppard-west",
        name: "Sheppard West",
        mapX: 2931,
        mapY: 1086,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "sentinel",
        name: "Sentinel",
        mapX: 2436,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "york-university",
        name: "York University",
        mapX: 2299,
        mapY: 718,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "pioneer-village",
        name: "Pioneer Village",
        mapX: 2086,
        mapY: 595,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "highway-407",
        name: "Highway 407",
        mapX: 1876,
        mapY: 467,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "tobermory",
        name: "Tobermory",
        mapX: 2306,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "driftwood",
        name: "Driftwood",
        mapX: 2172,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "jane-and-finch",
        name: "Jane And Finch",
        mapX: 2037,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "norfinch-oakdale",
        name: "Norfinch Oakdale",
        mapX: 1903,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "signet-arrow",
        name: "Signet Arrow",
        mapX: 1768,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "emery",
        name: "Emery",
        mapX: 1634,
        mapY: 964,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "milvan-rumike",
        name: "Milvan Rumike",
        mapX: 1499,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "duncanwoods",
        name: "Duncanwoods",
        mapX: 1365,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "pearldale",
        name: "Pearldale",
        mapX: 1231,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "rowntree-mills",
        name: "Rowntree Mills",
        mapX: 1096,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "mount-olive",
        name: "Mount Olive",
        mapX: 961,
        mapY: 964,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "stevenson",
        name: "Stevenson",
        mapX: 827,
        mapY: 964,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "albion",
        name: "Albion",
        mapX: 693,
        mapY: 964,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "martin-grove",
        name: "Martin Grove",
        mapX: 558,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "westmore",
        name: "Westmore",
        mapX: 424,
        mapY: 963,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "downsview-park",
        name: "Downsview Park",
        mapX: 2724,
        mapY: 964,
        interchange: false,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "cedarvale",
        name: "Cedarvale",
        mapX: 2936,
        mapY: 1802,
        interchange: true,
        lineIds: [
            "line-1"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "aga-khan-park-and-museum",
        name: "Aga Khan Park & Museum",
        mapX: 5720,
        mapY: 1810,
        interchange: false,
        lineIds: [
            "line-5"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    },
    {
        id: "o_connor",
        name: "O'Connor",
        mapX: 6236,
        mapY: 1811,
        interchange: false,
        lineIds: [
            "line-5"
        ],
        hasActiveImpact: false,
        accessStatus: "normal"
    }
]
};

export const fallbackStationDetails: Record<string, StationDetail> = {
  union: {
    id: "union",
    name: "Union",
    mapX: 4311,
    mapY: 3597,
    interchange: true,
    lines: [
      {
        id: "line-1",
        number: "1",
        name: "Yonge-University",
        color: "#f4c430",
        platformLabel: "Northbound / Southbound",
      },
    ],
    access: {
      status: "normal",
      summary: "No station access advisories in fallback demo data.",
      updatedAgo: "Fallback fixture",
    },
    impacts: [],
    arrivals: [
      { lineId: "line-1", direction: "Northbound", minutes: 2, label: "Demo arrival" },
      { lineId: "line-1", direction: "Southbound", minutes: 5, label: "Demo arrival" },
    ],
    dataMode: "seeded-demo",
    disclaimer: "Station details use fallback demo data. Arrivals are demo placeholders, not live TTC predictions.",
  },
  "st-george": {
    id: "st-george",
    name: "St George",
    mapX: 4078,
    mapY: 2602,
    interchange: true,
    lines: [
      { id: "line-1", number: "1", name: "Yonge-University", color: "#f4c430", platformLabel: "Northbound / Southbound" },
      { id: "line-2", number: "2", name: "Bloor-Danforth", color: "#14a44d", platformLabel: "Eastbound / Westbound" },
    ],
    access: {
      status: "advisory",
      summary: "One elevator advisory is included as fallback demo data.",
      updatedAgo: "Fallback fixture",
    },
    impacts: [],
    arrivals: [
      { lineId: "line-1", direction: "Northbound", minutes: 3, label: "Demo arrival" },
      { lineId: "line-2", direction: "Eastbound", minutes: 4, label: "Demo arrival" },
    ],
    dataMode: "seeded-demo",
    disclaimer: "Station details use fallback demo data. Arrivals are demo placeholders, not live TTC predictions.",
  },
  eglinton: {
    id: "eglinton",
    name: "Eglinton",
    mapX: 4547,
    mapY: 1808,
    interchange: true,
    lines: [
      { id: "line-1", number: "1", name: "Yonge-University", color: "#f4c430", platformLabel: "Northbound / Southbound" },
      { id: "line-5", number: "5", name: "Eglinton Crosstown", color: "#f57c00", platformLabel: "Eastbound / Westbound" },
    ],
    access: {
      status: "normal",
      summary: "No station access advisories in fallback demo data.",
      updatedAgo: "Fallback fixture",
    },
    impacts: [],
    arrivals: [
      { lineId: "line-1", direction: "Southbound", minutes: 6, label: "Demo arrival" },
      { lineId: "line-5", direction: "Eastbound", minutes: 8, label: "Demo arrival" },
    ],
    dataMode: "seeded-demo",
    disclaimer: "Station details use fallback demo data. Arrivals are demo placeholders, not live TTC predictions.",
  },
  sherbourne: {
    id: "sherbourne",
    name: "Sherbourne",
    mapX: 4862,
    mapY: 2603,
    interchange: false,
    lines: [
      { id: "line-2", number: "2", name: "Bloor-Danforth", color: "#14a44d", platformLabel: "Eastbound / Westbound" },
    ],
    access: {
      status: "normal",
      summary: "No station access advisories in fallback demo data.",
      updatedAgo: "Fallback fixture",
    },
    impacts: [],
    arrivals: [
      { lineId: "line-2", direction: "Eastbound", minutes: 4, label: "Demo arrival" },
      { lineId: "line-2", direction: "Westbound", minutes: 7, label: "Demo arrival" },
    ],
    dataMode: "seeded-demo",
    disclaimer: "Station details use fallback demo data. Arrivals are demo placeholders, not live TTC predictions.",
  },
};

export async function getStationSummaries(
  options: StationFetchOptions = {}
): Promise<StationDataResult<StationListResponse>> {
  const fetcher = options.fetcher ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;

  try {
    const response = await fetcher(`${apiBaseUrl}/api/stations`);
    if (!response.ok) {
      throw new Error(`Station summaries request failed with ${response.status}`);
    }

    return { source: "backend", data: (await response.json()) as StationListResponse };
  } catch {
    return { source: "fallback", data: fallbackStationSummaries };
  }
}

export async function getStationDetail(
  id: string,
  options: StationFetchOptions = {}
): Promise<StationDataResult<StationDetail | null>> {
  const fetcher = options.fetcher ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;

  try {
    const response = await fetcher(`${apiBaseUrl}/api/stations/${encodeURIComponent(id)}`);
    if (response.status === 404) {
      return { source: "backend", data: null };
    }
    if (!response.ok) {
      throw new Error(`Station detail request failed with ${response.status}`);
    }

    return { source: "backend", data: (await response.json()) as StationDetail };
  } catch {
    return { source: "fallback", data: fallbackStationDetails[id] ?? null };
  }
}
