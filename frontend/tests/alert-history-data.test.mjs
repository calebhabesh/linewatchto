import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyAlertHistory,
  getAlertHistory,
} from "../src/app/alert-history-data.ts";

describe("alert history data adapter", () => {
  it("uses same-origin API by default and includes the requested period", async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          generatedAt: "2026-06-23T12:30:00-04:00",
          period: "today",
          since: "2026-06-23T00:00:00-04:00",
          until: "2026-06-23T12:30:00-04:00",
          incidents: [
            {
              alertId: "ttc-route-1",
              sourceId: "source-1",
              lineId: "line-2",
              lineNumber: "2",
              lineName: "Bloor-Danforth",
              eventType: "suspension",
              title: "Line 2 Suspension",
              location: "Warden",
              displayDirection: "Westbound",
              source: "TTC Live Alerts",
              cause: "Mechanical Problem",
              status: "cleared",
              firstSeenAt: "2026-06-23T12:05:00-04:00",
              lastUpdatedAt: null,
              clearedAt: "2026-06-23T12:20:00-04:00",
              durationMinutes: 15,
              events: [
                {
                  id: 2,
                  state: "cleared",
                  label: "Service restored",
                  happenedAt: "2026-06-23T12:20:00-04:00",
                  title: "Line 2 Suspension",
                  description: "Service restored.",
                  location: "Warden",
                  displayDirection: "Westbound",
                  cause: "Mechanical Problem",
                  source: "TTC Live Alerts",
                },
              ],
            },
          ],
        }),
      };
    };

    const result = await getAlertHistory("today", "ttc");

    assert.equal(calls[0].url, "/api/alert-history?period=today&network=ttc&limit=5000");
    assert.equal(calls[0].options.credentials, "include");
    assert.equal(result.source, "backend");
    assert.equal(result.data.incidents[0].durationMinutes, 15);
  });

  it("requests regional lifecycle history for GO/UP map mode", async () => {
    const calls = [];
    global.fetch = async (url) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => ({
          generatedAt: "2026-07-30T12:30:00-04:00",
          period: "7d",
          since: "2026-07-23T12:30:00-04:00",
          until: "2026-07-30T12:30:00-04:00",
          incidents: [],
        }),
      };
    };

    await getAlertHistory("7d", "regional");

    assert.equal(calls[0], "/api/alert-history?period=7d&network=regional&limit=5000");
  });

  it("falls back to an empty history when the backend is unavailable", async () => {
    global.fetch = async () => {
      throw new Error("offline");
    };

    const result = await getAlertHistory("7d");

    assert.equal(result.source, "fallback");
    assert.equal(result.data.period, "7d");
    assert.deepEqual(result.data.incidents, []);
  });

  it("exports an empty default history shape", () => {
    assert.equal(emptyAlertHistory.period, "today");
    assert.deepEqual(emptyAlertHistory.incidents, []);
  });
});
