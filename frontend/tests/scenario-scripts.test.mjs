import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const scenarioBackendScript = readFileSync(
  new URL("../../scripts/dev-alert-scenario.sh", import.meta.url),
  "utf8",
);

describe("alert scenario scripts", () => {
  it("passes GTFS schedule import settings into the scenario backend when a zip is available", () => {
    assert.match(scenarioBackendScript, /LINEWATCH_SCENARIO_GTFS_ZIP/);
    assert.match(scenarioBackendScript, /LINEWATCH_ARRIVALS_GTFS_IMPORT_ENABLED/);
    assert.match(scenarioBackendScript, /LINEWATCH_ARRIVALS_GTFS_ZIP_PATH/);
    assert.match(scenarioBackendScript, /tmp\/ttc-merged-gtfs\.zip/);
  });
});
