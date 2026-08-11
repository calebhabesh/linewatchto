import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_LINES_VALUE,
  buildAlertHistoryLineOptions,
  buildAlertHistorySortOptions,
  filterAndSortAlertHistory,
  formatAlertTypeName,
  selectDisplayEvent,
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
  return {
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
  title: "Line 5 reduced speed zone",
  location: "Avenue to Mount Pleasant",
  displayDirection: "Eastbound",
  cause: "Track Work",
  status: "active",
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
  it("selects the opened event for the Alerts chip when a clearance is newest", () => {
    const selected = selectDisplayEvent(clearedLine2Incident, "alerts");

    assert.equal(selected?.state, "opened");
    assert.equal(selected?.label, "Alert opened");
  });

  it("selects the clearance event for the Clearances chip", () => {
    const selected = selectDisplayEvent(clearedLine2Incident, "clearances");

    assert.equal(selected?.state, "cleared");
    assert.equal(selected?.label, "Service restored");
  });

  it("filters search text across incident and lifecycle event fields", () => {
    const visible = filterAndSortAlertHistory(
      [clearedLine2Incident, activeLine5Incident],
      {
        lifecycleFilter: "alerts",
        lineId: ALL_LINES_VALUE,
        searchQuery: "warden mechanical opened",
      },
    );

    assert.equal(visible.length, 1);
    assert.equal(visible[0].incident.alertId, "ttc-route-2-warden");
    assert.equal(visible[0].displayEvent?.state, "opened");
  });

  it("filters by selected transit line while preserving chronological input order", () => {
    const visible = filterAndSortAlertHistory(
      [activeLine5Incident, clearedLine2Incident],
      {
        lifecycleFilter: "all",
        lineId: "line-2",
        searchQuery: "",
      },
    );

    assert.deepEqual(
      visible.map((item) => item.incident.alertId),
      ["ttc-route-2-warden"],
    );
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

  it("builds sort options starting with Most Recent followed by canonical alert type names", () => {
    const options = buildAlertHistorySortOptions([
      activeLine5Incident,
      clearedLine2Incident,
    ]);

    assert.equal(options[0].value, "most-recent");
    assert.equal(options[0].label, "Most Recent");
    assert.ok(options.some((o) => o.value === "suspension" && o.label === "Active Alert"));
    assert.ok(options.some((o) => o.value === "delay" && o.label === "Delay"));
    assert.ok(options.some((o) => o.value === "reduced-speed-zone" && o.label === "Reduced Speed Zone"));
    assert.ok(options.some((o) => o.value === "planned-closure" && o.label === "Planned Closure"));
  });

  it("formats canonical alert type names consistently", () => {
    assert.equal(formatAlertTypeName("suspension"), "Active Alert");
    assert.equal(formatAlertTypeName("active-alert"), "Active Alert");
    assert.equal(formatAlertTypeName("delay"), "Delay");
    assert.equal(formatAlertTypeName("reduced-speed-zone"), "Reduced Speed Zone");
    assert.equal(formatAlertTypeName("planned-closure"), "Planned Closure");
  });

  it("sorts incidents matching selected alert type to top", () => {
    const visible = filterAndSortAlertHistory(
      [clearedLine2Incident, activeLine5Incident],
      {
        lifecycleFilter: "all",
        lineId: ALL_LINES_VALUE,
        searchQuery: "",
        sortBy: "reduced-speed-zone",
      },
    );

    assert.equal(visible[0].incident.alertId, "ttc-route-5-avenue");
    assert.equal(visible[1].incident.alertId, "ttc-route-2-warden");
  });
});
