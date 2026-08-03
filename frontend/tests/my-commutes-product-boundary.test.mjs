import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panel = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const guide = readFileSync(new URL("../src/components/SiteGuideDropdown.tsx", import.meta.url), "utf8");
const onboarding = readFileSync(new URL("../src/components/OpeningDisclaimer.tsx", import.meta.url), "utf8");
const privacy = readFileSync(new URL("../src/app/privacy-acknowledgements-data.ts", import.meta.url), "utf8");

describe("My Commutes launch product boundary", () => {
  it("describes routes as rider-selected disruption monitors rather than journey recommendations", () => {
    assert.match(panel, /My Commutes monitors the TTC or GO\/UP rail route you intend to take/);
    assert.match(panel, /My Commutes monitors[\s\S]*it may not identify[\s\S]*the fastest route across every travel scenario/);
    assert.match(panel, /Monitoring the rail route you selected\. It may not be the fastest or more optimal route in every scenario\./);
    assert.match(panel, /saved-commute-route-purpose[\s\S]*<Info size=\{11\}/);
    assert.match(panel, /className="saved-commute-routing-boundary-trigger"[\s\S]*gridTemplateColumns: "minmax\(0, 1fr\) auto"[\s\S]*saved-commute-routing-boundary-label[\s\S]*<Info size=\{11\}[\s\S]*Monitored Routes Disclaimer/);
    assert.match(onboarding, /My Commutes is designed to monitor routes[\s\S]*It is not a[\s\S]*journey planner or wayfinder such as Google Maps/);
    assert.match(onboarding, /Monitor disruptions on routes within the transit systems LineWatchTO covers[\s\S]*My Commutes is not a journey[\s\S]*planner or wayfinder such as Google Maps/);
    assert.match(guide, /LineWatchTO checks that route for disruptions/);
  });

  it("gives mixed-network riders an honest launch workflow", () => {
    assert.match(panel, /If you use both systems,[\s\S]*save one route for[\s\S]*each/);
    assert.match(guide, /For a mixed-network commute, save one route for each system/);
    assert.match(privacy, /does not calculate a fastest cross-network journey/);
  });
});
