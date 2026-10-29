const DEFAULT_NOW = "2026-07-29T18:00:00.000Z";
/** Current alerts stay active this long, so a dev server keeps them all session. */
const SESSION_MINUTES = 24 * 60;

export const regionalScenarioNames = [
  "all-alert-types",
  "go-corridor-overlap",
  "go-station-and-accessibility",
  "up-service-alerts",
];

export const regionalScenarioExpectations = {
  // One alert of every kind the GO/UP map and menus show, modeled on the
  // shapes in recorded Metrolinx history, with no two covering the same case.
  "all-alert-types": {
    goRecordCount: 4,
    goGtfsRecordCount: 6,
    upRecordCount: 2,
    normalizedAlertCount: 10,
    accessibilityCount: 2,
    impactKinds: ["advisory", "delay", "planned-closure"],
    coverage: {
      "advisory-span": "LW-SCENARIO-BR-CROSSING",
      "advisory-station": "LW-SCENARIO-KI-TRACK-REPAIR",
      "delay-span-trip-direction": "linewatch-go-le-trip-delay",
      "delay-station-trip-direction": "linewatch-go-ki-station-trip-delay",
      "delay-span-both-directions": "linewatch-go-lw-speed-reduction",
      "delay-whole-line": "linewatch-go-mi-corridor-delay",
      "planned-closure-span-upcoming": "linewatch-go-rh-weekend-closure",
      "planned-closure-listed-stations": "linewatch-go-st-stop-closures",
      "no-service-now": "linewatch-up-suspension",
      "delay-station-no-direction": "linewatch-up-station-delay",
      "accessibility-elevator": "LW-SCENARIO-AG-ELEVATOR",
      "accessibility-escalator": "LW-SCENARIO-ESCALATOR",
    },
    lineIds: [
      "regional-br", "regional-ki", "regional-le", "regional-lw",
      "regional-mi", "regional-rh", "regional-st", "regional-up",
    ],
    scopes: ["unverified", "segment", "station"],
    recordOrigins: ["synthetic"],
  },
  "go-corridor-overlap": {
    goRecordCount: 3,
    upRecordCount: 0,
    normalizedAlertCount: 3,
    accessibilityCount: 0,
    impactKinds: ["advisory"],
    lineIds: ["regional-le", "regional-lw"],
    scopes: ["unverified"],
    recordOrigins: ["synthetic"],
  },
  "go-station-and-accessibility": {
    goRecordCount: 4,
    upRecordCount: 0,
    normalizedAlertCount: 1,
    accessibilityCount: 3,
    impactKinds: ["advisory"],
    lineIds: ["regional-ki"],
    scopes: ["unverified"],
    recordOrigins: ["synthetic"],
  },
  "up-service-alerts": {
    goRecordCount: 0,
    upRecordCount: 3,
    normalizedAlertCount: 2,
    accessibilityCount: 0,
    impactKinds: ["delay", "planned-closure"],
    lineIds: ["regional-up"],
    scopes: ["segment", "station"],
    recordOrigins: ["synthetic"],
  },
};

function instant(now, offsetMinutes) {
  return new Date(new Date(now).getTime() + offsetMinutes * 60_000);
}

function torontoTimestamp(now, offsetMinutes) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant(now, offsetMinutes));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

function goMessage(now, {
  code, subject, body, lines, stops = [], subCategory = "Modified Trip",
  category = "Service Disruption", postedOffset = -20, origin = "synthetic",
}) {
  return {
    Code: code,
    Status: "UPD",
    PostedDateTime: torontoTimestamp(now, postedOffset),
    SubjectEnglish: subject,
    BodyEnglish: body,
    Category: category,
    SubCategory: subCategory,
    Lines: lines.map((Code) => ({ Code })),
    Stops: stops.map((Code) => ({ Code })),
    _linewatchScenarioOrigin: origin,
  };
}

function translated(text) {
  return { translation: [{ text, language: "en" }] };
}

function upEntity(now, {
  id, header, description, cause, effect, stops = [], startOffset = -30,
  endOffset = SESSION_MINUTES, origin = "synthetic",
}) {
  return {
    id,
    is_deleted: false,
    alert: {
      active_period: [{
        start: Math.floor(instant(now, startOffset).getTime() / 1000),
        end: Math.floor(instant(now, endOffset).getTime() / 1000),
      }],
      cause,
      effect,
      header_text: translated(header),
      description_text: translated(description),
      informed_entity: stops.map((stop_id) => ({ stop_id })),
    },
    _linewatchScenarioOrigin: origin,
  };
}

/** A GO GTFS-RT alert: the timed, stop-tagged half of a Metrolinx notice. */
function goEntity(now, {
  id, header, description, cause, effect, route, stops = [], startOffset = -30,
  endOffset = SESSION_MINUTES, origin = "synthetic",
}) {
  const entity = upEntity(now, { id, header, description, cause, effect, stops, startOffset, endOffset, origin });
  entity.alert.informed_entity = stops.length > 0
    ? stops.map((stop_id) => ({ route_id: route, stop_id }))
    : [{ route_id: route }];
  return entity;
}

