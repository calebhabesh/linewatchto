export const mapResponse = {
  stations: [
    { id: "stub-station", name: "Stub Station", x: 4547, y: 1808, interchange: false },
    { id: "stub-eglinton", name: "Eglinton", x: 4547, y: 1808, interchange: false },
    { id: "stub-davisville", name: "Davisville", x: 4547, y: 2005, interchange: false },
    { id: "stub-king", name: "King", x: 4547, y: 3362, interchange: false },
    { id: "stub-union", name: "Union", x: 4311, y: 3597, interchange: true },
    { id: "stub-spadina-line-1", name: "Spadina", x: 3632, y: 2604, interchange: true },
    { id: "stub-st-george", name: "St George", x: 4010, y: 2604, interchange: true },
  ],
  segments: [
    {
      id: "stub-line-1-segment",
      lineId: "line-1",
      label: "Stub Station to Stub Terminal",
      pathD: "M 4547 1808 L 4546 1086",
      impacts: [
        {
          kind: "suspension",
          cardId: "stub-alert-line-1",
          travelDirection: "bidirectional",
          sourceAlertIds: ["stub-alert-line-1"],
        },
        {
          // Exercise normalization of a cached/legacy map payload that still
          // presents an in-effect closure with its planned identity.
          kind: "planned-closure",
          cardId: "stub-closure-line-1",
          travelDirection: "bidirectional",
          sourceAlertIds: ["stub-closure-line-1"],
        },
      ],
      overlay: "suspension",
      alertId: "stub-alert-line-1",
    },
    {
      id: "stub-line-1-eglinton-davisville",
      lineId: "line-1",
      label: "Eglinton to Davisville",
      stationAId: "stub-eglinton",
      stationBId: "stub-davisville",
      stationAAnchorId: "station-eglinton",
      stationBAnchorId: "station-davisville",
      guidePathId: null,
      guidePathReversed: false,
      pathD: "M 4547 1808 L 4547 2005",
      impacts: [
        {
          kind: "reduced-speed-zone",
          cardId: "reduced-speed-zone-stub-zone-south-source",
          travelDirection: "forward",
          sourceAlertIds: ["stub-zone-south-source"],
        },
      ],
      overlay: "delay",
      travelDirection: "forward",
      sourceAlertIds: ["stub-zone-south-source"],
      reducedSpeedZoneIds: ["reduced-speed-zone-stub-zone-south-source"],
      alertId: null,
    },
    {
      id: "line-4-sheppard-yonge-don-mills",
      lineId: "line-4",
      label: "Sheppard-Yonge to Don Mills",
      pathD: "M 5085 2605 L 5870 2620",
      impacts: [
        {
          kind: "delay",
          cardId: "stub-delay-line-4",
          travelDirection: "bidirectional",
          sourceAlertIds: ["stub-delay-line-4-source"],
        },
      ],
      overlay: "delay",
      travelDirection: "bidirectional",
      sourceAlertIds: ["stub-delay-line-4-source"],
      alertId: "stub-delay-line-4",
    },
    {
      id: "stub-line-1-king-union",
      lineId: "line-1",
      label: "King to Union",
      stationAId: "stub-king",
      stationBId: "stub-union",
      guidePathId: "seg-line-1-union-king",
      guidePathReversed: false,
      pathD: "",
      impacts: [
        {
          kind: "reduced-speed-zone",
          cardId: "reduced-speed-zone-stub-union-curve",
          travelDirection: "bidirectional",
          sourceAlertIds: ["stub-union-curve-north", "stub-union-curve-south"],
        },
      ],
      overlay: "delay",
      travelDirection: "bidirectional",
      sourceAlertIds: ["stub-union-curve-north", "stub-union-curve-south"],
      reducedSpeedZoneIds: ["reduced-speed-zone-stub-union-curve"],
      alertId: null,
    },
    {
      id: "stub-line-1-spadina-st-george",
      lineId: "line-1",
      label: "Spadina to St George",
      stationAId: "stub-spadina-line-1",
      stationBId: "stub-st-george",
      guidePathId: "seg-line-1-st-george-spadina",
      guidePathReversed: true,
      pathD: "",
      impacts: [
        {
          kind: "delay",
          cardId: "stub-delay-st-george-curve",
          travelDirection: "forward",
          sourceAlertIds: ["stub-delay-st-george-curve"],
        },
      ],
      overlay: "delay",
      travelDirection: "forward",
      sourceAlertIds: ["stub-delay-st-george-curve"],
      alertId: "stub-delay-st-george-curve",
    },
  ],
  stationNodeImpacts: [
    {
      stationId: "stub-station",
      kind: "suspension",
      cardId: "stub-alert-line-1",
      title: "Stub API signal problem",
    },
  ],
};

