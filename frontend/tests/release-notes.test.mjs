import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  RELEASE_NOTES_SEEN_STORAGE_KEY,
  currentReleaseNote,
  latestReleaseNote,
  releaseNotePreviewForVersion,
  releaseNotes,
  shouldShowReleaseNotesNotice,
} from "../src/app/release-notes.ts";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const appUpdateBannerSource = readFileSync(new URL("../src/components/AppUpdateBanner.tsx", import.meta.url), "utf8");
const versionRouteSource = readFileSync(new URL("../src/app/version.json/route.ts", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const panelUrl = new URL("../src/components/ReleaseNotesPanel.tsx", import.meta.url);
const noticeUrl = new URL("../src/components/ReleaseNotesNotice.tsx", import.meta.url);

describe("release notes data", () => {
  it("keeps the latest release note aligned with the package app version", () => {
    assert.equal(latestReleaseNote.version, packageJson.version);
    assert.equal(currentReleaseNote?.version, packageJson.version);
    assert.ok(releaseNotes.length >= 1);
    assert.match(latestReleaseNote.title, /LineWatchTO|Release|What's New/i);
    assert.ok(latestReleaseNote.summary.length > 0);
    assert.ok(latestReleaseNote.sections.some((section) => section.items.length > 0));
    assert.doesNotMatch(JSON.stringify(releaseNotes), /Dev Notes/i);
  });

  it("provides a compact release-note preview for version.json and update banners", () => {
    const preview = releaseNotePreviewForVersion(packageJson.version);

    assert.equal(preview?.version, packageJson.version);
    assert.equal(preview?.title, latestReleaseNote.title);
    assert.equal(preview?.summary, latestReleaseNote.summary);
    assert.ok(preview?.sections.some((section) => section.items.length > 0));
  });

  it("shows the one-time notice only until the current app version has been seen", () => {
    assert.match(RELEASE_NOTES_SEEN_STORAGE_KEY, /linewatch-seen-release-notes-version/);
    assert.equal(shouldShowReleaseNotesNotice(currentReleaseNote, null), true);
    assert.equal(shouldShowReleaseNotesNotice(currentReleaseNote, ""), true);
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
  });

  it("adds release notes to desktop, mobile More, and update surfaces", () => {
    assert.match(shellSource, /setActiveView\("release-notes"\)/);
    assert.match(shellSource, /What's New/);
    assert.match(moreSheetSource, /onOpenReleaseNotes/);
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
