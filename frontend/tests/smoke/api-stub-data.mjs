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
      overlay: "delay",
      travelDirection: "forward",
      sourceAlertIds: ["stub-zone-south-source"],
      reducedSpeedZoneIds: ["reduced-speed-zone-stub-zone-south-source"],
      alertId: null,
    },
  ],
};

export const statusResponse = {
  generatedAt: {
    time: "Seeded demo",
    date: "Smoke fixture",
    live: false,
    lastPoll: "Stub API poll",
  },
  lines: [
    {
      id: "line-1",
      number: "1",
      name: "Stub API Yonge-University",
      route: "Stub Station - Stub Terminal",
      color: "#f4c430",
      status: "suspension",
      statusLabel: "Suspended",
      summary: "Stub API suspension for browser verification.",
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
    updatedAgo: "Seeded demo",
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

export const plannedClosuresResponse = [
  {
    id: "stub-closure-line-1",
    lineId: "line-1",
    lineNumber: "1",
    title: "Stub API weekend closure",
    window: "Seeded smoke window",
    location: "Stub Station to Stub Terminal",
    description: "Seeded smoke closure for browser verification.",
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
