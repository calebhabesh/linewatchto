import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_LINES_VALUE,
  ALL_TYPES_VALUE,
  SORT_ACTIVE_FIRST,
  SORT_ALERT_TYPE,
  SORT_CAUSE_AZ,
  SORT_CLEARED_FIRST,
  SORT_LEAST_UPDATES,
  SORT_LINE,
  SORT_LOCATION_AZ,
  SORT_LOCATION_ZA,
  SORT_LONGEST_DURATION,
  SORT_MOST_UPDATES,
  SORT_OLDEST,
  SORT_SHORTEST_DURATION,
  buildAlertHistoryLineOptions,
  buildAlertHistorySearchIndex,
  buildAlertHistorySortGroups,
  buildAlertHistorySortOptions,
  buildAlertHistoryTypeOptions,
  filterAndSortAlertHistory,
  formatAlertTypeName,
  selectLatestEvent,
} from "../src/components/alert-history-filters.ts";

function event(overrides) {
  return {
    id: overrides.id,
    state: overrides.state,
    label: overrides.label,
    happenedAt: overrides.happenedAt,
    title: overrides.title ?? "Line 2 delay",
    description: overrides.description ?? "Delay at Warden while crews respond.",
    location: overrides.location ?? "Warden",
    displayDirection: overrides.displayDirection ?? "Westbound",
    cause: overrides.cause ?? "Mechanical Problem",
    source: overrides.source ?? "TTC Live Alerts",
  };
}

function incident(overrides) {
  const latestEvent = overrides.events.reduce((latest, candidate) => (
    !latest || new Date(candidate.happenedAt).getTime() > new Date(latest.happenedAt).getTime()
      ? candidate
      : latest
  ), null);
  return {
    incidentId: overrides.incidentId ?? `${overrides.alertId}:occurrence:${overrides.events.at(-1)?.id}`,
    alertId: overrides.alertId,
    sourceId: overrides.sourceId ?? `${overrides.alertId}-source`,
    lineId: overrides.lineId,
    lineNumber: overrides.lineNumber,
    lineName: overrides.lineName,
    eventType: overrides.eventType ?? "delay",
    title: overrides.title,
    location: overrides.location,
    displayDirection: overrides.displayDirection ?? null,
    source: overrides.source ?? "TTC Live Alerts",
    cause: overrides.cause ?? null,
    status: overrides.status,
    latestState: overrides.latestState ?? latestEvent?.state ?? "opened",
    latestEventAt: overrides.latestEventAt ?? latestEvent?.happenedAt ?? "",
    firstSeenAt: overrides.firstSeenAt ?? "2026-06-23T12:05:00-04:00",
    lastUpdatedAt: overrides.lastUpdatedAt ?? null,
    clearedAt: overrides.clearedAt ?? null,
    durationMinutes: overrides.durationMinutes ?? null,
    events: overrides.events,
  };
}

const clearedLine2Incident = incident({
  alertId: "ttc-route-2-warden",
  lineId: "line-2",
  lineNumber: "2",
  lineName: "Bloor-Danforth",
  title: "Line 2 delay at Warden",
  location: "Warden",
  displayDirection: "Westbound",
  cause: "Mechanical Problem",
  status: "cleared",
  clearedAt: "2026-06-23T12:20:00-04:00",
  durationMinutes: 15,
  events: [
    event({
      id: 2,
      state: "cleared",
      label: "Service restored",
      happenedAt: "2026-06-23T12:20:00-04:00",
    }),
    event({
      id: 1,
      state: "opened",
      label: "Alert opened",
      happenedAt: "2026-06-23T12:05:00-04:00",
    }),
  ],
});

