import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const stationDataSource = readFileSync(new URL("../src/app/station-data.ts", import.meta.url), "utf8");
const stationPanelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");

describe("TTC station notices UI", () => {
  it("keeps fallback data empty and preserves the backend station-notice contract", () => {
    assert.match(stationDataSource, /export type StationNotice = \{/);
    assert.match(stationDataSource, /notices\?: StationNotice\[\]/);
    assert.match(stationDataSource, /notices: \[\]/);
  });

  it("only adds the station notice navigation and disclosure when notices exist", () => {
    assert.match(stationPanelSource, /const stationNotices = station\?\.notices \?\? \[\]/);
    assert.match(stationPanelSource, /if \(stationNotices\.length > 0\)/);
    assert.match(stationPanelSource, /\{stationNotices\.length > 0 && \(/);
    assert.match(stationPanelSource, /data-station-section="notices"/);
    assert.match(stationPanelSource, /Reviewed TTC station information/);
    assert.ok(
      stationPanelSource.indexOf('<SurfaceConnectionsSection networkId="ttc"')
        < stationPanelSource.indexOf('data-station-section="notices"'),
    );
    assert.ok(
      stationPanelSource.indexOf('data-station-section="notices"')
        < stationPanelSource.indexOf('data-station-section="station-impacts"'),
    );
  });

  it("shows source, verification, effective dates, and a TTC details link", () => {
    assert.match(stationPanelSource, /stationNoticeCategoryLabel\(notice\.category\)/);
    assert.match(stationPanelSource, /formatStationNoticeDate\(notice\.effectiveStart\)/);
    assert.match(stationPanelSource, /formatStationNoticeDate\(notice\.lastVerifiedAt\)/);
    assert.match(stationPanelSource, /href=\{notice\.sourceUrl\}/);
    assert.match(stationPanelSource, /target="_blank"/);
  });
});
