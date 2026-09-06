import assert from "node:assert/strict";
import { test } from "node:test";
import { historyDescription, historyCause, historyCategory, historyChangedFields, historyEventsNewestFirst } from "../src/components/alert-history-details.ts";

test("regional body preserves the reported location and TTC duplicate prose is suppressed", () => {
  assert.equal(historyDescription({ title: "Barrie - Equipment Issue", description: "Equipment issue south of Rutherford GO." }), "Equipment issue south of Rutherford GO.");
  assert.equal(historyDescription({ title: "Delay at Warden", description: " DELAY  at Warden " }), "");
  assert.equal(historyDescription({ title: "Delay", description: null }), "");
});

test("title category is source-labeled and requires a matching corridor prefix", () => {
  const incident = { source: "Metrolinx Open API", lineName: "Barrie", title: "Barrie - Equipment Issue" };
  assert.equal(historyCategory(incident), "Equipment Issue");
  assert.equal(historyCategory({ ...incident, title: "Barrie – Track conditions" }), "Track conditions");
  assert.equal(historyCategory({ ...incident, title: "All Corridors - Inclement weather delays" }), "Inclement weather delays");
  assert.equal(historyCategory({ ...incident, title: "Union - Aurora" }), null);
  assert.equal(historyCategory({ ...incident, source: "TTC Live Alerts" }), null);
  assert.equal(historyCause("UNKNOWN_CAUSE"), null);
  assert.equal(historyCause("Unknown Cause"), null);
  assert.equal(historyCause("Equipment failure"), "Equipment failure");
});

test("snapshot changes include removed fields without treating clearance as a narrative update", () => {
  const previous = { id: 1, happenedAt: "2026-09-01T17:24:00Z", title: "Barrie - Equipment Issue", description: "Repair crews responding.", location: "Union to Allandale Waterfront", cause: "Unknown Cause" };
  assert.deepEqual(historyChangedFields({ ...previous, state: "cleared" }, previous), []);
  assert.deepEqual(historyChangedFields({ ...previous, description: "Buses requested.", location: "" }, previous), ["Description", "Affected area"]);
  assert.deepEqual(historyChangedFields(previous), []);
  const updated = { ...previous, id: 2 };
  const events = [previous, updated];
  assert.deepEqual(historyEventsNewestFirst(events).map(e => e.id), [2, 1]);
  assert.deepEqual(events.map(e => e.id), [1, 2]);
});