export const mapAuthoritativeOverlapResponse = {
  ...mapResponse,
  segments: [
    ...mapResponse.segments.map((segment) => {
      if (segment.id !== "stub-line-1-segment") {
        return segment;
      }

      return {
        ...segment,
        impacts: [
          ...segment.impacts,
          {
            kind: "delay",
            cardId: "stub-delay-line-1-overlap",
            travelDirection: "bidirectional",
            sourceAlertIds: ["stub-delay-line-1-overlap"],
          },
          {
            kind: "reduced-speed-zone",
            cardId: "reduced-speed-zone-stub-line-1-overlap",
            travelDirection: "bidirectional",
            sourceAlertIds: ["stub-rsz-line-1-overlap"],
          },
        ],
      };
    }),
    {
      id: "stub-line-1-museum-st-george",
      lineId: "line-1",
      label: "Museum to St George",
      stationAId: "stub-museum",
      stationBId: "stub-st-george",
      pathD: "M 4547 2460 L 4010 2604",
      impacts: [
        {
          kind: "suspension",
          cardId: "stub-alert-st-george-boundary",
          travelDirection: "forward",
          sourceAlertIds: ["stub-alert-st-george-boundary"],
        },
      ],
      overlay: "suspension",
      travelDirection: "forward",
      sourceAlertIds: ["stub-alert-st-george-boundary"],
      alertId: "stub-alert-st-george-boundary",
    },
    {
      id: "stub-line-1-st-george-sheppard-west",
      lineId: "line-1",
      label: "St George to Sheppard West",
      stationAId: "stub-st-george",
      stationBId: "stub-sheppard-west",
      pathD: "M 4010 2604 L 3430 1970",
      overlay: "clear",
    },
  ],
};

export const statusResponse = {
  generatedAt: {
    time: "Seeded demo",
    date: "Smoke fixture",
    live: false,
    lastPoll: "succeeded just now",
  },
  lines: [
    {
      id: "line-1",
      number: "1",
      name: "Stub API Yonge-University",
      route: "Stub Station - Stub Terminal",
      color: "#F8C300",
      status: "suspension",
      statusLabel: "Suspended",
      summary: "Stub API suspension for browser verification.",
      updatedAgo: "Seeded demo",
    },
    {
      id: "line-4",
      number: "4",
      name: "Stub API Sheppard",
      route: "Sheppard-Yonge - Don Mills",
      color: "#A21A68",
      status: "delay",
      statusLabel: "Delay",
      summary: "Stub API delay for browser verification.",
      updatedAgo: "Seeded demo",
    },
  ],
};

export const activeAlertsResponse = [
  {
    id: "stub-alert-line-1",
    lineId: "line-1",
    lineNumber: "1",
    title: "Stub API signal problem",
    severity: "suspension",
    location: "Stub Station to Stub Terminal",
    displayDirection: "Northbound & Southbound",
    description: "Seeded smoke alert for browser verification.",
    reason: "Signal issue",
    targetRemoval: "TBD",
    updatedAgo: "Seeded demo",
    affectedSegmentIds: ["stub-line-1-segment"],
    shuttle: true,
    source: "Playwright API stub",
  },
  {
    id: "stub-active-closure-child-line-1",
    lineId: "line-1",
    lineNumber: "1",
    title: "Stub API active planned closure",
    severity: "planned",
    location: "Stub Station to Stub Terminal",
    displayDirection: "Northbound & Southbound",
    description: "Seeded active planned closure for browser verification.",
    reason: "Track work",
    targetRemoval: "End of window",
    updatedAgo: "Seeded demo",
    affectedSegmentIds: ["stub-line-1-segment"],
    shuttle: false,
    source: "Playwright API stub",
    relatedPlannedClosureId: "stub-closure-line-1",
  },
];

