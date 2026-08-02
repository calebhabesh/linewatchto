import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

const shellSource = await readFile(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const mobileStatusSource = await readFile(new URL("../src/components/MobileStatusSheet.tsx", import.meta.url), "utf8");
const mobileMoreSource = await readFile(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const panelSource = await readFile(new URL("../src/components/TtcAnnouncementsPanel.tsx", import.meta.url), "utf8");

describe("TTC announcements navigation", () => {
  it("adds the TTC-only destination to desktop menu and mobile More menu", () => {
    assert.match(shellSource, /navigateForward\("announcements"\)/);
    assert.match(shellSource, /selectedNetwork === "ttc"[\s\S]*TTC Announcements/);
    assert.doesNotMatch(mobileStatusSource, /onOpenCategory\("announcements"\)/);
    assert.match(mobileMoreSource, /onOpenAlertHistory[\s\S]*onOpenAnnouncements[\s\S]*TTC Announcements/);
  });

  it("keeps announcements informational-only and freshness honest", () => {
    assert.match(panelSource, /Official TTC updates and active system messages\. Informational only\./);
    assert.match(panelSource, /Neither a fresh TTC Live Alerts run nor the official TTC\.ca Updates listing is currently available/);
  });

  it("keeps search local after the initial announcement read", () => {
    assert.match(panelSource, /getTtcAnnouncements\(\)/);
    assert.doesNotMatch(panelSource, /getTtcAnnouncements\(\{ query:/);
  });

  it("uses neutral menu icons and reserves blue for the panel heading", () => {
    assert.match(shellSource, /Megaphone size=\{18\} className="text-slate-500 dark:text-slate-400" \/> TTC Announcements/);
    assert.match(mobileMoreSource, /Megaphone size=\{18\} className="text-slate-500 dark:text-slate-400" \/>\s*TTC Announcements/);
    assert.match(panelSource, /Megaphone className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400"/);
  });
});
