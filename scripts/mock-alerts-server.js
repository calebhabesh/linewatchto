#!/usr/bin/env node
const { spawn } = require("node:child_process");
const { join } = require("node:path");

const child = spawn(
  process.execPath,
  [join(__dirname, "mock-alerts-server.mjs"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