export const mapAuthoritativeActiveAlertsResponse = activeAlertsResponse.map((alert) => {
  if (alert.id !== "stub-alert-line-1") {
    return alert;
  }

  return {
    ...alert,
    affectedSegmentIds: [],
  };
});

mapAuthoritativeActiveAlertsResponse.push({
  id: "stub-alert-st-george-boundary",
  lineId: "line-1",
  lineNumber: "1",
  title: "No service northbound from Museum to St George",
  severity: "suspension",
  location: "Museum to St George",
  displayDirection: "Northbound",
  description: "Scenario active alert ending at the same station where an upcoming closure begins.",
  reason: "Security incident",
  targetRemoval: "TBD",
  updatedAgo: "Seeded demo",
  affectedSegmentIds: ["stub-line-1-museum-st-george"],
  shuttle: true,
  source: "Playwright API stub",
});

export const reducedSpeedZonesResponse = [
  {
    id: "reduced-speed-zone-stub-zone-south-source",
    lineId: "line-1",
    lineNumber: "1",
    title: "Reduced Speed Zone",
    location: "Eglinton to Davisville",
    displayDirection: "Southbound",
    description: "Southbound trains are moving slower than usual.",
    reason: "Track issue",
    targetRemoval: "Mid-June",
    updatedAgo: "Updated 2 hr ago",
    affectedSegmentIds: ["stub-line-1-eglinton-davisville"],
    sourceAlertIds: ["stub-zone-south-source"],
    directionalDetails: [
      {
        sourceAlertId: "stub-zone-south-source",
        displayDirection: "Southbound",
        location: "Eglinton to Davisville",
        description: "Southbound trains are moving slower than usual.",
      },
    ],
    source: "Playwright API stub",
  },
  {
    id: "reduced-speed-zone-stub-union-curve",
    lineId: "line-1",
    lineNumber: "1",
    title: "Reduced Speed Zone",
    location: "King <-> Union",
    displayDirection: "Northbound & Southbound",
    description: "Scenario RSZ across the Union curve.",
    startedAt: "2026-06-03T09:00:00-04:00",
    updatedAt: "2026-06-03T10:00:00-04:00",
    cause: "Track issue",
    resolution: "This week",
    rszLength: "250 metres",
    reducedSpeed: "15 km/h",
    affectedSegmentIds: ["stub-line-1-king-union"],
    sourceAlertIds: ["stub-union-curve-north", "stub-union-curve-south"],
    directionalDetails: [
      {
        sourceAlertId: "stub-union-curve-south",
        displayDirection: "Southbound",
        location: "King to Union",
        description: "Southbound trains are moving slower than usual.",
      },
      {
        sourceAlertId: "stub-union-curve-north",
        displayDirection: "Northbound",
        location: "Union to King",
        description: "Northbound trains are moving slower than usual.",
      },
    ],
    source: "Playwright API stub",
  },
];

export const mapAuthoritativeReducedSpeedZonesResponse = [
  ...reducedSpeedZonesResponse,
  {
    id: "reduced-speed-zone-stub-line-1-overlap",
    lineId: "line-1",
    lineNumber: "1",
    title: "Reduced Speed Zone",
    location: "Stub Station to Stub Terminal",
    displayDirection: "Northbound & Southbound",
    description: "Scenario RSZ on the same segment as an active alert.",
    startedAt: "2026-06-03T09:00:00-04:00",
    updatedAt: "2026-06-03T10:00:00-04:00",
    cause: "Track issue",
    resolution: "This week",
    rszLength: "120 metres",
    reducedSpeed: "15 km/h",
    affectedSegmentIds: ["stub-line-1-segment"],
    sourceAlertIds: ["stub-rsz-line-1-overlap"],
    directionalDetails: [
      {
        sourceAlertId: "stub-rsz-line-1-overlap",
        displayDirection: "Northbound & Southbound",
        location: "Stub Station to Stub Terminal",
        description: "Scenario RSZ on the same segment as an active alert.",
      },
    ],
    source: "Playwright API stub",
  },
];

