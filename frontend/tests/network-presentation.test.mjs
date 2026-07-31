import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearServiceStatusLabel,
  dashboardStatusSourceLabel,
  networkStatusKicker,
  titleCasePollText,
} from "../src/app/network-presentation.ts";

describe("cross-network presentation vocabulary", () => {
  it("uses the same update grammar for fresh TTC and regional dashboards", () => {
    assert.equal(titleCasePollText("2 minutes ago"), "2 minutes ago");
    assert.equal(
      dashboardStatusSourceLabel({ networkId: "ttc", dataSource: "backend" }, "2 minutes ago"),
      "Updated 2 minutes ago",
    );
    assert.equal(
      dashboardStatusSourceLabel({ networkId: "regional", dataSource: "backend" }, "2 minutes ago"),
      "Updated 2 minutes ago",
    );
    assert.equal(titleCasePollText("just now"), "Just Now");
  });

  it("keeps fallback wording source-honest in full and compact surfaces", () => {
    assert.equal(
      dashboardStatusSourceLabel({ networkId: "ttc", dataSource: "fallback" }, "", "compact"),
      "Fixture Mode",
    );
    assert.equal(
      dashboardStatusSourceLabel({ networkId: "regional", dataSource: "fallback" }, "", "compact"),
      "Regional Demo · Not Live",
    );
    assert.match(
      dashboardStatusSourceLabel({ networkId: "regional", dataSource: "fallback" }, ""),
      /not live service information/i,
    );
  });

  it("keeps network identity separate from shared status hierarchy", () => {
    assert.equal(networkStatusKicker("ttc"), "Current TTC rapid transit");
    assert.equal(networkStatusKicker("regional"), "GO & UP regional rail");
    assert.equal(clearServiceStatusLabel({ networkId: "ttc", dataSource: "backend" }), "Good Service");
    assert.equal(clearServiceStatusLabel({ networkId: "regional", dataSource: "fallback" }), "Demo Status Unavailable");
  });
});
