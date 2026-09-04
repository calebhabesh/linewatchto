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
const noticeUrl = new URL("../src/components/ReleaseNotesNotice.tsx", import.meta.url);

describe("release notes data", () => {
  it("does not publish release notes for the inaugural 1.0.0 package version", () => {
    assert.equal(packageJson.version, "1.0.0");
    assert.equal(releaseNotes.length, 0);
    assert.equal(hasReleaseNotes, false);
    assert.equal(latestReleaseNote, null);
    assert.equal(currentReleaseNote, null);
    assert.equal(releaseNotePreviewForVersion(packageJson.version), null);
    assert.doesNotMatch(JSON.stringify(releaseNotes), /Dev Notes/i);
  });

  it("provides a compact release-note preview for version.json and update banners", () => {
    const preview = releaseNotePreviewForVersion(packageJson.version);

    assert.equal(preview, null);
  });

  it("shows the one-time notice only until the current app version has been seen", () => {
    assert.match(RELEASE_NOTES_SEEN_STORAGE_KEY, /linewatch-seen-release-notes-version/);
    assert.equal(shouldShowReleaseNotesNotice(currentReleaseNote, null), false);
    assert.equal(shouldShowReleaseNotesNotice(currentReleaseNote, ""), false);
    assert.equal(shouldShowReleaseNotesNotice(currentReleaseNote, packageJson.version), false);
    assert.equal(shouldShowReleaseNotesNotice(null, packageJson.version), false);
  });
});

describe("release notes UI wiring", () => {
  it("adds a release notes panel and one-time notice to the dashboard shell", () => {
    assert.equal(existsSync(panelUrl), true);
    assert.equal(existsSync(noticeUrl), true);
    const panelSource = readFileSync(panelUrl, "utf8");
    const noticeSource = readFileSync(noticeUrl, "utf8");

    assert.match(panelSource, /export function ReleaseNotesPanel/);
    assert.match(panelSource, /releaseNotes/);
    assert.match(panelSource, /currentReleaseNote/);
    assert.match(noticeSource, /export function ReleaseNotesNotice/);
    assert.match(noticeSource, /shouldShowReleaseNotesNotice/);
    assert.match(noticeSource, /localStorage/);
    assert.match(shellSource, /"release-notes"/);
    assert.match(shellSource, /ReleaseNotesPanel/);
    assert.match(shellSource, /ReleaseNotesNotice/);
    assert.match(shellSource, /panel=release-notes/);
    assert.match(shellSource, /hasReleaseNotes/);
  });

  it("adds release notes to desktop, mobile More, and update surfaces", () => {
    assert.match(shellSource, /navigateForward\("release-notes"\)/);
    assert.match(shellSource, /What's New/);
    assert.match(moreSheetSource, /onOpenReleaseNotes/);
    assert.match(moreSheetSource, /hasReleaseNotes/);
    assert.match(moreSheetSource, /What's New/);
    assert.match(appUpdateBannerSource, /releaseNote/);
    assert.match(appUpdateBannerSource, /View changes/);
    assert.match(versionRouteSource, /releaseNotePreviewForVersion/);
    assert.match(versionRouteSource, /releaseNote:/);
    assert.match(globalCss, /\.release-notes-panel/);
    assert.match(globalCss, /\.release-notes-notice/);
    assert.match(globalCss, /\.release-notes-notice[\s\S]*pointer-events:\s*none/);
    assert.match(globalCss, /\.release-notes-notice-actions button[\s\S]*pointer-events:\s*auto/);
  });
});
