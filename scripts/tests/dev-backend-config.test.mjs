import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const application = readFileSync(new URL("../../backend/src/main/resources/application.yml", import.meta.url), "utf8");
const defaultOrigins = application.match(/allowed-origins: \$\{LINEWATCH_AUTH_ALLOWED_ORIGINS:(.*)\}/)[1];

function launcherEnvironment(script, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "linewatch-dev-config-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "bin"));
    copyFileSync(new URL(`../${script}`, import.meta.url), join(root, "scripts", script));
    // Stub only external processes; execute the launcher's real defaults and exports.
    writeFileSync(join(root, "bin", "node"), '#!/bin/sh\nprintf "8080"\n', { mode: 0o755 });
    writeFileSync(join(root, "bin", "mvn"), `#!/bin/sh
printf 'CONFIG:%s|%s|%s\\n' "$SERVER_ADDRESS" "$LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS" "$LINEWATCH_AUTH_ALLOWED_ORIGINS"
`, { mode: 0o755 });
    const result = spawnSync("sh", [join(root, "scripts", script)], {
      encoding: "utf8",
      env: {
        PATH: `${join(root, "bin")}:/usr/bin:/bin`,
        LINEWATCH_PUSH_VAPID_PUBLIC_KEY: "test-public-key",
        LINEWATCH_PUSH_VAPID_PRIVATE_KEY: "test-private-key",
        ...overrides,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const config = result.stdout.split("\n").find((line) => line.startsWith("CONFIG:"));
    assert.ok(config, result.stdout);
    const [address, devLinks, origins] = config.slice(7).split("|");
    return { address, devLinks, origins: origins || defaultOrigins };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const script of ["dev-backend-live.sh", "dev-backend-live-push.sh"]) {
  test(`${script} defaults to origins compatible with local recovery links`, () => {
    const config = launcherEnvironment(script);
    assert.equal(config.address, "127.0.0.1");
    assert.equal(config.devLinks, "true");
    const origins = config.origins.split(",");
    for (const origin of origins) {
      const hostname = URL.canParse(origin) ? new URL(origin).hostname : null;
      assert.ok(
        ["localhost", "127.0.0.1", "[::1]"].includes(hostname),
        "Password-reset dev links expose account recovery tokens and are local-only: all allowed origins must use loopback hosts.",
      );
    }
    assert.ok(origins.includes("http://localhost:3000"));
    assert.ok(origins.includes("http://127.0.0.1:4173"));
  });

  test(`${script} preserves explicit LAN configuration with recovery links disabled`, () => {
    const config = launcherEnvironment(script, {
      SERVER_ADDRESS: "0.0.0.0",
      LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS: "false",
      LINEWATCH_AUTH_ALLOWED_ORIGINS: "http://192.168.1.2:3000",
    });
    assert.equal(config.address, "0.0.0.0");
    assert.equal(config.devLinks, "false");
    assert.equal(config.origins, "http://192.168.1.2:3000");
  });
}
