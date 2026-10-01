import {
  MODELED_GAP_FILL_SOURCE_KIND,
  SYNTHETIC_TEMPLATE_SOURCE_KIND,
  alertScenarioTemplates,
} from "./alert-scenario-templates.mjs";

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
  "limited-service-active-window",
];

export const scenarioExpectations = {
  "all-alert-types": {
    routeCount: 24,
    accessibilityCount: 2,
    impactKinds: ["suspension", "delay", "reduced-speed-zone", "planned-closure"],
    directionCoverage: {
      "delay": ["bidirectional", "directional"],
      "planned-closure": ["bidirectional", "directional"],
      "reduced-speed-zone": ["bidirectional", "directional", "unknown"],
      "suspension": ["bidirectional", "directional"],
    },
    stationAlertAssetTypes: ["elevator", "escalator"],
    sourceKinds: [MODELED_GAP_FILL_SOURCE_KIND, SYNTHETIC_TEMPLATE_SOURCE_KIND],
    coverageMatrix: {
      "suspension-bidirectional-segment": {
        sourceId: "scenario-active-line-2",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-rsz-line-1",
      },
      "suspension-directional-segment": {
        sourceId: "scenario-active-line-1-king-union",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-rsz-line-1",
      },
      "suspension-four-way-junction-station-line-1": {
        sourceId: "scenario-station-node-bloor-yonge-line-1",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-rsz-line-1",
      },
      "suspension-four-way-junction-station-line-2": {
        sourceId: "scenario-station-node-bloor-yonge-line-2",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-rsz-line-1",
      },
      "delay-bidirectional-segment": {
        sourceId: "scenario-delay-line-2-main-street-kennedy",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-rsz-line-1",
      },
      "delay-directional-segment": {
        sourceId: "scenario-delay-line-1-union-st-andrew",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-rsz-line-1",
      },
      "delay-directional-station": {
        sourceId: "scenario-station-node-keele",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-rsz-line-1",
      },
      "delay-bidirectional-station": {
        sourceId: "scenario-station-node-dundas-west-bidirectional",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-rsz-line-1",
      },
      "delay-multi-dot-interchange-station": {
        sourceId: "scenario-station-node-spadina",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-rsz-line-1",
      },
      "reduced-speed-zone-directional": {
        sourceId: "synthetic-rsz-line-1",
        sourceKind: SYNTHETIC_TEMPLATE_SOURCE_KIND,
      },
      "reduced-speed-zone-bidirectional": {
        sourceId: "scenario-rsz-line-2-jane-runnymede",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-rsz-line-1",
      },
      "reduced-speed-zone-directionless": {
        sourceId: "scenario-rsz-line-1-wilson-yorkdale-directionless",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-rsz-line-1",
      },
      "planned-closure-bidirectional-static": {
        sourceId: "synthetic-planned-line-1",
        sourceKind: SYNTHETIC_TEMPLATE_SOURCE_KIND,
      },
      "planned-closure-directional-moving": {
        sourceId: "scenario-planned-line-1-northbound-early-access",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-planned-line-1",
      },
      "planned-closure-long-upcoming": {
        sourceId: "scenario-planned-line-2-long-upcoming",
        sourceKind: MODELED_GAP_FILL_SOURCE_KIND,
        modeledFromSourceId: "synthetic-planned-line-1",
      },
      "accessibility-elevator": {
        sourceId: "synthetic-elevator-warden",
        sourceKind: SYNTHETIC_TEMPLATE_SOURCE_KIND,
      },
      "accessibility-escalator": {
        sourceId: "synthetic-escalator-pioneer-village",
        sourceKind: SYNTHETIC_TEMPLATE_SOURCE_KIND,
      },
    },
    guidePathIds: ["seg-line-1-st-andrew-union", "seg-line-1-union-king"],
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
    guidePathIds: ["seg-line-1-st-george-spadina"],
  },
  "long-mixed-line-1-rsz": {
    routeCount: 2,
    accessibilityCount: 0,
    impactKinds: ["reduced-speed-zone"],
    guidePathIds: [
      "seg-line-1-st-george-spadina",
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
  "limited-service-active-window": {
    routeCount: 2, accessibilityCount: 0, impactKinds: ["limited-service"], guidePathIds: [],
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rebaseRecord(now, record, options = {}) {
  const next = clone(record);
  next.lastUpdated = iso(now, options.updatedOffset ?? -5);
  next.activePeriod = options.activePeriod ?? currentPeriod(now, options.startOffset ?? -30);
  next.activePeriodGroup = options.activePeriodGroup ?? next.activePeriodGroup ?? ["Current"];
  if (Object.prototype.hasOwnProperty.call(options, "childAlerts")) {
    next.childAlerts = options.childAlerts;
  } else if (Array.isArray(next.childAlerts) && next.childAlerts.length > 0) {
    next.childAlerts = next.childAlerts.map((child, index) => ({
      ...child,
      startTime: iso(now, index === 0 ? -20 : 240),
      endTime: iso(now, index === 0 ? 70 : 330),
    }));
  }
  return next;
}

function templateRoute(now, bookmarkKey, overrides = {}, rebaseOptions = {}) {
  return rebaseRecord(
    now,
    { ...alertScenarioTemplates.routes[bookmarkKey], ...overrides },
    rebaseOptions,
  );
}

function modeledRoute(now, bookmarkKey, overrides = {}, rebaseOptions = {}) {
  return templateRoute(now, bookmarkKey, overrides, rebaseOptions);
}

function templateAccessibility(now, bookmarkKey, overrides = {}, rebaseOptions = {}) {
  return rebaseRecord(
    now,
    { ...alertScenarioTemplates.accessibility[bookmarkKey], ...overrides },
    rebaseOptions,
  );
}

function routeAlert(now, overrides) {
  const line = overrides.route ?? "1";
  const title = overrides.title ?? "LineWatch scenario alert";
  const hasDirectionOverride = Object.prototype.hasOwnProperty.call(overrides, "direction");
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
    direction: hasDirectionOverride ? overrides.direction : "Both ways",
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

function activeGapFillRoute(now, overrides, rebaseOptions = {}) {
  return modeledRoute(now, "line-1-rsz-eglinton-davisville", {
    alertType: "Live",
    childAlerts: [],
    ...overrides,
  }, rebaseOptions);
}

function plannedGapFillRoute(now, overrides, rebaseOptions = {}) {
  return modeledRoute(now, "line-1-planned-st-george-sheppard-west", overrides, rebaseOptions);
}

function feed(now, routes, accessibility = []) {
  return {
    lastUpdated: iso(now, -1),
    total: routes.length + accessibility.length,
    routes: routes.map((record) => ({ ...record, _linewatchScenarioOrigin: "synthetic" })),
    accessibility: accessibility.map((record) => ({ ...record, _linewatchScenarioOrigin: "synthetic" })),
  };
}

function allAlertTypes(now) {
  return feed(now, [
    activeGapFillRoute(now, {
      id: "scenario-active-line-2",
      route: "2",
      stopStart: "Broadview",
      stopEnd: "Kennedy",
      stopIDList: [
        "Broadview",
        "Chester",
        "Pape",
        "Donlands",
        "Greenwood",
        "Coxwell",
        "Woodbine",
        "Main Street",
        "Victoria Park",
        "Warden",
        "Kennedy",
      ],
      title: "No service between Broadview and Kennedy stations while we respond to a medical emergency. Shuttle buses are on the way.",
      headerText: "Line 2 Bloor-Danforth: No service between Broadview and Kennedy stations while we respond to a medical emergency. Shuttle buses are on the way.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Both ways",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Medical emergency",
      shuttleType: "Ordered",
      shuttleStart: "Broadview",
      shuttleEnd: "Kennedy",
    }),
    activeGapFillRoute(now, {
      id: "scenario-active-line-1-dupont-cedarvale",
      route: "1",
      stopStart: "Dupont",
      stopEnd: "Cedarvale",
      stopIDList: ["Dupont", "St Clair West", "Cedarvale"],
      title: "No service between Dupont and Cedarvale stations while we respond to a security incident.",
      headerText: "Line 1 Yonge-University: No service between Dupont and Cedarvale stations while we respond to a security incident.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Both ways",
      cause: "SECURITY_INCIDENT",
      causeDescription: "Security incident",
      shuttleType: "Ordered",
      shuttleStart: "Dupont",
      shuttleEnd: "Cedarvale",
    }),
    activeGapFillRoute(now, {
      id: "scenario-active-line-1-king-union",
      route: "1",
      stopStart: "King",
      stopEnd: "Union",
      stopIDList: ["King", "Union"],
      title: "No service southbound from King to Union stations while we respond to a security incident.",
      headerText: "Line 1 Yonge-University: No service southbound from King to Union stations while we respond to a security incident.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Southbound",
      cause: "SECURITY_INCIDENT",
      causeDescription: "Security incident",
      shuttleType: "Ordered",
      shuttleStart: "King",
      shuttleEnd: "Union",
    }),
    activeGapFillRoute(now, {
      id: "scenario-active-line-1-museum-st-george",
      route: "1",
      stopStart: "Museum",
      stopEnd: "St George",
      stopIDList: ["Museum", "St George"],
      title: "No service northbound from Museum to St George stations while we respond to a security incident.",
      headerText: "Line 1 Yonge-University: No service northbound from Museum to St George stations while we respond to a security incident.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Northbound",
      cause: "SECURITY_INCIDENT",
      causeDescription: "Security incident",
      shuttleType: "Ordered",
      shuttleStart: "Museum",
      shuttleEnd: "St George",
    }),
    activeGapFillRoute(now, {
      id: "scenario-station-node-bloor-yonge-line-1",
      route: "1",
      stopStart: "Bloor-Yonge",
      stopEnd: "Bloor-Yonge",
      stopIDList: ["Bloor-Yonge"],
      title: "Trains are not stopping at Bloor-Yonge station due to a security incident.",
      headerText: "Line 1 Yonge-University: Trains are not stopping at Bloor-Yonge station due to a security incident.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Both ways",
      cause: "SECURITY_INCIDENT",
      causeDescription: "Security incident",
    }),
    activeGapFillRoute(now, {
      id: "scenario-station-node-bloor-yonge-line-2",
      route: "2",
      stopStart: "Bloor-Yonge",
      stopEnd: "Bloor-Yonge",
      stopIDList: ["Bloor-Yonge"],
      title: "Trains are not stopping at Bloor-Yonge station due to a security incident.",
      headerText: "Line 2 Bloor-Danforth: Trains are not stopping at Bloor-Yonge station due to a security incident.",
      effect: "NO_SERVICE",
      effectDesc: "No Service",
      direction: "Both ways",
      cause: "SECURITY_INCIDENT",
      causeDescription: "Security incident",
    }),
    activeGapFillRoute(now, {
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
    activeGapFillRoute(now, {
      id: "scenario-delay-line-1-union-st-andrew",
      route: "1",
      stopStart: "Union",
      stopEnd: "St Andrew",
      stopIDList: ["Union", "St Andrew"],
      title: "Delays northbound from Union to St Andrew stations while we respond to an operational problem.",
      headerText: "Line 1 Yonge-University: Delays northbound from Union to St Andrew stations while we respond to an operational problem.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Northbound",
      cause: "OPERATIONS",
      causeDescription: "Operational problem",
    }),
    activeGapFillRoute(now, {
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
    activeGapFillRoute(now, {
      id: "scenario-delay-line-2-main-street-kennedy",
      route: "2",
      stopStart: "Main Street",
      stopEnd: "Kennedy",
      stopIDList: ["Main Street", "Victoria Park", "Warden", "Kennedy"],
      title: "Delays both ways between Main Street and Kennedy stations while we respond to a track problem.",
      headerText: "Line 2 Bloor-Danforth: Delays both ways between Main Street and Kennedy stations while we respond to a track problem.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Both ways",
      cause: "MAINTENANCE",
      causeDescription: "Track problem",
    }),
    activeGapFillRoute(now, {
      id: "scenario-delay-line-2-jane-runnymede",
      route: "2",
      stopStart: "Jane",
      stopEnd: "Runnymede",
      stopIDList: ["Jane", "Runnymede"],
      title: "Delays both ways between Jane and Runnymede while we respond to a track problem.",
      headerText: "Line 2 Bloor-Danforth: Delays both ways between Jane and Runnymede while we respond to a track problem.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Both ways",
      cause: "MAINTENANCE",
      causeDescription: "Track problem",
    }),
    activeGapFillRoute(now, {
      id: "scenario-station-node-jane-overlap",
      route: "2",
      stopStart: "Jane",
      stopEnd: "Jane",
      stopIDList: ["Jane"],
      title: "Delays at Jane station while we respond to an emergency alarm.",
      headerText: "Line 2 Bloor-Danforth: Delays at Jane station while we respond to an emergency alarm.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Eastbound",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Emergency alarm",
    }),
    activeGapFillRoute(now, {
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
    activeGapFillRoute(now, {
      id: "scenario-station-node-dundas-west-bidirectional",
      route: "2",
      stopStart: "Dundas West",
      stopEnd: "Dundas West",
      stopIDList: ["Dundas West"],
      title: "Delays both ways at Dundas West station while we respond to an emergency alarm.",
      headerText: "Line 2 Bloor-Danforth: Delays both ways at Dundas West station while we respond to an emergency alarm.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Both ways",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Emergency alarm",
    }),
    activeGapFillRoute(now, {
      id: "scenario-station-node-union-vaughan",
      route: "1",
      stopStart: "Union",
      stopEnd: "Union",
      stopIDList: ["Union"],
      title: "Delays on the northbound platform to Vaughan Metropolitan Centre at Union station while we respond to an emergency alarm.",
      headerText: "Line 1 Yonge-University: Delays on the northbound platform to Vaughan Metropolitan Centre at Union station while we respond to an emergency alarm.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Northbound To Vaughan Metropolitan Centre",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Emergency alarm",
    }),
    activeGapFillRoute(now, {
      id: "scenario-station-node-spadina",
      route: "1",
      stopStart: "Spadina",
      stopEnd: "Spadina",
      stopIDList: ["Spadina"],
      title: "Delays at Spadina station while we respond to an emergency alarm.",
      headerText: "Line 1 Yonge-University: Delays at Spadina station while we respond to an emergency alarm.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Both ways",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Emergency alarm",
    }),
    activeGapFillRoute(now, {
      id: "scenario-station-node-lawrence-west",
      route: "1",
      stopStart: "Lawrence West",
      stopEnd: "Lawrence West",
      stopIDList: ["Lawrence West"],
      title: "Delays both ways at Lawrence West station while we respond to an emergency alarm.",
      headerText: "Line 1 Yonge-University: Delays both ways at Lawrence West station while we respond to an emergency alarm.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Both ways",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Emergency alarm",
    }),
    activeGapFillRoute(now, {
      id: "scenario-station-node-spadina-line-2-westbound",
      route: "2",
      stopStart: "Spadina",
      stopEnd: "Spadina",
      stopIDList: ["Spadina"],
      title: "Delays westbound at Spadina station while we respond to an emergency alarm.",
      headerText: "Line 2 Bloor-Danforth: Delays westbound at Spadina station while we respond to an emergency alarm.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Delays",
      direction: "Westbound",
      cause: "MEDICAL_EMERGENCY",
      causeDescription: "Emergency alarm",
    }),
    templateRoute(now, "line-1-rsz-eglinton-davisville"),
    activeGapFillRoute(now, {
      id: "scenario-rsz-line-2-jane-runnymede",
      route: "2",
      stopStart: "Jane",
      stopEnd: "Runnymede",
      stopIDList: ["Jane", "Runnymede"],
      title: "Subway trains will move slower than usual both ways between Jane and Runnymede stations.",
      headerText: "Line 2 Bloor-Danforth: Subway trains will move slower than usual both ways between Jane and Runnymede stations.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: "Both ways",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "300 metres",
      distance: "500 metres",
      reducedSpeed: "20 km/h",
      targetRemoval: "This week",
    }),
    activeGapFillRoute(now, {
      id: "scenario-rsz-line-1-wilson-yorkdale-directionless",
      route: "1",
      stopStart: "Wilson",
      stopEnd: "Yorkdale",
      stopIDList: ["Wilson", "Yorkdale"],
      title: "Subway trains will move slower than usual from Wilson to Yorkdale stations.",
      headerText: "Line 1 Yonge-University: Subway trains will move slower than usual from Wilson to Yorkdale stations.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      direction: null,
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      rszLength: "400 metres",
      distance: "700 metres",
      reducedSpeed: "15 km/h",
      targetRemoval: "This month",
    }),
    templateRoute(now, "line-1-planned-st-george-sheppard-west", {
      direction: "Both ways",
    }, {
      activePeriod: finitePeriod(now, -120, 720),
      activePeriodGroup: ["Current", "Weekend"],
    }),
    plannedGapFillRoute(now, {
      id: "scenario-planned-line-1-northbound-early-access",
      alertType: "Planned",
      route: "1",
      stopStart: "Bloor-Yonge",
      stopEnd: "Eglinton",
      stopIDList: ["Bloor-Yonge", "Rosedale", "Summerhill", "St Clair", "Davisville", "Eglinton"],
      title: "There will be no subway service northbound from Bloor-Yonge to Eglinton stations during early access planned work.",
      headerText: "Line 1 Yonge-University: There will be no subway service northbound from Bloor-Yonge to Eglinton stations during early access planned work.",
      effect: "REDUCED_SERVICE",
      effectDesc: "Subway Closure - Early Access",
      direction: "Northbound",
      cause: "MAINTENANCE",
      causeDescription: "CLOSURE - Planned Early Access",
      activePeriod: finitePeriod(now, -90, 540),
      activePeriodGroup: ["Current"],
      shuttleType: "Will Operate",
      shuttleStart: "Bloor-Yonge",
      shuttleEnd: "Eglinton",
      childAlerts: [
        { id: "scenario-planned-line-1-northbound-window-active", startTime: iso(now, -15), endTime: iso(now, 75) },
      ],
    }, {
      activePeriod: finitePeriod(now, -90, 540),
      activePeriodGroup: ["Current"],
    }),
    plannedGapFillRoute(now, {
      id: "scenario-planned-line-2-long-upcoming",
      alertType: "Planned",
      route: "2",
      stopStart: "Broadview",
      stopEnd: "Kennedy",
      stopIDList: [
        "Broadview",
        "Chester",
        "Pape",
        "Donlands",
        "Greenwood",
        "Coxwell",
        "Woodbine",
        "Main Street",
        "Victoria Park",
        "Warden",
        "Kennedy",
      ],
      title: "There will be no subway service between Broadview and Kennedy stations from Saturday to Monday for planned track work.",
      headerText: "Line 2 Bloor-Danforth: There will be no subway service between Broadview and Kennedy stations from Saturday to Monday for planned track work.",
      effect: "REDUCED_SERVICE",
      effectDesc: "Subway Closure - Early Access",
      direction: "Both ways",
      cause: "MAINTENANCE",
      causeDescription: "CLOSURE - Planned Track Work",
      activePeriod: finitePeriod(now, 1440, 5760),
      activePeriodGroup: ["Upcoming", "Weekend"],
      shuttleType: "Will Operate",
      shuttleStart: "Broadview",
      shuttleEnd: "Kennedy",
      childAlerts: [
        { id: "scenario-planned-line-2-long-upcoming-window", startTime: iso(now, 1440), endTime: iso(now, 5760) },
      ],
    }, {
      activePeriod: finitePeriod(now, 1440, 5760),
      activePeriodGroup: ["Upcoming", "Weekend"],
      childAlerts: [
        { id: "scenario-planned-line-2-long-upcoming-window", startTime: iso(now, 1440), endTime: iso(now, 5760) },
      ],
    }),
  ], [
    templateAccessibility(now, "warden-elevator-test-e1"),
    templateAccessibility(now, "pioneer-village-escalator-test-s1"),
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

function limitedServiceActiveWindow(now) {
  const parent = routeAlert(now, {
    id: "scenario-limited-parent", alertType: "Planned", route: "1",
    stopStart: "Vaughan Metropolitan Centre", stopEnd: "Finch West",
    stopIDList: ["Vaughan Metropolitan Centre", "Highway 407", "Pioneer Village", "York University", "Finch West"],
    title: "Limited nightly service between Vaughan and Finch West",
    headerText: "Line 1: Limited nightly service between Vaughan and Finch West",
    description: "There will be limited nightly subway service due to planned track work.",
    effect: "LIMITED_SERVICE", effectDesc: "Limited service", direction: "Both ways",
    cause: "MAINTENANCE", causeDescription: "Closure - Planned Track Work",
    activePeriod: finitePeriod(now, -60, 1500), activePeriodGroup: ["Current", "Nightly"],
    childAlerts: [
      { id: "scenario-limited-child", startTime: iso(now, -60), endTime: iso(now, 120) },
      { id: "scenario-limited-next", startTime: iso(now, 1380), endTime: iso(now, 1560) },
    ],
  });
  const child = routeAlert(now, {
    ...parent, id: "scenario-limited-child", alertType: "Live",
    title: "There is limited subway service between Vaughan and Finch West stations.",
    headerText: "Line 1: There is limited subway service between Vaughan and Finch West stations.",
    description: "There is limited subway service due to planned track work.",
    activePeriod: finitePeriod(now, -60, 120), childAlerts: [],
  });
  return feed(now, [parent, child]);
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
    case "limited-service-active-window":
      return limitedServiceActiveWindow(now);
    case "station-node-impact":
      return stationNodeImpact(now);
    default:
      throw new Error(`Unknown LineWatch alert scenario: ${name}`);
  }
}