const activeLine5Incident = incident({
  alertId: "ttc-route-5-avenue",
  lineId: "line-5",
  lineNumber: "5",
  lineName: "Eglinton",
  eventType: "reduced-speed-zone",
  title: "Line 5 reduced speed zone",
  location: "Avenue to Mount Pleasant",
  displayDirection: "Eastbound",
  cause: "Track Work",
  status: "active",
  firstSeenAt: "2026-06-23T12:25:00-04:00",
  events: [
    event({
      id: 3,
      state: "updated",
      label: "Alert updated",
      happenedAt: "2026-06-23T12:25:00-04:00",
      title: "Line 5 reduced speed zone",
      description: "Reduced speed zone eastbound near Avenue.",
      location: "Avenue to Mount Pleasant",
      displayDirection: "Eastbound",
      cause: "Track Work",
    }),
  ],
});

const activeLine1Suspension = incident({
  alertId: "ttc-route-1-bloor-suspension",
  lineId: "line-1",
  lineNumber: "1",
  lineName: "Yonge-University",
  eventType: "suspension",
  title: "Line 1 major suspension",
  location: "Bloor-Yonge to St Clair",
  displayDirection: "Both",
  cause: "Signal Problem",
  status: "active",
  firstSeenAt: "2026-06-23T11:00:00-04:00",
  events: [
    event({
      id: 5,
      state: "opened",
      label: "Alert opened",
      happenedAt: "2026-06-23T11:00:00-04:00",
      title: "Line 1 suspension",
      location: "Bloor-Yonge to St Clair",
      cause: "Signal Problem",
    }),
    event({
      id: 6,
      state: "updated",
      label: "Alert updated",
      happenedAt: "2026-06-23T11:30:00-04:00",
    }),
    event({
      id: 7,
      state: "updated",
      label: "Alert updated",
      happenedAt: "2026-06-23T12:00:00-04:00",
    }),
  ],
});

const clearedLine4Incident = incident({
  alertId: "ttc-route-4-bayview",
  lineId: "line-4",
  lineNumber: "4",
  lineName: "Sheppard",
  eventType: "delay",
  title: "Line 4 delay at Bayview",
  location: "Bayview",
  displayDirection: "Eastbound",
  cause: "Door Issue",
  status: "cleared",
  firstSeenAt: "2026-06-23T10:00:00-04:00",
  clearedAt: "2026-06-23T10:05:00-04:00",
  durationMinutes: 5,
  events: [
    event({
      id: 8,
      state: "cleared",
      label: "Service restored",
      happenedAt: "2026-06-23T10:05:00-04:00",
    }),
  ],
});

const unknownLineIncident = incident({
  alertId: "ttc-route-unknown",
  lineId: null,
  lineNumber: null,
  lineName: null,
  title: "TTC service alert",
  location: "",
  status: "active",
  events: [
    event({
      id: 4,
      state: "opened",
      label: "Alert opened",
      happenedAt: "2026-06-23T12:10:00-04:00",
      title: "TTC service alert",
      location: "",
    }),
  ],
});

