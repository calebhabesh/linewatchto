import assert from "node:assert/strict";
import { test } from "node:test";
import { upcomingAdvisoryPreview, upcomingCountdown } from "../src/app/upcoming-advisory-preview.ts";
import { withUpcomingListedSeparately } from "../src/app/current-service.ts";

// Sun, Nov 15 2026, 12:00 PM Toronto.
const now = Date.parse("2026-11-15T17:00:00Z");

const closure = (overrides = {}) => ({
  id: "c1",
  lineId: "line-2",
  title: "Line 2 – St George to Broadview stations – Single-day closure",
  location: "St George to Broadview",
  displayDirection: "Eastbound & Westbound",
  serviceEffect: "suspension",
  shuttle: true,
  nightly: false,
  nextWindowStart: "2026-11-21T05:00:00Z",
  nextWindowEnd: "2026-11-22T13:00:00Z",
  windowDates: "Sat, Nov 21",
  windowHours: "All Day · Resumes Sun 8:00 AM",
  windowCount: 1,
  ...overrides,
});

test("an all-day closure within the week previews compactly: stretch, one when line, shuttles", () => {
  assert.deepEqual(upcomingAdvisoryPreview(closure(), now), {
    id: "c1",
    lineId: "line-2",
    title: "Planned Closure",
    countdown: "In 6 Days",
    location: "St George to Broadview",
    direction: "Eastbound & Westbound",
    cause: undefined,
    // Stored from midnight, but trains run the night before: the line starts at the day.
    when: "Sat, Nov 21 – Sun, Nov 22 at 8:00 AM",
    replacement: "Shuttle Buses Will Run",
    horizon: "soon",
  });
});

test("timed windows give start and end on one line", () => {
  const timed = (end) => upcomingAdvisoryPreview(closure({ nextWindowStart: "2026-11-21T04:00:00Z", nextWindowEnd: end, windowHours: "11:00 PM – 3:30 AM" }), now).when;
  assert.equal(timed("2026-11-21T08:30:00Z"), "Fri, Nov 20 at 11:00 PM – Sat, Nov 21 at 3:30 AM");
  assert.equal(timed("2026-11-21T04:45:00Z"), "Fri, Nov 20 at 11:00 PM – 11:45 PM");
  assert.equal(timed("2026-11-30T10:00:00Z"), "Fri, Nov 20 at 11:00 PM – Mon, Nov 30 at 5:00 AM");
  assert.equal(timed("2026-11-22T13:00:00Z"), "Fri, Nov 20 at 11:00 PM – Sun, Nov 22 at 8:00 AM");
  assert.equal(timed(null), "Fri, Nov 20 from 11:00 PM");
});

test("midnight-to-midnight windows read as days, not 12:00 AM times", () => {
  const days = (start, end) => upcomingAdvisoryPreview(closure({ nextWindowStart: start, nextWindowEnd: end, windowHours: null }), now).when;
  assert.equal(days("2026-11-28T05:00:00Z", "2026-11-30T05:00:00Z"), "Sat, Nov 28 – Sun, Nov 29");
  assert.equal(days("2026-11-28T05:00:00Z", "2026-11-29T05:00:00Z"), "Sat, Nov 28");
});

test("a nightly series gives its dates and nightly hours on one line", () => {
  const preview = upcomingAdvisoryPreview(closure({
    nightly: true,
    windowCount: 3,
    nextWindowStart: "2026-11-18T04:00:00Z",
    nextWindowEnd: "2026-11-18T08:30:00Z",
    windowDates: "Tue, Nov 17 – Thu, Nov 19",
    windowHours: "11:00 PM – 3:30 AM",
  }), now);
  assert.equal(preview.when, "Nov 17 – Nov 19 · Nightly 11:00 PM – 3:30 AM");
  assert.equal(preview.countdown, "In 2 Days");
});