export const delaysResponse = [
  {
    id: "stub-delay-line-4",
    lineId: "line-4",
    lineNumber: "4",
    title: "Delay between Sheppard-Yonge and Don Mills",
    location: "Sheppard-Yonge to Don Mills",
    displayDirection: "Eastbound",
    description: "Trains are moving slowly.",
    affectedSegmentIds: ["line-4-sheppard-yonge-don-mills"],
    startedAt: "2026-06-01T22:15:00-04:00",
    updatedAt: "2026-06-01T22:39:00-04:00",
    source: "TTC Live Alerts",
    cause: "Operational issue",
  },
  {
    id: "stub-delay-st-george-curve",
    lineId: "line-1",
    lineNumber: "1",
    title: "Delay from Spadina to St George",
    location: "Spadina to St George",
    displayDirection: "Westbound",
    description: "Scenario delay on the St George curve.",
    affectedSegmentIds: ["stub-line-1-spadina-st-george"],
    startedAt: "2026-06-03T09:15:00-04:00",
    updatedAt: "2026-06-03T09:30:00-04:00",
    source: "Playwright API stub",
    cause: "Operational issue",
  },
];

export const mapAuthoritativeDelaysResponse = [
  ...delaysResponse,
  {
    id: "stub-delay-line-1-overlap",
    lineId: "line-1",
    lineNumber: "1",
    title: "Delay from Stub Station to Stub Terminal",
    location: "Stub Station to Stub Terminal",
    displayDirection: "Northbound & Southbound",
    description: "Scenario delay on the same segment as an active alert.",
    affectedSegmentIds: ["stub-line-1-segment"],
    startedAt: "2026-06-03T09:15:00-04:00",
    updatedAt: "2026-06-03T09:30:00-04:00",
    source: "Playwright API stub",
    cause: "Operational issue",
  },
];


export const plannedClosuresResponse = [
  {
    id: "stub-closure-line-1",
    lineId: "line-1",
    lineNumber: "1",
    title: "Stub API active planned closure",
    window: "Nightly closure windows",
    location: "Stub Station to Stub Terminal",
    displayDirection: "Northbound & Southbound",
    description: "Seeded active planned closure for browser verification.",
    reason: "Track work",
    targetRemoval: "End of window",
    previewSegmentIds: ["stub-line-1-segment"],
    shuttle: false,
    source: "Playwright API stub",
    activeNow: true,
    timingStatus: "active-now",
    nightly: true,
    windowHours: "11:59 PM – 3:30 AM",
    windowDates: "Mon, Jul 20 – Wed, Jul 22",
    activeWindowLabel: "Wed 11:59 PM - Thu 3:30 AM",
    nextWindowLabel: null,
  },
  {
    id: "stub-upcoming-closure-line-1",
    lineId: "line-1",
    lineNumber: "1",
    title: "Stub API upcoming weekend closure",
    window: "Seeded smoke window",
    location: "Stub Station to Stub Terminal",
    displayDirection: "Northbound & Southbound",
    description: "Seeded upcoming smoke closure for browser verification.",
    reason: "Track work",
    targetRemoval: "End of weekend",
    previewSegmentIds: ["stub-line-1-segment"],
    shuttle: false,
    source: "Playwright API stub",
    activeNow: false,
    timingStatus: "upcoming",
    nightly: true,
    windowHours: "11:00 PM – 2:00 AM",
    windowDates: "Thu, Jul 23 – Fri, Jul 24",
    activeWindowLabel: null,
    nextWindowLabel: "Tomorrow 11:00 PM - Fri 2:00 AM",
  },
];

