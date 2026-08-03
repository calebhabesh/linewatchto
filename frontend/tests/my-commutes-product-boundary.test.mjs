import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panel = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const guide = readFileSync(new URL("../src/components/SiteGuideDropdown.tsx", import.meta.url), "utf8");
const onboarding = readFileSync(new URL("../src/components/OpeningDisclaimer.tsx", import.meta.url), "utf8");
const privacy = readFileSync(new URL("../src/app/privacy-acknowledgements-data.ts", import.meta.url), "utf8");

describe("My Commutes launch product boundary", () => {
  it("describes routes as rider-selected disruption monitors rather than journey recommendations", () => {
    assert.match(panel, /My Commutes monitors the TTC or GO\/UP rail routes you select/);
    assert.match(panel, /the monitored routes may not be the[\s\S]*fastest or more optimal choices across every travel scenario/);
    assert.doesNotMatch(panel, /saved-commute-route-purpose/);
    assert.match(panel, /className="saved-commute-routing-boundary-trigger"[\s\S]*gridTemplateColumns: "minmax\(0, 1fr\) auto"[\s\S]*saved-commute-routing-boundary-label[\s\S]*<Info size=\{11\}[\s\S]*Monitored Routes Disclaimer/);
    assert.doesNotMatch(panel, /contentId="saved-commutes-routing-disclaimer"/);
    assert.match(panel, /className="saved-commute-routing-boundary-static"[\s\S]*Monitoring the rail routes you selected\. They may not be the fastest or more optimal routes in every scenario\./);
    assert.match(styles, /\.saved-commute-routing-boundary-disclosure\s*\{[^}]*margin:\s*-0\.125rem 0 -0\.25rem;/s);
    assert.match(styles, /@media \(max-width:\s*767px\)[\s\S]*?\.saved-commute-routing-boundary-disclosure\s*\{[^}]*margin-bottom:\s*-0\.375rem;/s);
    assert.match(styles, /@media \(max-width:\s*767px\)[\s\S]*?\.saved-commute-routing-boundary-static\s*\{[^}]*margin-bottom:\s*-0\.1875rem;/s);
    assert.match(styles, /\.saved-commute-routing-boundary-trigger\s*\{[^}]*min-height:\s*18px;/s);
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