function records(now) {
  const leDelay = goMessage(now, {
    code: "LW-SCENARIO-LE-DELAY",
    subject: "Lakeshore East trains operating with delays",
    body: "Synthetic scenario: trains are delayed between Pickering and Whitby.",
    lines: ["LE"],
    stops: ["PIN", "AJ", "WH"],
  });
  const lePlanned = goMessage(now, {
    code: "LW-SCENARIO-LE-PLANNED",
    subject: "Planned service change on Lakeshore East",
    body: "Synthetic scenario: a planned closure will affect Pickering to Ajax.",
    lines: ["LE"],
    stops: ["PIN", "AJ"],
    subCategory: "Planned Service",
    postedOffset: 90,
  });
  const lwRouteDelay = goMessage(now, {
    code: "LW-SCENARIO-LW-ROUTE",
    subject: "Lakeshore West corridor delay",
    body: "Synthetic scenario: service is operating with delays across the corridor.",
    lines: ["LW"],
  });
  const stationSuspension = goMessage(now, {
    code: "LW-SCENARIO-KI-STATION",
    subject: "Service suspended at Bloor GO",
    body: "Synthetic scenario: Kitchener trains are temporarily bypassing Bloor GO.",
    lines: ["GT"],
    stops: ["BL"],
    subCategory: "Service Suspension",
  });
  const kiAdjustment = goMessage(now, {
    code: "LW-SCENARIO-KI-ADJUSTMENT",
    subject: "Kitchener line service adjustment",
    body: "Synthetic scenario: test trains are five minutes later than usual.",
    lines: ["GT"],
    stops: ["BL", "MD", "WE"],
    origin: "synthetic",
  });
  const multiLine = goMessage(now, {
    code: "LW-SCENARIO-MULTI-LINE",
    subject: "Network rail service delay",
    body: "Synthetic scenario: several GO corridors are operating with delays.",
    lines: ["BR", "MI", "RH", "ST"],
  });
  const elevator = goMessage(now, {
    code: "LW-SCENARIO-AG-ELEVATOR",
    subject: "Elevator out of service",
    body: "Synthetic scenario: the station elevator is unavailable.",
    category: "Amenity",
    subCategory: "Elevator-Escalator Disruption",
    lines: ["ST"],
    stops: ["AG"],
    origin: "synthetic",
  });
  const unionMaintenance = goMessage(now, {
    code: "LW-SCENARIO-UN-MAINTENANCE",
    subject: "Elevator Maintenance Notice - York Concourse",
    body: "Synthetic scenario: a Union elevator is unavailable for a test maintenance window.",
    category: "Amenity",
    subCategory: "Elevator-Escalator Disruption",
    lines: ["BR", "GT", "LE", "LW", "MI", "RH", "ST"],
    stops: ["UN"],
    origin: "synthetic",
  });
  const escalator = goMessage(now, {
    code: "LW-SCENARIO-ESCALATOR",
    subject: "Escalator out of service",
    body: "Synthetic scenario: the platform escalator is out of service.",
    category: "Amenity",
    subCategory: "Elevator-Escalator Disruption",
    lines: ["LW"],
    stops: ["OA"],
  });

  const upSuspension = upEntity(now, {
    id: "linewatch-up-suspension",
    header: "UP Express service suspended",
    description: "Synthetic scenario: no service between Weston and Pearson.",
    cause: "TECHNICAL_PROBLEM",
    effect: "NO_SERVICE",
    stops: ["WE", "PA"],
  });
  const upStationDelay = upEntity(now, {
    id: "linewatch-up-station-delay",
    header: "UP Express delay at Mount Dennis",
    description: "Synthetic scenario: trains are delayed at Mount Dennis.",
    cause: "OTHER_CAUSE",
    effect: "SIGNIFICANT_DELAYS",
    stops: ["MD"],
  });
  const upPlanned = upEntity(now, {
    id: "linewatch-up-planned",
    header: "Planned UP Express service change",
    description: "Synthetic scenario: scheduled service changes affect the full route.",
    cause: "CONSTRUCTION",
    effect: "MODIFIED_SERVICE",
    startOffset: 120,
    endOffset: 300,
  });

  // all-alert-types: one record per alert kind, worded like recorded notices.
  const crossingAdvisory = goMessage(now, {
    code: "LW-SCENARIO-BR-CROSSING",
    subject: "Barrie - Railway crossing issue",
    body: "Synthetic scenario: trains may be delayed between Maple GO and King City GO while crews respond to a railway crossing issue.",
    lines: ["BR"],
    stops: ["MP", "KC"],
    subCategory: "Service Disruption",
  });
  const trackRepairAdvisory = goMessage(now, {
    code: "LW-SCENARIO-KI-TRACK-REPAIR",
    subject: "Kitchener - Unplanned track repair",
    body: "Synthetic scenario: crews are making an unplanned track repair near Georgetown GO. Trains may be delayed.",
    lines: ["GT"],
    stops: ["GE"],
    subCategory: "Service Disruption",
  });
  const tripDelaySpan = goEntity(now, {
    id: "linewatch-go-le-trip-delay",
    header: "Train delay - Union Station 4:53 PM - Durham College Oshawa GO 5:56 PM",
    description: "Synthetic scenario: this trip is delayed up to 15 minutes between Union Station and Rouge Hill GO due to a signal issue.",
    cause: "TECHNICAL_PROBLEM",
    effect: "SIGNIFICANT_DELAYS",
    route: "LE",
    stops: ["UN", "RO"],
  });
  const tripDelayStation = goEntity(now, {
    id: "linewatch-go-ki-station-trip-delay",
    header: "Train delay - Stratford GO 6:16 AM - Union Station 8:47 AM",
    description: "Synthetic scenario: this trip is delayed at Weston GO by up to 10 minutes due to a mechanical issue.",
    cause: "TECHNICAL_PROBLEM",
    effect: "SIGNIFICANT_DELAYS",
    route: "GT",
    stops: ["WE"],
  });
  const speedReduction = goEntity(now, {
    id: "linewatch-go-lw-speed-reduction",
    header: "Lakeshore West - Track speed reductions",
    description: "Synthetic scenario: trains are operating at reduced speed between Confederation GO and Niagara Falls GO. Expect delays of up to 10 minutes.",
    cause: "MAINTENANCE",
    effect: "SIGNIFICANT_DELAYS",
    route: "LW",
    stops: ["CF", "NI"],
  });
  const corridorDelay = goEntity(now, {
    id: "linewatch-go-mi-corridor-delay",
    header: "Milton - Delays across the corridor",
    description: "Synthetic scenario: trains are operating with delays of up to 20 minutes across the corridor due to a signal issue.",
    cause: "TECHNICAL_PROBLEM",
    effect: "SIGNIFICANT_DELAYS",
    route: "MI",
  });
  const weekendClosure = goEntity(now, {
    id: "linewatch-go-rh-weekend-closure",
    header: "Richmond Hill - Weekend construction",
    description: "Synthetic scenario: there will be no train service between Langstaff GO and Richmond Hill GO for planned construction. Buses will replace trains.",
    cause: "CONSTRUCTION",
    effect: "NO_SERVICE",
    route: "RH",
    stops: ["LA", "RI"],
    startOffset: 1440,
    endOffset: 4320,
  });
  const stopClosures = goEntity(now, {
    id: "linewatch-go-st-stop-closures",
    header: "Stouffville - Service adjustments",
    description: "Synthetic scenario: trains will not stop at Agincourt GO and Milliken GO for planned platform work.",
    cause: "CONSTRUCTION",
    effect: "STOP_CLOSED",
    route: "ST",
    stops: ["AG", "MK"],
    startOffset: 1440,
    endOffset: 2880,
  });
  return {
    leDelay, lePlanned, lwRouteDelay, stationSuspension, kiAdjustment, multiLine,
    elevator, unionMaintenance, escalator, upSuspension, upStationDelay, upPlanned,
    crossingAdvisory, trackRepairAdvisory, tripDelaySpan, tripDelayStation, speedReduction,
    corridorDelay, weekendClosure, stopClosures,
  };
}

