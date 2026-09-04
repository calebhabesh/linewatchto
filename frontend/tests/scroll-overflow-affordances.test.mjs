import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const controllerSource = readFileSync(
  new URL("../src/components/ScrollOverflowAffordances.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("../src/components/LineWatchShell.tsx", import.meta.url),
  "utf8",
);
const globalCss = readAppStylesheet();

describe("scroll overflow affordances", () => {
  it("mounts one overflow-aware controller for desktop and mobile list surfaces", () => {
    assert.match(shellSource, /<ScrollOverflowAffordances \/>/);
    [
      "#linewatch-main-menu-scroll",
      ".line-impact-panel-stack",
      ".alert-stack",
      ".closure-stack",
      ".commute-grid",
      ".my-stations-list",
      ".station-search-results",
      ".station-search-lines-column",
      ".station-search-stations-column",
      ".mobile-more-content-scroll",
      ".mobile-status-content-scroll",
      ".accessibility-outages-scroll",
      ".surface-notices-scroll",
    ].forEach((selector) => assert.ok(controllerSource.includes(`"${selector}"`), selector));
  });

  it("shows a seamless shallow gradient only while more content remains below", () => {
    assert.match(
      controllerSource,
      /scrollTop \+ element\.clientHeight < element\.scrollHeight - 2/,
    );
    assert.match(
      controllerSource,
      /toggleAttribute\(MORE_BELOW_ATTRIBUTE, hasMoreBelow\)/,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell \[data-scroll-more-below\]\s*\{[^}]*mask-image:\s*linear-gradient\(/s,
    );
    assert.match(globalCss, /#000 calc\(100% - 36px\)/);
    assert.match(globalCss, /rgba\(0, 0, 0, 0\.72\) calc\(100% - 24px\)/);
    assert.match(globalCss, /rgba\(0, 0, 0, 0\.32\) calc\(100% - 10px\)/);
    assert.doesNotMatch(globalCss, /\[data-scroll-more-below\]\s*\{[^}]*box-shadow:/s);
    assert.doesNotMatch(globalCss, /station-search-browse-container\[data-more-below\]::after/);
  });
});
