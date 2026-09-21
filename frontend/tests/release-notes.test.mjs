import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  RELEASE_NOTES_SEEN_STORAGE_KEY,
  currentReleaseNote,
  hasReleaseNotes,
  latestReleaseNote,
  releaseNotePreviewForVersion,
  releaseNotes,
  shouldShowReleaseNotesNotice,
} from "../src/app/release-notes.ts";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const appUpdateBannerSource = readFileSync(new URL("../src/components/AppUpdateBanner.tsx", import.meta.url), "utf8");
const versionRouteSource = readFileSync(new URL("../src/app/version.json/route.ts", import.meta.url), "utf8");
const globalCss = readAppStylesheet();
const panelUrl = new URL("../src/components/ReleaseNotesPanel.tsx", import.meta.url);
const onboardingUrl = new URL("../src/components/OpeningDisclaimer.tsx", import.meta.url);
const cardUrl = new URL("../src/components/ReleaseNoteCard.tsx", import.meta.url);

describe("release notes data", () => {
  it("publishes semantic-version release notes newest first", () => {
    assert.equal(packageJson.version, "1.1.0");
    assert.deepEqual(releaseNotes.map((note) => note.version), ["1.1.0", "1.0.0"]);
    assert.equal(hasReleaseNotes, true);
    assert.equal(latestReleaseNote?.version, "1.1.0");
    assert.equal(currentReleaseNote?.version, packageJson.version);
    assert.equal(releaseNotePreviewForVersion("1.0.0")?.title, "The first LineWatchTO release");
    assert.doesNotMatch(JSON.stringify(releaseNotes), /Dev Notes/i);
  });

  it("provides a compact release-note preview for version.json and update banners", () => {
    const preview = releaseNotePreviewForVersion(packageJson.version);

    assert.equal(preview?.version, packageJson.version);
    assert.equal(preview?.title, "A new way to explore");
    assert.match(preview?.summary ?? "", /Map view/);
  });

  it("shows the one-time notice only until the current app version has been seen", () => {
    assert.match(RELEASE_NOTES_SEEN_STORAGE_KEY, /linewatch-seen-release-notes-version/);
    assert.equal(shouldShowReleaseNotesNotice(currentReleaseNote, null), true);
    assert.equal(shouldShowReleaseNotesNotice(currentReleaseNote, ""), true);
    assert.equal(shouldShowReleaseNotesNotice(currentReleaseNote, "1.0.0"), true);
    assert.equal(shouldShowReleaseNotesNotice(currentReleaseNote, packageJson.version), false);
    assert.equal(shouldShowReleaseNotesNotice(releaseNotes[1], null), false);
    assert.equal(shouldShowReleaseNotesNotice(null, packageJson.version), false);
  });
});

describe("release notes UI wiring", () => {
  it("adds release notes to the opening experience without a floating notice", () => {
    assert.equal(existsSync(panelUrl), true);
    assert.equal(existsSync(onboardingUrl), true);
    const panelSource = readFileSync(panelUrl, "utf8");
    const onboardingSource = readFileSync(onboardingUrl, "utf8");
    const cardSource = readFileSync(cardUrl, "utf8");

    assert.match(panelSource, /export function ReleaseNotesPanel/);
    assert.match(panelSource, /releaseNotes/);
    assert.match(panelSource, /ReleaseNoteCard/);
    assert.doesNotMatch(panelSource, /release-notes-current/);
    assert.match(cardSource, /release-note-current-badge/);
    assert.match(cardSource, /release-note-version-prefix/);
    assert.match(cardSource, /Intl.DateTimeFormat\("en-CA"/);
    assert.match(onboardingSource, /ReleaseNoteCard/);
    assert.doesNotMatch(panelSource, /lineWatchAppVersionLabel/);
    assert.match(onboardingSource, /chooseOpeningExperience/);
    assert.match(onboardingSource, /RELEASE_NOTES_SEEN_STORAGE_KEY/);
    assert.match(onboardingSource, /opening-experience-release-tab/);
    assert.match(shellSource, /"release-notes"/);
    assert.match(shellSource, /ReleaseNotesPanel/);
    assert.doesNotMatch(shellSource, /ReleaseNotesNotice/);
    assert.match(shellSource, /panel=release-notes/);
    assert.match(shellSource, /hasReleaseNotes/);
  });

  it("adds release notes to desktop, mobile More, and update surfaces", () => {
    assert.match(shellSource, /navigateForward\("release-notes"\)/);
    assert.match(shellSource, /What's New/);
    assert.match(moreSheetSource, /onOpenReleaseNotes/);
    assert.match(moreSheetSource, /Release Notes/);
    assert.match(appUpdateBannerSource, /releaseNote/);
    assert.match(appUpdateBannerSource, /View Changes/);
    assert.match(versionRouteSource, /releaseNotePreviewForVersion/);
    assert.match(versionRouteSource, /releaseNote:/);
    assert.match(globalCss, /\.release-notes-panel/);
    assert.doesNotMatch(globalCss, /\.release-notes-notice/);
    assert.match(globalCss, /\.opening-release-notes/);
  });
});
