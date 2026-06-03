export const mapResponse = {
  stations: [
    { id: "stub-station", name: "Stub Station", x: 4547, y: 1808, interchange: false },
    { id: "stub-eglinton", name: "Eglinton", x: 4547, y: 1808, interchange: false },
    { id: "stub-davisville", name: "Davisville", x: 4547, y: 2005, interchange: false },
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
    description: "Seeded smoke alert for browser verification.",
    reason: "Signal issue",
    targetRemoval: "TBD",
    updatedAgo: "Seeded demo",
    affectedSegmentIds: ["stub-line-1-segment"],
    shuttle: true,
    source: "Playwright API stub",
  },
];

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
];

export const delaysResponse = [
  {
    id: "stub-delay-line-4",
    lineId: "line-4",
    lineNumber: "4",
    title: "Delay between Sheppard-Yonge and Don Mills",
    location: "Sheppard-Yonge to Don Mills",
    description: "Trains are moving slowly.",
    affectedSegmentIds: ["line-4-sheppard-yonge-don-mills"],
    startedAt: "2026-06-01T22:15:00-04:00",
    updatedAt: "2026-06-01T22:39:00-04:00",
    source: "TTC Live Alert",
    cause: "Operational issue",
  },
];


export const plannedClosuresResponse = [
  {
    id: "stub-closure-line-1",
    lineId: "line-1",
    lineNumber: "1",
    title: "Stub API weekend closure",
    window: "Seeded smoke window",
    location: "Stub Station to Stub Terminal",
    description: "Seeded smoke closure for browser verification.",
    reason: "Track work",
    targetRemoval: "End of weekend",
    previewSegmentIds: ["stub-line-1-segment"],
    shuttle: false,
    source: "Playwright API stub",
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
      accessStatus: "normal",
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
      id: "stub-station-linked-alert",
      type: "active-alert",
      severity: "delay",
      title: "Station delay",
      summary: "Trains are delayed at Stub Station.",
      updatedAt: "2026-06-02T14:12:00-04:00",
      source: "TTC Live Alerts",
    },
  ],
  arrivals: [
    { lineId: "line-1", direction: "Northbound", minutes: 3, label: "Demo arrival" },
    { lineId: "line-1", direction: "Southbound", minutes: 6, label: "Demo arrival" },
  ],
  arrivalsSource: "Demo estimates",
  dataMode: "seeded-demo",
  disclaimer: "Arrivals are demo placeholders, not live TTC predictions.",
};
