import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import {
  getLocalRegionalRailPreviewDate,
  getRegionalRailOperatingState,
  isRegionalRailClosed,
} from "../src/app/regional-rail-hours.ts";

describe("GO and UP regional rail operating hours", () => {
  it("uses the broad weekday overnight pause after the last regular trains", () => {
    const state = getRegionalRailOperatingState(new Date("2026-07-23T03:15:00-04:00"));

    assert.equal(state.status, "closed");
    assert.equal(state.title, "Regional rail closed overnight");
    assert.equal(state.nextResumeLabel, "Today at 4:55 AM");
    assert.equal(state.nextResumeTime, "4:55 AM");
    assert.equal(state.minutesUntilResume, 100);
    assert.equal(isRegionalRailClosed(new Date("2026-07-23T03:15:00-04:00")), true);
  });

  it("keeps the broad network window open while late GO trains finish", () => {
    const state = getRegionalRailOperatingState(new Date("2026-07-23T02:15:00-04:00"));

    assert.equal(state.status, "open");
    assert.equal(state.nextCloseLabel, "Today at 2:30 AM");
    assert.equal(state.minutesUntilClose, 15);
    assert.equal(state.closingSoon, true);
  });

  it("warns during the final 90 minutes before the broad overnight pause", () => {
    const warningState = getRegionalRailOperatingState(new Date("2026-07-23T01:15:00-04:00"));
    const earlyState = getRegionalRailOperatingState(new Date("2026-07-23T00:15:00-04:00"));

    assert.equal(warningState.minutesUntilClose, 75);
    assert.equal(warningState.closingSoon, true);
    assert.equal(earlyState.minutesUntilClose, 135);
    assert.equal(earlyState.closingSoon, false);
  });

  it("uses the later weekend UP Express start", () => {
    const saturdayClosed = getRegionalRailOperatingState(new Date("2026-07-25T05:30:00-04:00"));
    const sundayOpen = getRegionalRailOperatingState(new Date("2026-07-26T06:05:00-04:00"));

    assert.equal(saturdayClosed.status, "closed");
    assert.equal(saturdayClosed.nextResumeLabel, "Today at 6:00 AM");
    assert.equal(saturdayClosed.minutesUntilResume, 30);
    assert.equal(saturdayClosed.isWeekendSchedule, true);
    assert.equal(sundayOpen.status, "open");
  });

  it("describes corridor variation without claiming uniform GO service", () => {
    const state = getRegionalRailOperatingState(new Date("2026-07-23T03:15:00-04:00"));

    assert.match(state.operatingHours.coreRail, /vary by corridor/);
    assert.match(state.operatingHours.peakRail, /Milton and Richmond Hill/);
    assert.match(state.operatingHours.caveat, /first and last train times vary/);
    assert.match(state.operatingHours.overnight, /GO bus/);
  });

  it("accepts previewTime only on local browser URLs", () => {
    const previewDate = getLocalRegionalRailPreviewDate(
      "http://localhost:3001/?previewTime=2026-07-23T03:15:00-04:00",
    );

    assert.equal(previewDate?.toISOString(), "2026-07-23T07:15:00.000Z");
    assert.equal(
      getLocalRegionalRailPreviewDate(
        "https://linewatch.example/?previewTime=2026-07-23T03:15:00-04:00",
      ),
      null,
    );
    assert.equal(getRegionalRailOperatingState(previewDate ?? undefined).status, "closed");
  });
});

describe("GO and UP closed-hours UI", () => {
  const closedScreenSource = readFileSync(
    new URL("../src/components/GoUpClosedScreen.tsx", import.meta.url),
    "utf8",
  );
  const closingChipSource = readFileSync(
    new URL("../src/components/GoUpClosingSoonChip.tsx", import.meta.url),
    "utf8",
  );
  const shellSource = readFileSync(
    new URL("../src/components/LineWatchShell.tsx", import.meta.url),
    "utf8",
  );

  it("renders corridor-aware schedule copy and official schedule links", () => {
    assert.match(closedScreenSource, /GO &amp; UP Rail Closed/);
    assert.match(closedScreenSource, /GO all-day rail/);
    assert.match(closedScreenSource, /Milton and Richmond Hill/);
    assert.match(closedScreenSource, /gotransit\.com\/en\/see-schedules/);
    assert.match(closedScreenSource, /upexpress\.com/);
    assert.match(closedScreenSource, /Peek at Regional Map/);
  });

  it("renders a regional closing-soon chip", () => {
    assert.match(closingChipSource, /GO &amp; UP Rail Closing Soon/);
    assert.match(closingChipSource, /Broad overnight pause in/);
    assert.match(closingChipSource, /role="status"/);
  });

  it("scopes TTC and regional operating notices to their selected maps", () => {
    assert.match(
      shellSource,
      /selectedNetwork === "ttc" && subwayOperatingState\.closingSoon/,
    );
    assert.match(
      shellSource,
      /selectedNetwork === "regional" && regionalRailOperatingState\.closingSoon/,
    );
    assert.match(shellSource, /showRegionalClosedScreen/);
    assert.match(shellSource, /GoUpClosedScreen/);
    assert.match(shellSource, /GO & UP Rail Closed/);
  });
});