test("GO bus replacements, other directions, and unknown effects titled as the incident cards title them", () => {
  const go = upcomingAdvisoryPreview(closure({ shuttle: false, replacementService: "go-bus", serviceEffect: null, displayDirection: "Entire Line" }), now);
  assert.equal(go.replacement, "GO Buses Will Replace Trains");
  assert.equal(go.title, "Planned Closure");
  assert.equal(go.direction, "Entire Line");
  assert.equal(upcomingAdvisoryPreview(closure({ displayDirection: "Northbound" }), now).direction, "Northbound");
});

test("advisories more than a week out are quieter; undated ones invent no schedule", () => {
  const later = upcomingAdvisoryPreview(closure({ serviceEffect: "limited-service", nextWindowStart: "2026-12-02T03:00:00Z", nextWindowEnd: "2026-12-02T07:00:00Z", windowDates: null, windowHours: "10:00 PM – 2:00 AM" }), now);
  assert.equal(later.title, "Planned Limited Service");
  assert.equal(later.horizon, "later");
  assert.equal(later.countdown, "In 2 Weeks");
  assert.equal(later.when, "Tue, Dec 1 at 10:00 PM – Wed, Dec 2 at 2:00 AM");

  const labelled = upcomingAdvisoryPreview(closure({ nextWindowStart: null, nextWindowEnd: null, windowDates: "Sat, Dec 5", windowHours: "Early Morning" }), now);
  assert.equal(labelled.horizon, "undated");
  assert.equal(labelled.countdown, undefined);
  assert.equal(labelled.when, "Sat, Dec 5 · Early Morning");

  const undated = upcomingAdvisoryPreview(closure({ nextWindowStart: null, nextWindowEnd: null, windowDates: null, windowHours: null, shuttle: false }), now);
  assert.equal(undated.when, "Dates Not Listed");
  assert.equal(undated.replacement, undefined);
  const nightlyUndated = upcomingAdvisoryPreview(closure({ nightly: true, windowCount: null, nextWindowStart: null, nextWindowEnd: null, windowDates: null, windowHours: null }), now);
  assert.equal(nightlyUndated.when, "Nightly · Dates Not Listed");
});

test("countdowns count Toronto calendar days", () => {
  // Late Sunday night: a Tuesday 11 PM start is two days away though under 48h.
  const lateSunday = Date.parse("2026-11-16T04:30:00Z");
  assert.equal(upcomingCountdown(Date.parse("2026-11-18T04:00:00Z"), lateSunday), "In 2 Days");
  assert.equal(upcomingCountdown(Date.parse("2026-11-17T04:00:00Z"), now), "Tomorrow");
  assert.equal(upcomingCountdown(Date.parse("2026-11-15T23:00:00Z"), now), "Today");
  assert.equal(upcomingCountdown(now - 1, now), undefined);
});

test("lines with upcoming advisories keep their yellow status; the count leaves them to their cards", () => {
  const closureOnly = {
    state: "running", label: "Normal Service", isNormal: false, hasRsz: false, advisoryCount: 1,
    qualifiers: [{ kind: "planned-closure", label: "Advisory Planned" }],
  };
  assert.deepEqual(withUpcomingListedSeparately(closureOnly), { ...closureOnly, advisoryCount: undefined });

  const combined = {
    state: "reduced-speed-zones", label: "Normal Service", isNormal: false, hasRsz: true, rszCount: 2, advisoryCount: 3,
    qualifiers: [{ kind: "reduced-speed-zones", label: "Speed Zones" }, { kind: "planned-closure", label: "Advisory Planned" }],
  };
  const listed = withUpcomingListedSeparately(combined);
  assert.equal(listed.isNormal, false);
  assert.equal(listed.advisoryCount, 2);
  assert.deepEqual(listed.qualifiers.map(({ kind }) => kind), ["reduced-speed-zones", "planned-closure"]);

  const normal = { state: "normal", label: "Normal Service", isNormal: true, hasRsz: false };
  assert.equal(withUpcomingListedSeparately(normal), normal);
});

