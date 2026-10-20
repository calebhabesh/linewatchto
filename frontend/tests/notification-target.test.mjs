import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findNotifiedHistoryIncident,
  parseNotificationTarget,
  resolveNotificationTarget,
} from "../src/app/notification-target.ts";

function dashboard(overrides = {}) {
  return {
    networkId: "ttc",
    dataSource: "backend",
    availability: "available",
    activeAlerts: [],
    delays: [],
    reducedSpeedZones: [],
    plannedClosures: [],
    ...overrides,
  };
}

const params = (query) => new URLSearchParams(query);
const verified = (data) => ({ dashboard: data, verified: true, waitExpired: false });

describe("notification target parsing", () => {
  it("reads an impact target with its line and cleared state", () => {
    assert.deepEqual(
      parseNotificationTarget(params("panel=alerts&impactKind=suspension&impactId=alert-1&targetLine=line-1&state=cleared")),
      {
        type: "impact",
        network: "ttc",
        selection: { kind: "suspension", id: "alert-1" },
        lineId: "line-1",
        state: "cleared",
      },
    );
  });

  it("reads GO / UP trip cancellations and commute targets", () => {
    assert.deepEqual(
      parseNotificationTarget(params("network=regional&panel=trip-changes&tripChangeId=trip-1&targetLine=regional-st")),
      { type: "trip-change", network: "regional", tripChangeId: "trip-1", lineId: "regional-st" },
    );
    assert.deepEqual(
      parseNotificationTarget(params("network=regional&panel=commutes&commute=commute_1&state=cleared")),
      { type: "commute", network: "regional", commuteId: "commute_1", state: "cleared" },
    );
  });

  it("leaves plain panel links and unknown impact kinds to ordinary navigation", () => {
    assert.equal(parseNotificationTarget(params("panel=delays")), null);
    assert.equal(parseNotificationTarget(params("network=regional&panel=trip-changes")), null);
    assert.equal(parseNotificationTarget(params("impactKind=elevator&impactId=x")), null);
    assert.equal(parseNotificationTarget(params("impactKind=delay&impactId=<script>")), null);
  });
});

describe("notification target resolution", () => {
  const suspension = parseNotificationTarget(params("impactKind=suspension&impactId=alert-1&targetLine=line-1"));

  it("waits for the target network's first verified dashboard", () => {
    assert.deepEqual(
      resolveNotificationTarget(suspension, { dashboard: dashboard(), verified: false, waitExpired: false }),
      { type: "wait" },
    );
  });

  it("opens an impact that is still listed, even when the notification said it cleared", () => {
    const data = dashboard({ activeAlerts: [{ id: "alert-1", lineId: "line-1", severity: "suspension" }] });
    const cleared = { ...suspension, state: "cleared" };
    assert.deepEqual(resolveNotificationTarget(cleared, verified(data)), {
      type: "impact",
      network: "ttc",
      selection: { kind: "suspension", id: "alert-1" },
    });
  });

  it("finds delays that the dashboard lists as delay-severity alerts", () => {
    const target = parseNotificationTarget(params("impactKind=delay&impactId=alert-2"));
    const data = dashboard({ activeAlerts: [{ id: "alert-2", lineId: "line-2", severity: "delay" }] });
    assert.equal(resolveNotificationTarget(target, verified(data)).type, "impact");
  });

  it("sends an ended TTC alert to its line's history with an ended notice", () => {
    const destination = resolveNotificationTarget(suspension, verified(dashboard()));
    assert.equal(destination.type, "alert-history");
    assert.equal(destination.lineId, "line-1");
    assert.equal(destination.alertId, "alert-1");
    assert.equal(destination.impactKind, "suspension");
    assert.equal(destination.notice.tone, "ended");
    assert.equal(destination.notice.title, "This alert has ended");
  });

  it("names an ended planned closure as a closure", () => {
    const target = parseNotificationTarget(params("impactKind=planned-closure&impactId=closure-1&targetLine=line-2&state=cleared"));
    const destination = resolveNotificationTarget(target, verified(dashboard()));
    assert.equal(destination.type, "alert-history");
    assert.equal(destination.notice.title, "This closure has ended");
  });

  it("never claims a GO / UP advisory ended service; it opens the line as no longer listed", () => {
    const target = parseNotificationTarget(params("network=regional&impactKind=delay&impactId=regional-alert-lw&targetLine=regional-lw"));
    const destination = resolveNotificationTarget(target, verified(dashboard({ networkId: "regional" })));
    assert.equal(destination.type, "line-impacts");
    assert.equal(destination.lineId, "regional-lw");
    assert.equal(destination.notice.tone, "unlisted");
    assert.equal(destination.notice.title, "This advisory is no longer listed");
    assert.doesNotMatch(destination.notice.message, /resumed|ended/i);
  });

  it("falls back to regional history when an older GO / UP target has no line", () => {
    const target = parseNotificationTarget(params("network=regional&impactKind=delay&impactId=regional-alert-lw"));
    const destination = resolveNotificationTarget(target, verified(dashboard({ networkId: "regional" })));
    assert.equal(destination.type, "alert-history");
    assert.equal(destination.network, "regional");
    assert.equal(destination.notice.tone, "unlisted");
  });

  for (const [label, data, context] of [
    ["snapshot data", dashboard({ snapshot: { savedAt: 1, reason: "offline" } }), {}],
    ["fixture data", dashboard({ dataSource: "fallback", availability: "fixture" }), {}],
    ["an unverified network after the wait", dashboard(), { verified: false, waitExpired: true }],
  ]) {
    it(`does not call a missing alert ended from ${label}`, () => {
      const destination = resolveNotificationTarget(suspension, { dashboard: data, verified: true, waitExpired: false, ...context });
      assert.equal(destination.type, "line-impacts");
      assert.equal(destination.notice.tone, "unconfirmed");
      assert.equal(destination.notice.title, "Couldn't confirm this alert");
    });
  }

  it("still opens a listed impact from snapshot data, where the inspector labels freshness", () => {
    const data = dashboard({
      snapshot: { savedAt: 1, reason: "offline" },
      reducedSpeedZones: [{ id: "zone-1", lineId: "line-1" }],
    });
    const target = parseNotificationTarget(params("impactKind=reduced-speed-zone&impactId=zone-1"));
    assert.equal(resolveNotificationTarget(target, verified(data)).type, "impact");
  });

  it("hands trip changes and commutes to their panels without waiting on dashboards", () => {
    const unverified = { dashboard: dashboard(), verified: false, waitExpired: false };
    assert.deepEqual(
      resolveNotificationTarget(parseNotificationTarget(params("network=regional&panel=trip-changes&tripChangeId=trip-1")), unverified),
      { type: "trip-changes", tripChangeId: "trip-1", lineId: null },
    );
    assert.deepEqual(
      resolveNotificationTarget(parseNotificationTarget(params("panel=commutes&commute=commute_1&state=cleared")), unverified),
      { type: "commutes", network: null, commuteId: "commute_1" },
    );
  });
});

describe("notified history incident", () => {
  it("picks the most recent occurrence of the notified alert", () => {
    const incidents = [
      { alertId: "alert-1", latestEventAt: "2026-10-20T10:00:00Z", incidentId: "old" },
      { alertId: "alert-2", latestEventAt: "2026-10-20T12:00:00Z", incidentId: "other" },
      { alertId: "alert-1", latestEventAt: "2026-10-20T11:00:00Z", incidentId: "new" },
    ];
    assert.equal(findNotifiedHistoryIncident(incidents, "alert-1").incidentId, "new");
    assert.equal(findNotifiedHistoryIncident(incidents, "missing"), null);
  });
});
