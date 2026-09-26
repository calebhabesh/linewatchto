#!/usr/bin/env node

import { runOgCli } from "./scripts/generate-og-image.mjs";

const exitCode = await runOgCli(process.argv.slice(2), { defaultStyle: "blur" });
if (exitCode !== 0) {
  process.exit(exitCode);
}
