const DEFAULT_NOW = "2026-06-03T15:00:00.000Z";
const SENTINEL_END = "0001-01-01T00:00:00Z";

export const scenarioNames = [
  "all-alert-types",
  "nonlinear-union-curve",
  "nonlinear-st-george-spadina",
  "long-mixed-line-1-rsz",
  "line-5-suspension",
  "nightly-closure-active-window",
  "station-node-impact",
];

export const scenarioExpectations = {
  "all-alert-types": {
    routeCount: 7,
    accessibilityCount: 1,
    impactKinds: ["suspension", "delay", "reduced-speed-zone", "planned-closure"],
    guidePathIds: ["seg-line-1-st-andrew-union", "seg-line-1-dupont-spadina"],
  },
  "nonlinear-union-curve": {
    routeCount: 3,
    accessibilityCount: 0,
    impactKinds: ["suspension", "reduced-speed-zone"],
    guidePathIds: ["seg-line-1-union-king", "seg-line-1-st-andrew-union"],
  },
  "nonlinear-st-george-spadina": {
    routeCount: 2,
    accessibilityCount: 0,
    impactKinds: ["delay", "reduced-speed-zone"],
    guidePathIds: ["seg-line-1-spadina-st-george", "seg-line-1-dupont-spadina"],
  },
  "long-mixed-line-1-rsz": {
    routeCount: 2,
    accessibilityCount: 0,
    impactKinds: ["reduced-speed-zone"],
    guidePathIds: [
      "seg-line-1-dupont-spadina",
      "seg-line-1-spadina-st-george",
      "seg-line-1-st-andrew-union",
      "seg-line-1-union-king",
    ],
  },
  "line-5-suspension": {
    routeCount: 1,
    accessibilityCount: 0,
    impactKinds: ["suspension"],
    guidePathIds: [],
  },
  "nightly-closure-active-window": {
    routeCount: 1,
    accessibilityCount: 0,
    impactKinds: ["planned-closure"],
    guidePathIds: [],
  },
  "station-node-impact": {
    routeCount: 1,
    accessibilityCount: 0,
    impactKinds: ["delay"],
    guidePathIds: [],
  },
};

function dateFrom(value) {
  return value instanceof Date ? value : new Date(value);
}

function iso(now, offsetMinutes) {
  return new Date(dateFrom(now).getTime() + offsetMinutes * 60_000).toISOString();
}

function currentPeriod(now, startOffset = -30) {
  return { start: iso(now, startOffset), end: SENTINEL_END };
}

function finitePeriod(now, startOffset, endOffset) {
  return { start: iso(now, startOffset), end: iso(now, endOffset) };
}

function routeAlert(now, overrides) {
  const line = overrides.route ?? "1";
  const title = overrides.title ?? "LineWatch scenario alert";
  return {
    id: overrides.id,
    priority: 0,
    alertType: overrides.alertType ?? "Live",
    lastUpdated: iso(now, overrides.updatedOffset ?? -5),
    activePeriod: overrides.activePeriod ?? currentPeriod(now),
    activePeriodGroup: overrides.activePeriodGroup ?? ["Current"],
    routeOrder: Number(line),
    route: line,
    routeBranch: "",
    routeTypeSrc: "400",
    routeType: overrides.routeType ?? "Subway",
    stopStart: overrides.stopStart,
    stopEnd: overrides.stopEnd,
    stopStartId: null,
    stopEndId: null,
    stops: overrides.stops ?? [],
    title,
    description: overrides.description ?? "",
    url: overrides.url ?? "",
    urlPlaceholder: "",
    accessibility: "Routes",
    effect: overrides.effect,
    effectDesc: overrides.effectDesc,
    severityOrder: overrides.severityOrder ?? 1,
    severity: overrides.severity ?? "Critical",
    customHeaderText: null,
    headerText: overrides.headerText ?? `Line ${line}: ${title}`,
    direction: overrides.direction ?? "Both ways",
    cause: overrides.cause ?? null,
    causeDescription: overrides.causeDescription ?? null,
    stopIDList: overrides.stopIDList ?? [overrides.stopStart, overrides.stopEnd],
    stopNameList: [],
    stopRouteList: [],
    rszLength: overrides.rszLength ?? null,
    distance: overrides.distance ?? null,
    trackPercent: overrides.trackPercent ?? null,
    reducedSpeed: overrides.reducedSpeed ?? null,
    averageSpeed: overrides.averageSpeed ?? null,
    targetRemoval: overrides.targetRemoval ?? null,
    shuttleType: overrides.shuttleType ?? null,
    shuttleStart: overrides.shuttleStart ?? null,
    shuttleEnd: overrides.shuttleEnd ?? null,
    elevatorCode: null,
    escalatorCode: null,
    criticality: 0,
    childAlerts: overrides.childAlerts ?? [],
  };
}