export const mapAuthoritativePlannedClosuresResponse = [
  ...plannedClosuresResponse,
  {
    id: "stub-upcoming-closure-st-george-boundary",
    lineId: "line-1",
    lineNumber: "1",
    title: "Upcoming closure from St George to Sheppard West",
    window: "Seeded smoke window",
    location: "St George to Sheppard West",
    displayDirection: "Northbound & Southbound",
    description: "Scenario upcoming closure beginning at the same station where an active alert ends.",
    reason: "Track work",
    targetRemoval: "End of weekend",
    previewSegmentIds: ["stub-line-1-st-george-sheppard-west"],
    shuttle: true,
    source: "Playwright API stub",
    activeNow: false,
    timingStatus: "upcoming",
    nightly: true,
    windowHours: "11:00 PM – 2:00 AM",
    windowDates: "Thu, Jul 23 – Fri, Jul 24",
    activeWindowLabel: null,
    nextWindowLabel: "Tomorrow 11:00 PM - Fri 2:00 AM",
  },
];

export const stationSummariesResponse = {
  generatedAt: "seeded-smoke",
  stations: [
    {
      id: "stub-station",
      name: "Stub Station",
      mapX: 4547,
      mapY: 1808,
      interchange: false,
      lineIds: ["line-1"],
      hasActiveImpact: true,
      accessStatus: "outage",
      accessOutageCounts: {
        elevator: 1,
        escalator: 0,
      },
    },
  ],
};

export const stationDetailResponse = {
  id: "stub-station",
  name: "Stub Station",
  mapX: 4547,
  mapY: 1808,
  interchange: false,
  lines: [
    {
      id: "line-1",
      number: "1",
      name: "Yonge-University",
      color: "#F8C300",
      platformLabel: "Northbound / Southbound",
      wheelchairAccessible: true,
      hasElevator: true,
    },
  ],
  access: {
    status: "outage",
    summary: "1 active TTC accessibility outage is linked to this station.",
    updatedAgo: "TTC Live Alerts",
    outages: [
      {
        id: "stub-station-elevator-outage",
        assetType: "elevator",
        title: "Elevator outage",
        description: "The station elevator is unavailable.",
        cause: "Technical issue",
        updatedAt: "2026-06-02T14:12:00-04:00",
        source: "TTC Live Alerts",
      },
    ],
  },
  impacts: [
    {
      id: "stub-alert-line-1",
      type: "active-alert",
      severity: "suspension",
      title: "Station suspension",
      summary: "Service is suspended at Stub Station.",
      updatedAt: "2026-06-02T14:12:00-04:00",
      source: "TTC Live Alerts",
    },
    {
      id: "stub-closure-line-1",
      type: "planned-closure",
      severity: "planned",
      title: "Stub API active planned closure",
      summary: "Seeded active planned closure for browser verification.",
      updatedAt: "2026-06-02T14:10:00-04:00",
      source: "TTC Live Alerts",
    },
  ],
  arrivals: [
    {
      lineId: "line-1",
      direction: "Northbound to Finch",
      minutes: 0,
      predictedAt: "2026-06-04T09:00:00-04:00",
      label: "Due",
      source: "TTC scheduled service",
      status: "scheduled",
    },
    {
      lineId: "line-1",
      direction: "Northbound to Finch",
      minutes: 3,
      predictedAt: "2026-06-04T09:03:00-04:00",
      label: "3 min",
      source: "TTC scheduled service",
      status: "scheduled",
    },
    {
      lineId: "line-1",
      direction: "Northbound to Finch",
      minutes: 7,
      predictedAt: "2026-06-04T09:07:00-04:00",
      label: "7 min",
      source: "TTC scheduled service",
      status: "scheduled",
    },
    {
      lineId: "line-1",
      direction: "Southbound to Union",
      minutes: 4,
      predictedAt: "2026-06-04T09:04:00-04:00",
      label: "4 min",
      source: "TTC scheduled service",
      status: "scheduled",
    },
  ],
  arrivalsSource: "TTC scheduled service",
  arrivalContext: {
    scheduleMayBeDisrupted: true,
    message: "Schedule may be disrupted",
    reason: "Line 1 delay near Stub Station",
    severity: "delay",
    source: "TTC Live Alerts",
  },
  dataMode: "seeded-demo",
  disclaimer: "Scheduled arrivals use TTC timetable data and are not live train predictions.",
};

