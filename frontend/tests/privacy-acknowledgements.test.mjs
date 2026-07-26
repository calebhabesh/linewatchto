import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  acknowledgementSections,
  dataPracticeSections,
  privacyAcknowledgementLinks,
} from "../src/app/privacy-acknowledgements-data.ts";

const panelUrl = new URL("../src/components/PrivacyAcknowledgementsPanel.tsx", import.meta.url);

describe("privacy and acknowledgement content", () => {
  it("credits TTC assets while keeping LineWatchTO clearly unofficial", () => {
    const combinedCopy = JSON.stringify(acknowledgementSections);

    assert.match(combinedCopy, /LineWatchTO is unofficial/i);
    assert.doesNotMatch(combinedCopy, /LineWatch TO/i);
    assert.match(combinedCopy, /not affiliated with, endorsed by, or operated by the TTC/i);
    assert.match(combinedCopy, /Subway, Light Rail and Streetcar Map/i);
    assert.match(combinedCopy, /Toronto Transit Commission/i);
    assert.match(combinedCopy, /written permission/i);
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

    assert.ok(urls.includes("https://www.ttc.ca/routes-and-schedules"));
    assert.ok(urls.includes("https://www.ttc.ca/transparency-and-accountability/policies/web-site-terms-and-conditions-of-use"));
    assert.ok(urls.includes("https://www.ttc.ca/customer-service/contact-us"));
    assert.ok(urls.includes("https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/"));
    assert.ok(urls.includes("https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/"));
  });
});

describe("privacy and acknowledgement navigation", () => {
  const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
  const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
  const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

  it("adds a desktop menu item and a mobile More entry", () => {
    assert.equal(existsSync(panelUrl), true);
    assert.match(shellSource, /"privacy-acknowledgements"/);
    assert.match(shellSource, /PrivacyAcknowledgementsPanel/);
    assert.match(shellSource, /setActiveView\("privacy-acknowledgements"\)/);
    assert.match(shellSource, /Privacy & Acknowledgements/);
    assert.match(moreSheetSource, /onOpenPrivacyAcknowledgements/);
    assert.match(moreSheetSource, /Privacy & Acknowledgements/);
  });

  it("shows the TTC map attribution directly in mobile More", () => {
    assert.match(moreSheetSource, /Map Attribution/);
    assert.match(moreSheetSource, /© 2026 Toronto Transit Commission 02\/26 - Map Not to Scale/);
    assert.match(moreSheetSource, /aria-label="Map Attribution"/);
    assert.match(globalCss, /\.mobile-more-map-attribution-copyright\s*\{[^}]*color:\s*#475569;/s);
    assert.match(globalCss, /\.dark \.mobile-more-map-attribution-copyright\s*\{[^}]*color:\s*#cbd5e1;/s);
  });
});
