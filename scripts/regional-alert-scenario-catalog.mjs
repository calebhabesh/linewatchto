const DEFAULT_NOW = "2026-07-29T18:00:00.000Z";

export const regionalScenarioNames = [
  "all-alert-types",
  "go-corridor-overlap",
  "go-station-and-accessibility",
  "up-service-alerts",
];

export const regionalScenarioExpectations = {
  "all-alert-types": {
    goRecordCount: 9,
    upRecordCount: 3,
    normalizedAlertCount: 11,
    accessibilityCount: 3,
    impactKinds: ["advisory", "delay", "planned-closure"],
    lineIds: [
      "regional-br", "regional-ki", "regional-le", "regional-lw",
      "regional-mi", "regional-rh", "regional-st", "regional-up",
    ],
    scopes: ["unverified", "segment", "station"],
    recordOrigins: ["synthetic", "synthetic"],
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
    recordOrigins: ["synthetic", "synthetic"],
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
  endOffset = 180, origin = "synthetic",
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
  const reviewedKiDelay = goMessage(now, {
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
  return {
    leDelay, lePlanned, lwRouteDelay, stationSuspension, reviewedKiDelay, multiLine,
    elevator, unionMaintenance, escalator, upSuspension, upStationDelay, upPlanned,
  };
}

export function buildRegionalScenario(name, { now = DEFAULT_NOW } = {}) {
  if (!regionalScenarioNames.includes(name)) {
    throw new Error(`Unknown LineWatchTO regional alert scenario: ${name}`);
  }
  const r = records(now);
  const selected = {
    "all-alert-types": {
      go: [
        r.leDelay, r.lePlanned, r.lwRouteDelay, r.stationSuspension, r.reviewedKiDelay,
        r.multiLine, r.elevator, r.unionMaintenance, r.escalator,
      ],
      up: [r.upSuspension, r.upStationDelay, r.upPlanned],
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