export const rawAlertsResponse = [
  {
    sourceSection: "routes",
    sourceId: "stub-route-raw-id",
    routeType: "Subway",
    sourceUpdatedAt: "2026-06-02T14:12:00-04:00",
    payload: JSON.stringify({
      id: "stub-route-raw-id",
      alertType: "Planned",
      route: "1",
      routeType: "Subway",
      title: "Seeded raw alert title for testing.",
      headerText: "Line 1 Yonge-University: Seeded raw alert title for testing.",
      effect: "REDUCED_SERVICE",
      cause: "MAINTENANCE"
    }),
    active: true
  }
];

export const regionalRawAlertsResponse = [
  {
    sourceSection: "go",
    sourceId: "M1",
    routeType: "GO Rail",
    sourceUpdatedAt: "2026-07-29T12:00:00-04:00",
    payload: JSON.stringify({
      Code: "M1",
      PostedDateTime: "2026-07-29 11:55:00",
      SubjectEnglish: "Lakeshore East service adjustment",
      BodyEnglish: "Trains are operating with delays between Pickering and Whitby.",
      Category: "Service Disruption",
      Lines: [{ Code: "LE" }],
    }),
    active: true,
  },
  {
    sourceSection: "up",
    sourceId: "UP1",
    routeType: "UP Express",
    sourceUpdatedAt: "2026-07-29T12:00:00-04:00",
    payload: JSON.stringify({
      id: "UP1",
      alert: {
        effect: "SIGNIFICANT_DELAYS",
        header_text: {
          translation: [{ text: "UP Express service delay", language: "en" }],
        },
      },
    }),
    active: true,
  },
];

export const estimatedTrainsResponse = {
  fresh: true,
  source: "TTC GTFS-RT subway trip updates",
  message: "Fresh TTC GTFS-RT subway trip updates are available.",
  disclaimer: "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.",
  feedCreatedAt: "2026-06-04T15:59:50Z",
  generatedAt: "2026-06-04T16:00:00Z",
  markers: [
    {
      id: "line-1:smoke-trip:smoke-vehicle:stub-davisville",
      lineId: "line-1",
      direction: "Southbound",
      travelDirection: "forward",
      segmentId: "stub-line-1-eglinton-davisville",
      fromStationId: "stub-eglinton",
      toStationId: "stub-davisville",
      nextStationId: "stub-davisville",
      progress: 0.45,
      segmentTravelSeconds: 120,
      predictedAt: "2026-06-04T16:01:06Z",
      vehicleId: "smoke-vehicle",
      tripId: "smoke-trip",
      feedCreatedAt: "2026-06-04T15:59:50Z",
      updatedAt: "2026-06-04T16:00:00Z",
    },
  ],
};

export const regionalEstimatedTrainsResponse = {
  fresh: true,
  availability: "available",
  source: "Metrolinx GO GTFS-RT VehiclePosition / Metrolinx UP Express GTFS-RT VehiclePosition",
  message: "Fresh schematic regional train markers.",
  disclaimer: "Estimated regional train markers are schematic placements derived from Metrolinx GTFS-RT vehicle positions and LineWatchTO topology. They are not exact physical train locations.",
  feedCreatedAt: "2026-07-28T19:47:43Z",
  generatedAt: "2026-07-28T19:48:00Z",
  markers: [{
    id: "go-3775",
    lineId: "regional-ki",
    direction: "Outbound",
    travelDirection: "forward",
    segmentId: "segment-ki-mount-dennis-weston",
    fromStationId: "mount-dennis",
    toStationId: "weston",
    nextStationId: "weston",
    progress: 0.5,
    segmentTravelSeconds: 0,
    predictedAt: "2026-07-28T19:47:40Z",
    vehicleId: "cab-3775",
    tripId: "3775",
    feedCreatedAt: "2026-07-28T19:47:43Z",
    updatedAt: "2026-07-28T19:47:40Z",
  }],
};
