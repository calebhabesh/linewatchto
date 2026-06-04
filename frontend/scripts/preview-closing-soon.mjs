#!/usr/bin/env node
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { chromium } from "playwright";

const appUrl = process.argv[2] ?? "http://localhost:3001";
const previewTime = process.env.LINEWATCH_PREVIEW_TIME ?? "2026-06-04T00:45:00-04:00";
const preferredChannel = process.env.LINEWATCH_BROWSER_CHANNEL ?? "chrome";

async function launchBrowser() {
  try {
    return await chromium.launch({
      channel: preferredChannel,
      headless: false,
    });
  } catch (error) {
    console.warn(`Could not launch ${preferredChannel}; falling back to bundled Chromium.`);
    console.warn(error instanceof Error ? error.message : error);
    return chromium.launch({ headless: false });
  }
}

function acknowledgeDisclaimer() {
  window.localStorage.setItem("linewatch-disclaimer-ack-v1", "true");
}

function buildPreviewUrl(urlValue, timeValue) {
  const url = new URL(urlValue);
  url.searchParams.set("previewTime", timeValue);
  return url.toString();
}

const browser = await launchBrowser();
const context = await browser.newContext();
const page = await context.newPage();
const previewUrl = buildPreviewUrl(appUrl, previewTime);

await page.addInitScript(acknowledgeDisclaimer);

console.log(`Opening ${previewUrl}`);
await page.goto(previewUrl, { waitUntil: "networkidle" });

const closingSoon = page.getByRole("status").filter({ hasText: "Subway Closing Soon" });
try {
  await closingSoon.waitFor({ timeout: 10_000 });
  console.log("Subway Closing Soon chip is visible.");
} catch {
  console.warn("Subway Closing Soon chip was not found. Confirm the app is running and loaded correctly.");
}

const rl = readline.createInterface({ input, output });
await rl.question("Press Enter to close the preview browser...");
rl.close();
await browser.close();