test("commute tags name one saved commute or count several", async () => {
  const { commuteTagLabel } = await import("../src/app/upcoming-advisory-preview.ts");
  const on = (label, outsideTripTimes = false) => ({ id: label, label, outsideTripTimes });
  assert.equal(commuteTagLabel([on("Ossington to Chester")]), "Affects Ossington to Chester Commute");
  // A name already ending in "commute" is not doubled.
  assert.equal(commuteTagLabel([on("Morning commute")]), "Affects Morning commute");
  assert.equal(commuteTagLabel([on("Line 1: Finch to Union")]), "Affects Line 1: Finch to Union Commute");
  assert.equal(commuteTagLabel([on("Home"), on("Gym")]), "Affects 2 of My Commutes");
  // Commutes met during their trip times name the tag; ones met only outside them are left to the hover list.
  assert.equal(commuteTagLabel([on("Home"), on("Gym", true)]), "Affects Home Commute");
  assert.equal(commuteTagLabel([on("Gym", true)]), "On Gym Commute, Outside Trip Times");
  assert.equal(commuteTagLabel([on("Home", true), on("Gym", true)]), "On 2 of My Commutes, Outside Trip Times");
});

test("impacts map to the saved commutes whose watched legs cross them", async () => {
  const { impactCommutes } = await import("../src/app/commute-data.ts");
  const leg = (id, impacts) => ({ id, routeLabel: "", fromStationId: "a", fromStationName: "A", toStationId: "b", toStationName: "B", path: {}, impact: { matchedImpacts: impacts } });
  const planned = (id, extra = {}) => ({ id, kind: "planned-closure", status: "planned", ...extra });
  const commute = (label, outbound, returnLeg, watchReturnTrip = true) => ({ id: label.toLowerCase(), label, outboundLeg: outbound, returnLeg, watchReturnTrip });
  const labels = (map, id) => map.get(id)?.map((entry) => entry.label);
  const linked = impactCommutes([
    commute("Work", leg("outbound", [planned("c1"), { id: "d1", kind: "delay", status: "current" }]), leg("return", [planned("c1"), planned("c2")])),
    commute("Gym", leg("outbound", [planned("c1")]), leg("return", [planned("c3")]), false),
  ]);
  assert.deepEqual(labels(linked, "c1"), ["Work", "Gym"]);
  assert.deepEqual(labels(linked, "c2"), ["Work"]);
  // An unwatched return leg does not count.
  assert.equal(linked.has("c3"), false);
  // Current alerts and delays are tagged too.
  assert.deepEqual(labels(linked, "d1"), ["Work"]);
  // Alert cards link to each commute by id.
  assert.deepEqual(linked.get("c2"), [{ id: "work", label: "Work", outsideTripTimes: false }]);
});

test("commute links follow the route's alert-type filters and mark work outside every leg's trip times", async () => {
  const { impactCommutes } = await import("../src/app/commute-data.ts");
  const leg = (id, impacts) => ({ id, impact: { matchedImpacts: impacts } });
  const match = (id, extra = {}) => ({ id, kind: "planned-closure", status: "planned", ...extra });
  const linked = impactCommutes([{
    id: "work",
    label: "Work",
    watchReturnTrip: true,
    outboundLeg: leg("outbound", [
      match("rsz", { kind: "reduced-speed-zone", status: "current", ignoredByRule: true }),
      match("nightly", { outsideTripTimes: true }),
      match("evening", { outsideTripTimes: true }),
    ]),
    returnLeg: leg("return", [match("nightly", { outsideTripTimes: true }), match("evening")]),
  }]);
  // My Commutes leaves a filtered alert type out, so its cards link nothing.
  assert.equal(linked.has("rsz"), false);
  // Outside the trip times on both legs: still linked, marked.
  assert.deepEqual(linked.get("nightly"), [{ id: "work", label: "Work", outsideTripTimes: true }]);
  // Inside the return trip's times: on the commute.
  assert.deepEqual(linked.get("evening"), [{ id: "work", label: "Work", outsideTripTimes: false }]);
});