export function buildRegionalScenario(name, { now = DEFAULT_NOW } = {}) {
  if (!regionalScenarioNames.includes(name)) {
    throw new Error(`Unknown LineWatchTO regional alert scenario: ${name}`);
  }
  const r = records(now);
  const selected = {
    "all-alert-types": {
      go: [r.crossingAdvisory, r.trackRepairAdvisory, r.elevator, r.escalator],
      goGtfs: [
        r.tripDelaySpan, r.tripDelayStation, r.speedReduction, r.corridorDelay,
        r.weekendClosure, r.stopClosures,
      ],
      up: [r.upSuspension, r.upStationDelay],
    },
    "go-corridor-overlap": {
      go: [r.leDelay, r.lePlanned, r.lwRouteDelay],
      up: [],
    },
    "go-station-and-accessibility": {
      go: [r.stationSuspension, r.elevator, r.unionMaintenance, r.escalator],
      up: [],
    },
    "up-service-alerts": {
      go: [],
      up: [r.upSuspension, r.upStationDelay, r.upPlanned],
    },
  }[name];
  const sourceTime = instant(now, -2);
  return {
    name,
    generatedAt: new Date(now).toISOString(),
    go: {
      Metadata: {
        TimeStamp: torontoTimestamp(sourceTime, 0),
        ErrorCode: "200",
        ErrorMessage: "OK",
      },
      Messages: { Message: selected.go },
    },
    goGtfs: {
      header: {
        gtfs_realtime_version: "2.0",
        incrementality: "FULL_DATASET",
        timestamp: Math.floor(sourceTime.getTime() / 1000),
      },
      entity: selected.goGtfs ?? [],
    },
    up: {
      header: {
        gtfs_realtime_version: "2.0",
        incrementality: "FULL_DATASET",
        timestamp: Math.floor(sourceTime.getTime() / 1000),
      },
      entity: selected.up,
    },
  };
}