function accessibilityAlert(now, overrides) {
  const title = overrides.title ?? "Elevator outage";
  return {
    id: overrides.id,
    priority: 0,
    alertType: "Live",
    lastUpdated: iso(now, overrides.updatedOffset ?? -5),
    activePeriod: currentPeriod(now),
    activePeriodGroup: ["Current"],
    routeOrder: 0,
    route: null,
    routeBranch: "",
    routeTypeSrc: "",
    routeType: overrides.routeType,
    stopStart: null,
    stopEnd: null,
    stopStartId: null,
    stopEndId: null,
    stops: [],
    title,
    description: overrides.description ?? "",
    url: "",
    urlPlaceholder: "",
    accessibility: "Accessibility",
    effect: "ACCESSIBILITY_ISSUE",
    effectDesc: "Out of service",
    severityOrder: 2,
    severity: "Moderate",
    customHeaderText: null,
    headerText: overrides.headerText,
    direction: null,
    cause: overrides.cause ?? "MAINTENANCE",
    causeDescription: overrides.causeDescription ?? "Technical issue",
    stopIDList: [],
    stopNameList: [],
    stopRouteList: [],
    rszLength: null,
    distance: null,
    trackPercent: null,
    reducedSpeed: null,
    averageSpeed: null,
    targetRemoval: null,
    shuttleType: null,
    shuttleStart: null,
    shuttleEnd: null,
    elevatorCode: overrides.elevatorCode ?? null,
    escalatorCode: overrides.escalatorCode ?? null,
    criticality: 0,
    childAlerts: [],
  };
}

function feed(now, routes, accessibility = []) {
  return {
    lastUpdated: iso(now, -1),
    total: routes.length + accessibility.length,
    routes,
    accessibility,
  };
}

function allAlertTypes(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-active-line-2",
      route: "2",
      stopStart: "Broadview",
      stopEnd: "Woodbine",
      stopIDList: ["Broadview", "Chester", "Pape", "Donlands", "Greenwood", "Coxwell", "Woodbine"],
      title: "No service between Broadview and Woodbine stations while we respond to a medical emergency. Shuttle buses are on the way.",
      headerText: "Line 2 Bloor-Danforth: No service between Broadview and Woodbine stations while we respond to a medical emergency. Shuttle buses are on the way.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Both ways",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Medical emergency",
      shuttleType: "Ordered",
      shuttleStart: "Broadview",
      shuttleEnd: "Woodbine",
    }),
    routeAlert(now, {
      id: "scenario-active-line-1-st-andrew-union",
      route: "1",
      stopStart: "St Andrew",
      stopEnd: "Union",
      stopIDList: ["St Andrew", "Union"],
      title: "No service between St Andrew and Union stations while we respond to a security incident.",
      headerText: "Line 1 Yonge-University: No service between St Andrew and Union stations while we respond to a security incident.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Both ways",
      cause: "SECURITY_INCIDENT",
      causeDescription: "Security incident",
      shuttleType: "Ordered",
      shuttleStart: "St Andrew",
      shuttleEnd: "Union",
    }),
    routeAlert(now, {
      id: "scenario-delay-line-4",
      route: "4",
      stopStart: "Sheppard-Yonge",
      stopEnd: "Don Mills",
      title: "Delays eastbound between Sheppard-Yonge and Don Mills while we respond to a signal problem.",
      headerText: "Line 4 Sheppard: Delays eastbound between Sheppard-Yonge and Don Mills while we respond to a signal problem.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Eastbound",
      cause: "SIGNALS",
      causeDescription: "Signal problem",
    }),
    routeAlert(now, {
      id: "scenario-delay-line-1-dupont-spadina",
      route: "1",
      stopStart: "Dupont",
      stopEnd: "Spadina",
      stopIDList: ["Dupont", "Spadina"],
      title: "Delays southbound from Dupont to Spadina while we respond to an operational problem.",
      headerText: "Line 1 Yonge-University: Delays southbound from Dupont to Spadina while we respond to an operational problem.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Southbound",
      cause: "OPERATIONS",
      causeDescription: "Operational problem",
    }),
    routeAlert(now, {
      id: "scenario-station-node-keele",
      route: "2",
      stopStart: "Keele",
      stopEnd: "Keele",
      stopIDList: ["Keele"],
      title: "Delays westbound at Keele station while we respond to an emergency alarm.",
      headerText: "Line 2 Bloor-Danforth: Delays westbound at Keele station while we respond to an emergency alarm.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Westbound",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Emergency alarm",
    }),
    routeAlert(now, {
      id: "scenario-rsz-line-1-south",
      route: "1",
      stopStart: "Eglinton",
      stopEnd: "Davisville",
      stopIDList: ["Eglinton", "Davisville"],
      title: "Synthetic scenario: reduced speed southbound between Eglinton and Davisville.",
      headerText: "Line 1 Yonge-University: Synthetic scenario: reduced speed southbound between Eglinton and Davisville.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: "Southbound",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "600 metres",
      distance: "900 metres",
      trackPercent: "67%",
      reducedSpeed: "15 km/h",
      averageSpeed: "35 km/h",
      targetRemoval: "Mid-June",
    }),
    routeAlert(now, {
      id: "scenario-planned-line-1-nightly",
      alertType: "Planned",
      route: "1",
      stopStart: "St George",
      stopEnd: "Sheppard West",
      stopIDList: ["St George", "Spadina", "Dupont", "St Clair West", "Cedarvale", "Glencairn", "Lawrence West", "Yorkdale", "Wilson", "Sheppard West"],
      title: "There will be no subway service between St George and Sheppard West stations nightly due to planned track work. Shuttle buses will operate.",
      headerText: "Line 1 Yonge-University: There will be no subway service between St George and Sheppard West stations nightly due to planned track work. Shuttle buses will operate.",
      effect: "REDUCED_SERVICE",
      effectDesc: "Subway Closure - Early Access",
      direction: "Both ways",
      cause: "MAINTENANCE",
      causeDescription: "CLOSURE - Planned Track Work",
      activePeriod: finitePeriod(now, -120, 720),
      activePeriodGroup: ["Current", "Weekend"],
      shuttleType: "Will Operate",
      shuttleStart: "St George",
      shuttleEnd: "Sheppard West",
      childAlerts: [
        { id: "scenario-planned-line-1-window-active", startTime: iso(now, -30), endTime: iso(now, 90) },
        { id: "scenario-planned-line-1-window-future", startTime: iso(now, 360), endTime: iso(now, 480) },
      ],
    }),
  ], [
    accessibilityAlert(now, {
      id: "scenario-elevator-warden",
      routeType: "Elevator",
      title: "Synthetic scenario: elevator TEST-E1 is out of service at Warden.",
      headerText: "Warden: Synthetic scenario: elevator TEST-E1 is out of service at Warden.",
      elevatorCode: "TEST-E1",
      causeDescription: "Maintenance",
    }),
  ]);
}

