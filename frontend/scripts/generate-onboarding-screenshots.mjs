#!/usr/bin/env node
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL("..", import.meta.url));
const assets = path.join(frontend, "public/assets/linewatch/onboarding");
const previewDir = path.resolve(frontend, "../artifacts/onboarding");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(`Refresh onboarding screenshots from the current local UI and synthetic examples.

npm --prefix frontend run screenshots:onboarding
npm --prefix frontend run screenshots:onboarding -- --project=mobile
npm --prefix frontend run screenshots:onboarding -- --grep impact-details

Playwright selection options are forwarded. Requires npm ci and Playwright Chromium.
Uses isolated ports 4193/4194; no running app, database, or credentials needed.
All selected captures must pass before any slideshow assets are replaced.
Review: artifacts/onboarding/index.html`);
  process.exit(0);
}
const staging = await mkdtemp(path.join(tmpdir(), "linewatch-onboarding-"));
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test",
      "capture.spec.ts", "--config", "playwright.onboarding.config.ts", ...args], {
      cwd: frontend, stdio: "inherit", env: { ...process.env, LINEWATCH_ONBOARDING_OUTPUT: staging },
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (code !== 0) throw new Error(`Capture failed (exit ${code}); slideshow assets were not replaced.`);
  const images = (await readdir(staging)).filter((file) => file.endsWith(".png"));
  if (!images.length) throw new Error("No screenshots captured; slideshow assets were not replaced.");
  await mkdir(assets, { recursive: true });
  for (const file of images) await copyFile(path.join(staging, file), path.join(assets, file));
  const features = ["map-guide", "impact-details", "my-commutes-v3", "my-stations-v3"];
  const figures = ["desktop", "mobile"].flatMap((device) => features.map((feature) => {
    const name = `${device}-${feature}`;
    return `<figure><figcaption>${name}</figcaption><a href="../../frontend/public/assets/linewatch/onboarding/${name}.png"><img src="../../frontend/public/assets/linewatch/onboarding/${name}.png" alt="${name}"></a></figure>`;
  }));
  await mkdir(previewDir, { recursive: true });
  await writeFile(path.join(previewDir, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LineWatchTO onboarding captures</title><style>body{margin:32px;background:#0d131c;color:#e8eef7;font:16px system-ui}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}figure{margin:0}figcaption{margin:0 0 12px;font-size:13px}img{width:100%;height:300px;object-fit:contain;object-position:top;background:#090d12;border:1px solid #334155;border-radius:8px}@media(max-width:900px){main{grid-template-columns:repeat(2,minmax(0,1fr))}}</style><h1>Onboarding screenshots</h1><p>Current UI with synthetic demo data. Click an image to inspect it at full resolution.</p><main>${figures.join("\n")}</main></html>`);
  console.log(`Updated ${images.length} screenshot(s). Review ${path.join(previewDir, "index.html")}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
