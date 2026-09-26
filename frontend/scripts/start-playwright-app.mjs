import { access, readFile, stat, writeFile } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const stampPath = path.join(rootDir, ".next", ".linewatch-playwright-build-stamp");

const testEnvironment = {
  ...process.env,
  BACKEND_URL: process.env.BACKEND_URL ?? "http://127.0.0.1:4174",
  NEXT_PUBLIC_LINEWATCH_API_BASE_URL:
    process.env.NEXT_PUBLIC_LINEWATCH_API_BASE_URL ?? "http://127.0.0.1:4174",
};

async function hasBuildOutput() {
  try {
    await access(new URL("../.next/BUILD_ID", import.meta.url));
    return true;
  } catch {
    return false;
  }
}

function getMaxMtime(targetPath) {
  try {
    const s = statSync(targetPath);
    if (!s.isDirectory()) return s.mtimeMs;
    let max = s.mtimeMs;
    for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
      max = Math.max(max, getMaxMtime(path.join(targetPath, entry.name)));
    }
    return max;
  } catch {
    return 0;
  }
}

async function isBuildFresh() {
  if (!(await hasBuildOutput())) return false;
  const reuseEnv = process.env.LINEWATCH_PLAYWRIGHT_REUSE_BUILD;
  if (reuseEnv === "true") return true;
  if (reuseEnv === "false") return false;

  try {
    const stampContent = JSON.parse(await readFile(stampPath, "utf8"));
    if (stampContent.apiUrl !== testEnvironment.NEXT_PUBLIC_LINEWATCH_API_BASE_URL) {
      return false;
    }
    const stampStat = await stat(stampPath);
    const maxSourceMtime = Math.max(
      getMaxMtime(path.join(rootDir, "src")),
      getMaxMtime(path.join(rootDir, "public")),
      getMaxMtime(path.join(rootDir, "package.json")),
    );
    return stampStat.mtimeMs >= maxSourceMtime;
  } catch {
    return false;
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: testEnvironment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited from signal ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

if (!(await isBuildFresh())) {
  await run("npm", ["run", "build"]);
  try {
    await writeFile(
      stampPath,
      JSON.stringify({
        builtAt: Date.now(),
        apiUrl: testEnvironment.NEXT_PUBLIC_LINEWATCH_API_BASE_URL,
      }),
      "utf8",
    );
  } catch {
    // Non-fatal if stamp write fails
  }
}

const appPort = process.env.LINEWATCH_APP_PORT ?? (process.env.LINEWATCH_SMOKE_APP_URL ? new URL(process.env.LINEWATCH_SMOKE_APP_URL).port : "4175");
const server = spawn(
  "npm",
  ["run", "start", "--", "--hostname", "127.0.0.1", "--port", appPort],
  { env: testEnvironment, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.once("error", (error) => {
  throw error;
});
server.once("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
