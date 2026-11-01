import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deviceNames,
  deviceReplacementSummary,
  deviceShownRate,
  deviceShownSummary,
  deviceStatusDetail,
  deviceStatusLabel,
  isCurrentDevice,
  outcomeLabel,
} from "../src/app/push-diagnostics-state.ts";

// The owner's Pixel in the plan 12 findings: 79 shown of 99 accepted while
// reachable, 372 alerts missed while it had no working subscription.
const pixel = {
  key: "installation-ce9b4149",
  label: "Android Chrome",
  status: "unreachable",
  statusSince: "2026-10-29T10:05:00Z",
  shown: 79,
  sentWhileReachable: 99,
  missedWhileUnreachable: 372,
  replacements: 4,
  endpointHashPrefix: "bd587945a7e4",
};

describe("push diagnostics model", () => {
  it("states each device's reachability in plain words", () => {
    assert.equal(deviceStatusLabel(pixel), "Unreachable");
    assert.match(deviceStatusDetail(pixel), /^Since Oct 29, 6:05 a\.m\., the browser has had no working subscription/);
    assert.match(deviceStatusDetail(pixel), /Opening LineWatchTO on this device reconnects it\.$/);
    assert.doesNotMatch(deviceStatusDetail({ status: "reachable", statusSince: "2026-10-20T17:30:00Z" }), /\.\.$/);
    assert.equal(deviceStatusLabel({ status: "reachable" }), "Reachable");
    assert.equal(deviceStatusLabel({ status: "off" }), "Off");
  });

  it("reports the shown share out of alerts sent while reachable and missed while unreachable", () => {
    assert.equal(deviceShownRate(pixel), 17);
    assert.equal(
      deviceShownSummary(pixel),
      "Showed 79 of 471 alerts in the last 7 days; 20 sent, not confirmed; 372 missed while unreachable.",
    );
    assert.equal(deviceShownRate({ shown: 0, sentWhileReachable: 0, missedWhileUnreachable: 0 }), null);
    assert.equal(deviceShownSummary({ shown: 0, sentWhileReachable: 0, missedWhileUnreachable: 0 }), "No alerts in the last 7 days.");
    assert.equal(deviceReplacementSummary(pixel), "The browser replaced its subscription 4 times in 7 days.");
    assert.equal(deviceReplacementSummary({ replacements: 0 }), null);
  });

  it("gives one plain outcome per alert per device", () => {
    assert.match(outcomeLabel({ outcome: "shown", at: "2026-10-31T22:50:04Z", reason: null, catchUp: false }), /^Shown Oct 31, 6:50/);
    assert.match(outcomeLabel({ outcome: "shown", at: "2026-10-31T22:50:04Z", reason: null, catchUp: true }), /\(after reconnecting\)$/);
    assert.equal(outcomeLabel({ outcome: "sent", at: null, reason: null, catchUp: false }), "Sent, not confirmed");
    assert.equal(outcomeLabel({ outcome: "missed", at: null, reason: null, catchUp: false }), "Missed, device unreachable");
    assert.equal(
      outcomeLabel({ outcome: "not-sent", at: null, reason: "notifications were off on this device", catchUp: false }),
      "Not sent: notifications were off on this device",
    );
  });

  it("names same-model devices apart and marks this device only while reachable", () => {
    const names = deviceNames([
      { key: "a", label: "Android Chrome" },
      { key: "b", label: "iOS Safari" },
      { key: "c", label: "Android Chrome" },
    ]);
    assert.deepEqual([...names.values()], ["Android Chrome 1", "iOS Safari", "Android Chrome 2"]);
    assert.equal(isCurrentDevice({ status: "reachable", endpointHashPrefix: "abc" }, "abc"), true);
    assert.equal(isCurrentDevice({ status: "unreachable", endpointHashPrefix: "abc" }, "abc"), false);
    assert.equal(isCurrentDevice({ status: "reachable", endpointHashPrefix: "abc" }, null), false);
  });
});