function nonlinearUnionCurve(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-rsz-union-king-south",
      route: "1",
      stopStart: "King",
      stopEnd: "Union",
      title: "Subway trains will move slower than usual southbound from King to Union stations.",
      headerText: "Line 1 Yonge-University: Subway trains will move slower than usual southbound from King to Union stations.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: "Southbound",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "250 metres",
      reducedSpeed: "15 km/h",
      targetRemoval: "This week",
    }),
    routeAlert(now, {
      id: "scenario-rsz-union-king-north",
      route: "1",
      stopStart: "Union",
      stopEnd: "King",
      title: "Subway trains will move slower than usual northbound from Union to King stations.",
      headerText: "Line 1 Yonge-University: Subway trains will move slower than usual northbound from Union to King stations.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: "Northbound",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "250 metres",
      reducedSpeed: "15 km/h",
      targetRemoval: "This week",
    }),
    routeAlert(now, {
      id: "scenario-suspension-st-andrew-union",
      route: "1",
      stopStart: "St Andrew",
      stopEnd: "Union",
      title: "No service between St Andrew and Union stations while we respond to a security incident.",
      headerText: "Line 1 Yonge-University: No service between St Andrew and Union stations while we respond to a security incident.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Both ways",
      cause: "SECURITY_INCIDENT",
      causeDescription: "Security incident",
      shuttleType: "Ordered",
      shuttleStart: "St Andrew",
      shuttleEnd: "Union",
    }),
  ]);
}

function nonlinearStGeorgeSpadina(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-rsz-spadina-st-george",
      route: "1",
      stopStart: "Spadina",
      stopEnd: "St George",
      title: "Subway trains will move slower than usual southbound from Spadina to St George stations.",
      headerText: "Line 1 Yonge-University: Subway trains will move slower than usual southbound from Spadina to St George stations.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: "Southbound",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "180 metres",
      reducedSpeed: "15 km/h",
    }),
    routeAlert(now, {
      id: "scenario-delay-dupont-spadina",
      route: "1",
      stopStart: "Dupont",
      stopEnd: "Spadina",
      title: "Delays southbound from Dupont to Spadina while we respond to an operational problem.",
      headerText: "Line 1 Yonge-University: Delays southbound from Dupont to Spadina while we respond to an operational problem.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Southbound",
      cause: "OPERATIONS",
      causeDescription: "Operational problem",
    }),
  ]);
}

