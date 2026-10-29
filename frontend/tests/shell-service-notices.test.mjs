import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  serviceConnectionNotice,
  serviceOperatingNotice,
} from "../src/app/shell-service-notices.ts";

const open = { status: "open", closingSoon: false, minutesUntilClose: null, nextCloseLabel: null, nextResumeLabel: null };
const connection = (overrides) => serviceConnectionNotice({
  snapshot: undefined,
  availability: "available",
  requestState: "ready",
  snapshotClock: 0,
  offline: false,
  ...overrides,
});

describe("shell connection notice", () => {
  it("stays quiet for fresh data and for a snapshot that is only refreshing", () => {
    assert.equal(connection({}), null);
    assert.equal(connection({ snapshot: { savedAt: 0, reason: "refreshing" }, availability: "degraded" }), null);
  });

  it("labels saved snapshots and hides the spinner while offline", () => {
    const notice = connection({ snapshot: { savedAt: null, reason: "offline" }, offline: true });
    assert.deepEqual(notice, {
      snapshot: true,
      hasSavedSnapshot: false,
      message: "Offline — No saved dashboard for this network. Current status unknown.",
      showSpinner: false,
      reason: "offline",
    });
  });

  it("orders reconnecting before degraded and unavailable sources", () => {
    assert.deepEqual(connection({ requestState: "reconnecting", availability: "unavailable" }), {
      message: "Connection issue — Showing cached snapshot",
      showSpinner: true,
      reason: "reconnecting",
    });
    assert.equal(connection({ availability: "degraded" })?.message, "Source refresh issue — Showing last successful update");
    assert.equal(connection({ availability: "unavailable" })?.message, "Service unavailable — Showing fallback data");
  });
});

describe("shell operating notice", () => {
  const onOpenClosed = () => {};

  it("announces a closed network only while the map is showing", () => {
    const subway = { ...open, status: "closed", nextResumeLabel: "Tomorrow at 6:00 AM." };
    assert.deepEqual(
      serviceOperatingNotice({ network: "ttc", subway, regional: open, showClosed: true, onOpenClosed }),
      { kind: "closed", title: "Subway Closed", details: "Resumes tomorrow at 6:00 AM.", action: onOpenClosed },
    );
    assert.equal(serviceOperatingNotice({ network: "ttc", subway, regional: open, showClosed: false, onOpenClosed }), null);

    const regional = { ...open, status: "closed", nextResumeLabel: "Today at 5:00 AM" };
    assert.equal(
      serviceOperatingNotice({ network: "regional", subway: open, regional, showClosed: true, onOpenClosed })?.details,
      "Trains return today at 5:00 AM.",
    );
  });

  it("words closing-soon notices per network", () => {
    const closing = { ...open, closingSoon: true, minutesUntilClose: 75, nextCloseLabel: "Today 1:30 AM" };
    assert.deepEqual(
      serviceOperatingNotice({ network: "ttc", subway: closing, regional: open, showClosed: true, onOpenClosed }),
      { kind: "closing-soon", title: "Subway Closing Soon", details: "Closes in 1 hr 15 min · 1:30 AM" },
    );
    assert.deepEqual(
      serviceOperatingNotice({ network: "regional", subway: open, regional: closing, showClosed: true, onOpenClosed }),
      { kind: "closing-soon", title: "GO & UP Closing Soon", details: "Broad close at 1:30 AM (1 hr 15 min)" },
    );
  });

  it("reads only the selected network's hours", () => {
    const closing = { ...open, closingSoon: true, minutesUntilClose: 10, nextCloseLabel: "Today 1:30 AM" };
    assert.equal(serviceOperatingNotice({ network: "regional", subway: closing, regional: open, showClosed: true, onOpenClosed }), null);
  });
});
