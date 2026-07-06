export const SYNTHETIC_TEMPLATE_SOURCE_KIND = "synthetic-template";
export const MODELED_GAP_FILL_SOURCE_KIND = "modeled-gap-fill";

// Authored synthetic TTC-shaped templates for parser/scenario coverage.
// The scenario catalog rebases timestamps before serving these in dev/test feeds.
export const alertScenarioTemplates = {
  routes: {
    "line-1-planned-st-george-sheppard-west": {
      id: "synthetic-planned-line-1",
      alertType: "Planned",
      lastUpdated: "2026-06-01T05:30:00Z",
      activePeriod: {
        start: "2026-06-01T05:30:00Z",
        end: "2026-06-06T00:30:00Z",
      },
      activePeriodGroup: ["Current", "Weekend"],
      route: "1",
      routeType: "Subway",
      stopStart: "St George",
      stopEnd: "Sheppard West",
      stopIDList: ["Sheppard West", "Wilson", "Yorkdale", "St George"],
      title: "Synthetic scenario: no subway service between St George and Sheppard West for a test closure.",
      headerText: "Line 1 Yonge-University: Synthetic scenario: no subway service between St George and Sheppard West for a test closure.",
      effect: "REDUCED_SERVICE",
      effectDesc: "Subway Closure - Early Access",
      cause: "MAINTENANCE",
      causeDescription: "CLOSURE - Planned Track Work",
      shuttleType: "Will Operate",
      shuttleStart: "Vaughan",
      shuttleEnd: "Union",
      childAlerts: [
        {
          id: "synthetic-planned-line-1-period",
          startTime: "2026-06-01T23:59:00Z",
          endTime: "2026-06-02T03:30:00Z",
        },
      ],
    },
    "line-1-rsz-eglinton-davisville": {
      id: "synthetic-rsz-line-1",
      alertType: "Planned",
      lastUpdated: "2026-05-26T06:00:00Z",
      activePeriod: {
        start: "2026-05-26T06:00:00Z",
        end: "0001-01-01T00:00:00Z",
      },
      route: "1",
      routeType: "Subway",
      stopStart: "Eglinton",
      stopEnd: "Davisville",
      stopIDList: ["Davisville", "Eglinton"],
      title: "Synthetic scenario: reduced speed southbound between Eglinton and Davisville.",
      headerText: "Line 1 Yonge-University: Synthetic scenario: reduced speed southbound between Eglinton and Davisville.",
      effect: "SIGNIFICANT_DELAYS",
      effectDesc: "Reduced Speed Zone",
      cause: "MAINTENANCE",
      causeDescription: "Track issue",
      childAlerts: [],
    },
  },
  accessibility: {
    "warden-elevator-test-e1": {
      id: "synthetic-elevator-warden",
      alertType: "Planned",
      lastUpdated: "2026-06-01T06:00:00Z",
      activePeriod: {
        start: "2026-06-01T06:00:00Z",
        end: "0001-01-01T00:00:00Z",
      },
      routeType: "Elevator",
      title: "Synthetic scenario: elevator TEST-E1 is out of service at Warden.",
      headerText: "Warden: Synthetic scenario: elevator TEST-E1 is out of service at Warden.",
      effect: "ACCESSIBILITY_ISSUE",
      effectDesc: "Out of service",
      elevatorCode: "TEST-E1",
      childAlerts: [],
    },
    "pioneer-village-escalator-test-s1": {
      id: "synthetic-escalator-pioneer-village",
      alertType: "Planned",
      lastUpdated: "2026-06-01T06:00:00Z",
      activePeriod: {
        start: "2026-06-01T06:00:00Z",
        end: "0001-01-01T00:00:00Z",
      },
      routeType: "Escalator",
      title: "Synthetic scenario: escalator TEST-S1 is out of service at Pioneer Village.",
      headerText: "Pioneer Village: Synthetic scenario: escalator TEST-S1 is out of service at Pioneer Village.",
      effect: "ACCESSIBILITY_ISSUE",
      effectDesc: "Out of service",
      escalatorCode: "TEST-S1",
      childAlerts: [],
    },
  },
};
