import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  fallbackStationDetails,
  formatStationNoticeDate,
  stationNoticeCategoryLabel,
} from "../src/app/station-data.ts";

const stationPanelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");

describe("TTC station notices domain & UI contract", () => {
  it("keeps fallback data empty and preserves the backend station-notice contract", () => {
    assert.ok(Object.values(fallbackStationDetails).every((station) => (station.notices ?? []).length === 0));
  });

  it("formats notice categories into user-facing labels", () => {
    assert.equal(stationNoticeCategoryLabel("construction"), "Construction");
    assert.equal(stationNoticeCategoryLabel("service-change"), "Service Change");
    assert.equal(stationNoticeCategoryLabel("facility"), "Facility");
    assert.equal(stationNoticeCategoryLabel("other"), "Notice");
    assert.equal(stationNoticeCategoryLabel("unknown-kind"), "Notice");
  });

  it("formats notice dates in Toronto timezone and handles null/invalid gracefully", () => {
    assert.equal(formatStationNoticeDate(null), null);
    assert.equal(formatStationNoticeDate(undefined), null);
    assert.equal(formatStationNoticeDate("invalid-date-string"), null);

    const formattedIso = formatStationNoticeDate("2026-09-01T12:00:00Z");
    assert.ok(formattedIso && formattedIso.includes("2026") && formattedIso.includes("1"));

    const formattedDateOnly = formatStationNoticeDate("2026-09-01");
    assert.ok(formattedDateOnly && formattedDateOnly.includes("2026") && formattedDateOnly.includes("1"));
  });

  it("preserves station section layout ordering (surface connections before notices before impacts)", () => {
    const surfaceIndex = stationPanelSource.indexOf('<SurfaceConnectionsSection networkId="ttc"');
    const noticesIndex = stationPanelSource.indexOf('data-station-section="notices"');
    const impactsIndex = stationPanelSource.indexOf('data-station-section="station-impacts"');

    assert.ok(surfaceIndex !== -1, "SurfaceConnectionsSection must exist");
    assert.ok(noticesIndex !== -1, "notices section anchor must exist");
    assert.ok(impactsIndex !== -1, "station-impacts section anchor must exist");
    assert.ok(surfaceIndex < noticesIndex, "Surface connections must precede station notices");
    assert.ok(noticesIndex < impactsIndex, "Station notices must precede station impacts");
  });
});