function longMixedLine1Rsz(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-rsz-dupont-museum-long",
      route: "1",
      stopStart: "Dupont",
      stopEnd: "Museum",
      stopIDList: ["Dupont", "Spadina", "St George", "Museum"],
      title: "Subway trains will move slower than usual southbound from Dupont to Museum stations.",
      headerText: "Line 1 Yonge-University: Subway trains will move slower than usual southbound from Dupont to Museum stations.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: "Southbound",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "700 metres",
      reducedSpeed: "15 km/h",
      targetRemoval: "This week",
    }),
    routeAlert(now, {
      id: "scenario-rsz-queens-park-dundas-long",
      route: "1",
      stopStart: "Queens Park",
      stopEnd: "Dundas",
      stopIDList: ["Queens Park", "St Patrick", "Osgoode", "St Andrew", "Union", "King", "Queen", "Dundas"],
      title: "Subway trains will move slower than usual both ways from Queens Park to Dundas stations.",
      headerText: "Line 1 Yonge-University: Subway trains will move slower than usual both ways from Queens Park to Dundas stations.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: "Both ways",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "1.8 kilometres",
      reducedSpeed: "15 km/h",
      targetRemoval: "This week",
    }),
  ]);
}

function line5Suspension(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-line-5-avenue-leaside",
      route: "5",
      routeType: "LRT",
      stopStart: "Avenue",
      stopEnd: "Leaside",
      stopIDList: ["Avenue", "Eglinton", "Mount Pleasant", "Leaside"],
      title: "No service between Avenue and Leaside stations due to an emergency alarm. Shuttle buses are on the way.",
      headerText: "Line 5 Eglinton: No service between Avenue and Leaside stations due to an emergency alarm. Shuttle buses are on the way.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Both ways",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "LRT - Emergency alarm",
      shuttleType: "Ordered",
      shuttleStart: "Avenue",
      shuttleEnd: "Leaside",
    }),
  ]);
}

function nightlyClosureActiveWindow(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-nightly-active-line-1",
      alertType: "Planned",
      route: "1",
      stopStart: "St George",
      stopEnd: "Sheppard West",
      stopIDList: ["St George", "Spadina", "Dupont", "St Clair West", "Cedarvale", "Glencairn", "Lawrence West", "Yorkdale", "Wilson", "Sheppard West"],
      title: "There will be no subway service between St George and Sheppard West stations during nightly closure windows for planned track work.",
      headerText: "Line 1 Yonge-University: There will be no subway service between St George and Sheppard West stations during nightly closure windows for planned track work.",
      effect: "REDUCED_SERVICE",
      effectDesc: "Subway Closure - Early Access",
      direction: "Both ways",
      cause: "MAINTENANCE",
      causeDescription: "CLOSURE - Planned Track Work",
      activePeriod: finitePeriod(now, -180, 600),
      activePeriodGroup: ["Current", "Weekend"],
      shuttleType: "Will Operate",
      shuttleStart: "St George",
      shuttleEnd: "Sheppard West",
      childAlerts: [
        { id: "scenario-nightly-window-active", startTime: iso(now, -20), endTime: iso(now, 70) },
        { id: "scenario-nightly-window-next", startTime: iso(now, 240), endTime: iso(now, 330) },
      ],
    }),
  ]);
}

function stationNodeImpact(now) {
  return feed(now, [
    routeAlert(now, {
      id: "scenario-station-node-keele",
      route: "2",
      stopStart: "Keele",
      stopEnd: "Keele",
      stopIDList: ["Keele"],
      title: "Delays westbound at Keele station while we respond to an emergency alarm.",
      headerText: "Line 2 Bloor-Danforth: Delays westbound at Keele station while we respond to an emergency alarm.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Westbound",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Emergency alarm",
    }),
  ]);
}

export function buildScenarioFeed(name, options = {}) {
  const now = dateFrom(options.now ?? DEFAULT_NOW);
  switch (name) {
    case "all-alert-types":
      return allAlertTypes(now);
    case "nonlinear-union-curve":
      return nonlinearUnionCurve(now);
    case "nonlinear-st-george-spadina":
      return nonlinearStGeorgeSpadina(now);
    case "long-mixed-line-1-rsz":
      return longMixedLine1Rsz(now);
    case "line-5-suspension":
      return line5Suspension(now);
    case "nightly-closure-active-window":
      return nightlyClosureActiveWindow(now);
    case "station-node-impact":
      return stationNodeImpact(now);
    default:
      throw new Error(`Unknown LineWatch alert scenario: ${name}`);
  }
}