describe("alert history filtering", () => {
  it("always selects the latest lifecycle event as the card state", () => {
    const selected = selectLatestEvent(clearedLine2Incident);

    assert.equal(selected?.state, "cleared");
    assert.equal(selected?.label, "Service restored");
  });

  it("selects the latest event by timestamp even when lifecycle rows are unsorted", () => {
    const selected = selectLatestEvent(activeLine1Suspension);

    assert.equal(selected?.state, "updated");
    assert.equal(selected?.happenedAt, "2026-06-23T12:00:00-04:00");
  });

  it("uses the selected period to qualify a card while retaining its stable latest state and full lifecycle", () => {
    const since = "2026-06-23T12:10:00-04:00";
    const until = "2026-06-23T12:30:00-04:00";
    const visible = filterAndSortAlertHistory(
      [clearedLine2Incident],
      {
        statusFilter: "cleared",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        since,
        until,
      },
    );

    assert.equal(visible.length, 1);
    assert.equal(visible[0].latestEvent.state, "cleared");
    assert.equal(clearedLine2Incident.events.length, 2);
  });

  it("filters whole incident cards by their latest active or cleared state", () => {
    const active = filterAndSortAlertHistory(
      [clearedLine2Incident, activeLine5Incident],
      { statusFilter: "active", lineId: ALL_LINES_VALUE, searchQuery: "" },
    );
    const cleared = filterAndSortAlertHistory(
      [clearedLine2Incident, activeLine5Incident],
      { statusFilter: "cleared", lineId: ALL_LINES_VALUE, searchQuery: "" },
    );

    assert.deepEqual(active.map((item) => item.incident.alertId), ["ttc-route-5-avenue"]);
    assert.deepEqual(cleared.map((item) => item.incident.alertId), ["ttc-route-2-warden"]);
  });

  it("filters search text across incident and lifecycle event fields", () => {
    const visible = filterAndSortAlertHistory(
      [clearedLine2Incident, activeLine5Incident],
      {
        statusFilter: "cleared",
        lineId: ALL_LINES_VALUE,
        searchQuery: "warden mechanical opened",
      },
    );

    assert.equal(visible.length, 1);
    assert.equal(visible[0].incident.alertId, "ttc-route-2-warden");
    assert.equal(visible[0].latestEvent.state, "cleared");
  });

  it("uses a precomputed search index without rebuilding incident text per query", () => {
    const indexedIncident = incident({
      alertId: "indexed-alert",
      lineId: "line-2",
      lineNumber: "2",
      lineName: "Bloor-Danforth",
      title: "Unique cached phrase",
      location: "",
      status: "active",
      events: [event({
        id: 99,
        state: "opened",
        label: "Alert opened",
        happenedAt: "2026-06-23T12:05:00-04:00",
        title: "Generic alert",
        description: "Generic description",
        location: "",
      })],
    });
    const searchIndex = buildAlertHistorySearchIndex([indexedIncident]);
    indexedIncident.title = "Title changed after indexing";

    const visible = filterAndSortAlertHistory(
      [indexedIncident],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "unique cached",
      },
      searchIndex,
    );

    assert.equal(visible.length, 1);
    assert.match(searchIndex.get(indexedIncident), /unique cached phrase/);
  });

  it("filters by selected transit line while preserving chronological input order", () => {
    const visible = filterAndSortAlertHistory(
      [activeLine5Incident, clearedLine2Incident],
      {
        statusFilter: "all",
        lineId: "line-2",
        searchQuery: "",
      },
    );

    assert.deepEqual(
      visible.map((item) => item.incident.alertId),
      ["ttc-route-2-warden"],
    );
  });

  it("filters by selected alert type", () => {
    const visible = filterAndSortAlertHistory(
      [activeLine5Incident, clearedLine2Incident, activeLine1Suspension],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        typeId: "reduced-speed-zone",
        searchQuery: "",
      },
    );

    assert.equal(visible.length, 1);
    assert.equal(visible[0].incident.alertId, "ttc-route-5-avenue");
  });

  it("builds line selector options in TTC line order with unknown lines last", () => {
    const options = buildAlertHistoryLineOptions([
      activeLine5Incident,
      unknownLineIncident,
      clearedLine2Incident,
    ]);

    assert.deepEqual(
      options.map((option) => option.label),
      ["All Lines", "Line 2 Bloor-Danforth", "Line 5 Eglinton", "Line Unavailable"],
    );
  });

  it("builds type selector options starting with All Types and canonical types", () => {
    const options = buildAlertHistoryTypeOptions([
      activeLine5Incident,
      clearedLine2Incident,
    ]);

    assert.equal(options[0].value, ALL_TYPES_VALUE);
    assert.equal(options[0].label, "All Types");
    assert.ok(options.some((o) => o.value === "suspension" && o.label === "Active Alert"));
    assert.ok(options.some((o) => o.value === "delay" && o.label === "Delay"));
    assert.ok(options.some((o) => o.value === "reduced-speed-zone" && o.label === "Reduced Speed Zone"));
    assert.ok(options.some((o) => o.value === "planned-closure" && o.label === "Planned Closure"));
  });

  it("builds categorized sort groups for logical organization", () => {
    const groups = buildAlertHistorySortGroups();
    assert.deepEqual(
      groups.map((g) => g.id),
      ["timing", "duration", "status", "attributes"],
    );
    assert.equal(groups[0].label, "Timing");
    assert.equal(groups[1].label, "Duration");
    assert.equal(groups[2].label, "Status & Updates");
    assert.equal(groups[3].label, "Line & Location");
  });

  it("builds sort options with rich metrics", () => {
    const options = buildAlertHistorySortOptions([
      activeLine5Incident,
      clearedLine2Incident,
    ]);

    assert.equal(options[0].value, "most-recent");
    assert.equal(options[0].label, "Most Recent");
    assert.ok(options.some((o) => o.value === SORT_OLDEST && o.label === "Oldest"));
    assert.ok(options.some((o) => o.value === SORT_LONGEST_DURATION && o.label === "Longest Duration"));
    assert.ok(options.some((o) => o.value === SORT_SHORTEST_DURATION && o.label === "Shortest Duration"));
    assert.ok(options.some((o) => o.value === SORT_ALERT_TYPE && o.label === "Alert Type"));
    assert.ok(options.some((o) => o.value === SORT_LINE && o.label === "Transit Line"));
    assert.ok(options.some((o) => o.value === SORT_LOCATION_AZ && o.label === "Location (A → Z)"));
    assert.ok(options.some((o) => o.value === SORT_LOCATION_ZA && o.label === "Location (Z → A)"));
    assert.ok(options.some((o) => o.value === SORT_CAUSE_AZ && o.label === "Cause (A → Z)"));
    assert.ok(options.some((o) => o.value === SORT_MOST_UPDATES && o.label === "Most Updates"));
    assert.ok(options.some((o) => o.value === SORT_LEAST_UPDATES && o.label === "Least Updates"));
    assert.ok(options.some((o) => o.value === SORT_ACTIVE_FIRST && o.label === "Active First"));
    assert.ok(options.some((o) => o.value === SORT_CLEARED_FIRST && o.label === "Cleared First"));
  });

  it("formats canonical alert type names consistently", () => {
    assert.equal(formatAlertTypeName("suspension"), "Active Alert");
    assert.equal(formatAlertTypeName("active-alert"), "Active Alert");
    assert.equal(formatAlertTypeName("delay"), "Delay");
    assert.equal(formatAlertTypeName("reduced-speed-zone"), "Reduced Speed Zone");
    assert.equal(formatAlertTypeName("planned-closure"), "Planned Closure");
  });

  it("sorts by longest duration descending", () => {
    const visible = filterAndSortAlertHistory(
      [clearedLine4Incident, clearedLine2Incident],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: SORT_LONGEST_DURATION,
      },
    );

    assert.equal(visible[0].incident.alertId, "ttc-route-2-warden"); // 15 mins
    assert.equal(visible[1].incident.alertId, "ttc-route-4-bayview"); // 5 mins
  });

  it("sorts by shortest duration ascending", () => {
    const visible = filterAndSortAlertHistory(
      [clearedLine2Incident, clearedLine4Incident],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: SORT_SHORTEST_DURATION,
      },
    );

    assert.equal(visible[0].incident.alertId, "ttc-route-4-bayview"); // 5 mins
    assert.equal(visible[1].incident.alertId, "ttc-route-2-warden"); // 15 mins
  });

  it("sorts by oldest first ascending", () => {
    const visible = filterAndSortAlertHistory(
      [activeLine5Incident, clearedLine4Incident],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: SORT_OLDEST,
      },
    );

    assert.equal(visible[0].incident.alertId, "ttc-route-4-bayview"); // 10:05
    assert.equal(visible[1].incident.alertId, "ttc-route-5-avenue"); // 12:25
  });

  it("sorts by alert type rank (suspension -> delay -> rsz)", () => {
    const visible = filterAndSortAlertHistory(
      [activeLine5Incident, clearedLine2Incident, activeLine1Suspension],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: SORT_ALERT_TYPE,
      },
    );

    assert.equal(visible[0].incident.alertId, "ttc-route-1-bloor-suspension"); // suspension
    assert.equal(visible[1].incident.alertId, "ttc-route-2-warden"); // delay
    assert.equal(visible[2].incident.alertId, "ttc-route-5-avenue"); // rsz
  });

  it("sorts by transit line order (Line 1 -> Line 2 -> Line 4 -> Line 5)", () => {
    const visible = filterAndSortAlertHistory(
      [activeLine5Incident, clearedLine4Incident, clearedLine2Incident, activeLine1Suspension],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: SORT_LINE,
      },
    );

    assert.equal(visible[0].incident.alertId, "ttc-route-1-bloor-suspension"); // Line 1
    assert.equal(visible[1].incident.alertId, "ttc-route-2-warden"); // Line 2
    assert.equal(visible[2].incident.alertId, "ttc-route-4-bayview"); // Line 4
    assert.equal(visible[3].incident.alertId, "ttc-route-5-avenue"); // Line 5
  });

  it("sorts by location A-Z", () => {
    const visible = filterAndSortAlertHistory(
      [clearedLine2Incident, activeLine5Incident, clearedLine4Incident],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: SORT_LOCATION_AZ,
      },
    );

    assert.equal(visible[0].incident.alertId, "ttc-route-5-avenue"); // Avenue to Mount Pleasant
    assert.equal(visible[1].incident.alertId, "ttc-route-4-bayview"); // Bayview
    assert.equal(visible[2].incident.alertId, "ttc-route-2-warden"); // Warden
  });

  it("sorts by cause A-Z", () => {
    const visible = filterAndSortAlertHistory(
      [activeLine1Suspension, clearedLine4Incident, clearedLine2Incident],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: SORT_CAUSE_AZ,
      },
    );

    assert.equal(visible[0].incident.alertId, "ttc-route-4-bayview"); // Door Issue
    assert.equal(visible[1].incident.alertId, "ttc-route-2-warden"); // Mechanical Problem
    assert.equal(visible[2].incident.alertId, "ttc-route-1-bloor-suspension"); // Signal Problem
  });

  it("sorts by most updates descending", () => {
    const visible = filterAndSortAlertHistory(
      [clearedLine4Incident, activeLine1Suspension, clearedLine2Incident],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: SORT_MOST_UPDATES,
      },
    );

    assert.equal(visible[0].incident.alertId, "ttc-route-1-bloor-suspension"); // 3 events
    assert.equal(visible[1].incident.alertId, "ttc-route-2-warden"); // 2 events
    assert.equal(visible[2].incident.alertId, "ttc-route-4-bayview"); // 1 event
  });

  it("sorts by active first and cleared first", () => {
    const activeFirst = filterAndSortAlertHistory(
      [clearedLine2Incident, activeLine5Incident],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: SORT_ACTIVE_FIRST,
      },
    );
    assert.equal(activeFirst[0].incident.alertId, "ttc-route-5-avenue");
    assert.equal(activeFirst[1].incident.alertId, "ttc-route-2-warden");

    const clearedFirst = filterAndSortAlertHistory(
      [activeLine5Incident, clearedLine2Incident],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: SORT_CLEARED_FIRST,
      },
    );
    assert.equal(clearedFirst[0].incident.alertId, "ttc-route-2-warden");
    assert.equal(clearedFirst[1].incident.alertId, "ttc-route-5-avenue");
  });

  it("sorts incidents matching selected alert type to top for legacy type sorts", () => {
    const visible = filterAndSortAlertHistory(
      [clearedLine2Incident, activeLine5Incident],
      {
        statusFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: "reduced-speed-zone",
      },
    );

    assert.equal(visible[0].incident.alertId, "ttc-route-5-avenue");
    assert.equal(visible[1].incident.alertId, "ttc-route-2-warden");
  });
});
