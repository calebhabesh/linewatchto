import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  acknowledgementSections,
  dataPracticeSections,
  privacyAcknowledgementLinks,
} from "../src/app/privacy-acknowledgements-data.ts";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const panelUrl = new URL("../src/components/PrivacyAcknowledgementsPanel.tsx", import.meta.url);

describe("privacy and acknowledgement content", () => {
  it("credits the TTC and Metrolinx map references while keeping LineWatchTO clearly unofficial", () => {
    const combinedCopy = JSON.stringify(acknowledgementSections);

    assert.match(combinedCopy, /LineWatchTO is unofficial/i);
    assert.doesNotMatch(combinedCopy, /LineWatch TO/i);
    assert.match(combinedCopy, /not affiliated with, endorsed by, or operated by the TTC/i);
    assert.match(combinedCopy, /Contains information licensed under the Open Government Licence – Toronto\./);
    assert.match(combinedCopy, /does not apply to TTC Live Alerts or Metrolinx source records/i);
    assert.match(combinedCopy, /TTC and Metrolinx map references credited/i);
    assert.match(combinedCopy, /does not grant rights to third-party names, marks, or referenced designs/i);
    assert.match(combinedCopy, /independently re-created the rapid-transit map in Inkscape/i);
    assert.match(combinedCopy, /independently re-created the GO\/UP regional map in Inkscape/i);
    assert.match(combinedCopy, /optimized app rendering and data referencing\/formatting/i);
    assert.match(combinedCopy, /not a downloaded TTC map file/i);
    assert.match(combinedCopy, /not a downloaded Metrolinx map image/i);
    assert.match(combinedCopy, /Toronto Transit Commission/i);
    assert.match(combinedCopy, /Metrolinx/i);
  });

  it("summarizes privacy-sensitive app behavior", () => {
    const combinedCopy = JSON.stringify(dataPracticeSections);

    assert.match(combinedCopy, /Account/i);
    assert.match(combinedCopy, /My Commutes/);
    assert.match(combinedCopy, /push notification/i);
    assert.match(combinedCopy, /random browser-installation identifier/i);
    assert.match(combinedCopy, /feedback/i);
    assert.match(combinedCopy, /Cloudflare Web Analytics/i);
    assert.match(combinedCopy, /local storage/i);
  });

  it("keeps source and contact links centralized", () => {
    const urls = privacyAcknowledgementLinks.map((link) => link.href);

    assert.ok(urls.includes("https://www.ttc.ca/routes-and-schedules/1/0"));
    assert.ok(urls.includes("https://assets.metrolinx.com/image/upload/v1695737837/Images/GO/system-map.png"));
    assert.ok(urls.includes("https://open.toronto.ca/dataset/ttc-gtfs-realtime-gtfs-rt/"));
    assert.ok(urls.includes("https://open.toronto.ca/open-data-licence/"));
    assert.ok(urls.includes("https://www.ttc.ca/transparency-and-accountability/policies/web-site-terms-and-conditions-of-use"));
    assert.ok(urls.includes("https://www.ttc.ca/customer-service/contact-us"));
    assert.ok(urls.includes("https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/"));
    assert.ok(urls.includes("https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/"));
  });
});

describe("privacy and acknowledgement navigation", () => {
  const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
  const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
  const globalCss = readAppStylesheet();

  it("adds a desktop menu item and a mobile More entry", () => {
    assert.equal(existsSync(panelUrl), true);
    assert.match(shellSource, /"privacy-acknowledgements"/);
    assert.match(shellSource, /PrivacyAcknowledgementsPanel/);
    assert.match(shellSource, /navigateForward\("privacy-acknowledgements"\)/);
    assert.match(shellSource, /Privacy & Acknowledgements/);
    assert.match(moreSheetSource, /onOpenPrivacyAcknowledgements/);
    assert.match(moreSheetSource, /Privacy &amp; Acknowledgements/);
  });

  it("shows both derivative-map attributions directly in mobile More", () => {
    assert.match(moreSheetSource, /Map Attribution/);
    assert.match(moreSheetSource, /Diagrams independently re-created in Inkscape/);
    assert.match(moreSheetSource, /Diagram based on the TTC route map/);
    assert.match(moreSheetSource, /Diagram based on the Metrolinx system map/);
    assert.match(moreSheetSource, /Derivative replicas · Not downloaded originals · Not to scale/);
    assert.match(moreSheetSource, /aria-label="Map Attribution"/);
    assert.match(globalCss, /\.mobile-more-map-attribution-sources\s*\{[^}]*display:\s*grid;/s);
    assert.match(globalCss, /\.mobile-more-map-attribution-summary\s*\{[^}]*color:\s*#475569;/s);
    assert.match(globalCss, /\.dark \.mobile-more-map-attribution-summary\s*\{[^}]*color:\s*#cbd5e1;/s);
    assert.match(globalCss, /\.mobile-more-map-attribution-note\s*\{[^}]*color:\s*#475569;/s);
    assert.match(globalCss, /\.dark \.mobile-more-map-attribution-note\s*\{[^}]*color:\s*#cbd5e1;/s);
  });
});
