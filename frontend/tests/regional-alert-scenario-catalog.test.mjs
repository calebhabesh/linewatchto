import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildRegionalScenario,
  regionalScenarioExpectations,
  regionalScenarioNames,
} from "../../scripts/regional-alert-scenario-catalog.mjs";

const fixtureRoot = new URL(
  "../../backend/src/test/resources/fixtures/metrolinx-alert-scenarios/",
  import.meta.url,
);
const index = JSON.parse(readFileSync(new URL("scenario-index.json", fixtureRoot), "utf8"));

describe("regional alert scenario catalog", () => {
  it("keeps every generated fixture reproducible from the source catalog", () => {
    assert.deepEqual(index.scenarios.map(({ name }) => name), regionalScenarioNames);
    for (const entry of index.scenarios) {
      const fixture = JSON.parse(readFileSync(new URL(entry.file, fixtureRoot), "utf8"));
      assert.deepEqual(
        fixture,
        buildRegionalScenario(entry.name, { now: index.generatedAt }),
        `${entry.file} is stale; run node scripts/generate-regional-alert-scenarios.mjs`,
      );
      assert.equal(fixture.go.Metadata.ErrorCode, "200");
      assert.equal(fixture.up.header.incrementality, "FULL_DATASET");
      assert.equal(fixture.go.Messages.Message.length, entry.goRecordCount);
      assert.equal(fixture.up.entity.length, entry.upRecordCount);
    }
  });

  it("covers all regional corridors, supported impact kinds, and map scopes", () => {
    const expected = regionalScenarioExpectations["all-alert-types"];
    assert.deepEqual(
      [...expected.lineIds].sort(),
      [
        "regional-br", "regional-ki", "regional-le", "regional-lw",
        "regional-mi", "regional-rh", "regional-st", "regional-up",
      ],
    );
    assert.deepEqual(expected.impactKinds, ["delay", "suspension", "planned-closure"]);
    assert.deepEqual(expected.scopes, ["route-wide", "segment", "station"]);
  });

  it("identifies reviewed samples separately from synthetic breadth records", () => {
    const fixture = JSON.parse(readFileSync(new URL("all-alert-types.json", fixtureRoot), "utf8"));
    const records = [...fixture.go.Messages.Message, ...fixture.up.entity];
    const origins = new Set(records.map((record) => record._linewatchScenarioOrigin));
    assert.deepEqual([...origins].sort(), ["synthetic", "synthetic"]);
    assert.ok(records.some((record) => record.Code === "LW-SCENARIO-KI-ADJUSTMENT"));
    assert.ok(records.some((record) => record.Code === "LW-SCENARIO-AG-ELEVATOR"));
    assert.ok(records.some((record) => record.Code === "LW-SCENARIO-UN-MAINTENANCE"));
    assert.ok(records.every((record) => record._linewatchScenarioOrigin));
  });
});
