import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, test, type Browser } from "@playwright/test";

/**
 * Real Chrome on the machine's GPU and display, for checks that headless or
 * bundled Chromium cannot make: Chrome writes tile-memory warnings only to
 * its own stderr, which Playwright does not expose, so the suite starts
 * Chrome itself and attaches over CDP. Not part of CI or the release gate.
 */

export const MEASURED_PROJECT = "desktop-chrome";
const CHROME = process.env.LINEWATCH_CHROME ?? "google-chrome-stable";

/** Registers the suite's hooks; call once at a spec's top level. */
export function registerRealChrome({ window, debuggingPort }: {
  window: { width: number; height: number };
  debuggingPort: number;
}) {
  let chrome: ChildProcess | undefined;
  let profileDirectory: string | undefined;
  let browser: Browser | undefined;
  const chromeLog: string[] = [];

  test.skip(
    Boolean(process.env.CI) || !(process.env.DISPLAY || process.env.WAYLAND_DISPLAY),
    "Needs real Chrome on a display and GPU.",
  );

  test.beforeAll(async ({}, testInfo) => {
    // One real Chrome serves the suite; other projects only skip it.
    if (testInfo.project.name !== MEASURED_PROJECT) return;
    profileDirectory = mkdtempSync(join(tmpdir(), "linewatch-real-chrome-"));
    chrome = spawn(CHROME, [
      `--user-data-dir=${profileDirectory}`,
      `--remote-debugging-port=${debuggingPort}`,
      "--enable-logging=stderr",
      "--v=0",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      `--window-size=${window.width},${window.height}`,
      "about:blank",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    chrome.stderr?.setEncoding("utf8");
    chrome.stderr?.on("data", (chunk: string) => chromeLog.push(...chunk.split("\n")));
    for (let attempt = 0; ; attempt += 1) {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`);
        break;
      } catch (error) {
        if (attempt >= 50) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  });

  test.afterAll(async () => {
    await browser?.close().catch(() => undefined);
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise((resolve) => chrome?.once("exit", resolve));
      chrome.kill();
      await exited;
    }
    if (profileDirectory) rmSync(profileDirectory, { recursive: true, force: true });
  });

  return {
    browser: () => {
      if (!browser) throw new Error("real Chrome is not running");
      return browser;
    },
    /** Chrome's "tile memory limits exceeded" lines so far. */
    tileWarnings: () => chromeLog.filter((line) => line.includes("tile memory limits exceeded")).length,
  };
}