test("the panel hover store notifies listeners and only its owner ends it", async () => {
  const { setPanelImpactHover, endPanelImpactHover, subscribePanelImpactHover } = await import("../src/components/map-overlays/panel-impact-hover.ts");
  const seen = [];
  const unsubscribe = subscribePanelImpactHover((impact) => seen.push(impact && impact.id));
  setPanelImpactHover({ kind: "planned-closure", id: "a" });
  setPanelImpactHover({ kind: "planned-closure", id: "a" });
  setPanelImpactHover({ kind: "planned-closure", id: "b" });
  endPanelImpactHover({ kind: "planned-closure", id: "a" });
  endPanelImpactHover({ kind: "planned-closure", id: "b" });
  unsubscribe();
  setPanelImpactHover({ kind: "planned-closure", id: "c" });
  setPanelImpactHover(null);
  assert.deepEqual(seen, [null, "a", "b", null]);
});

test("a panel hover raises its alert on the map and survives a chooser hover ending", async () => {
  const { installMapHoverController } = await import("../src/components/map-overlays/map-hover-controller.ts");
  const element = (kind, id) => {
    const attributes = new Set();
    return {
      dataset: { mapHoverImpactKind: kind, mapHoverImpactId: id },
      removeAttribute(name) {
        attributes.delete(name);
        if (name === "data-map-impact-hovered") delete this.dataset.mapImpactHovered;
        if (name === "data-map-hover-owner") delete this.dataset.mapHoverOwner;
      },
      querySelector: () => null,
    };
  };
  const planned = element("planned-closure", "c1");
  const other = element("delay", "d1");
  const noop = () => {};
  const root = {
    querySelectorAll: (selector) => selector.includes("data-map-impact-hovered]") && !selector.includes("data-map-hover-impact-kind")
      ? [planned, other].filter((item) => item.dataset.mapImpactHovered)
      : [planned, other],
    ownerDocument: { addEventListener: noop, removeEventListener: noop },
    addEventListener: noop,
    removeEventListener: noop,
    contains: () => false,
  };
  const controller = installMapHoverController(root, { previewOutlineLayer: () => null });
  controller.setPanelHover({ kind: "planned-closure", id: "c1" });
  assert.equal(planned.dataset.mapImpactHovered, "true");
  assert.equal(planned.dataset.mapHoverOwner, "panel:planned-closure:c1");
  assert.equal(other.dataset.mapImpactHovered, undefined);

  controller.setChooserHover({ kind: "planned-closure", id: "c1" });
  controller.setChooserHover(null);
  assert.equal(planned.dataset.mapHoverOwner, "panel:planned-closure:c1");

  controller.setPanelHover(null);
  assert.equal(planned.dataset.mapImpactHovered, undefined);
  controller.dispose();
});

test("Upcoming cards use the 24h incident cards' headers for planned advisories", async () => {
  const { currentServiceSummary, currentServiceIncidentPresentation } = await import("../src/app/current-service.ts");
  const at = Date.parse("2026-11-20T20:00:00Z");
  for (const serviceEffect of ["suspension", "limited-service", null]) {
    const advisory = closure({ serviceEffect, nextWindowStart: "2026-11-21T05:00:00Z", nextWindowEnd: "2026-11-21T09:00:00Z" });
    const data = { generatedAt: { live: true }, availability: "available", lineStatuses: [], activeAlerts: [], delays: [], reducedSpeedZones: [], plannedClosures: [advisory] };
    const [row] = currentServiceSummary(data, at).rows;
    const cardTitle = currentServiceIncidentPresentation(row).title.replace(" · Upcoming", "");
    assert.equal(upcomingAdvisoryPreview(advisory, now).title, cardTitle, String(serviceEffect));
  }
});

test("the cause drops TTC's Closure prefix and is absent when unsupplied", () => {
  assert.equal(upcomingAdvisoryPreview(closure({ cause: "CLOSURE - Tunnel Improvements" }), now).cause, "Tunnel Improvements");
  assert.equal(upcomingAdvisoryPreview(closure({ cause: null, reason: "Planned Track Work" }), now).cause, "Planned Track Work");
  assert.equal(upcomingAdvisoryPreview(closure({ cause: "Unknown" }), now).cause, undefined);
});
