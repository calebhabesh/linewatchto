import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const scenarioBackendScript = readFileSync(
  new URL("../../scripts/dev-alert-scenario.sh", import.meta.url),
  "utf8",
);
const livePushBackendScriptUrl = new URL("../../scripts/dev-backend-live-push.sh", import.meta.url);
const cloudflarePushScriptUrl = new URL("../../scripts/dev-cloudflare-push.sh", import.meta.url);
const smokeDeployScriptUrl = new URL("../../scripts/smoke-deploy.mjs", import.meta.url);
const nextConfigSource = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

describe("alert scenario scripts", () => {
  it("passes GTFS schedule import settings into the scenario backend when a zip is available", () => {
    assert.match(scenarioBackendScript, /LINEWATCH_SCENARIO_GTFS_ZIP/);
    assert.match(scenarioBackendScript, /LINEWATCH_ARRIVALS_GTFS_IMPORT_ENABLED/);
    assert.match(scenarioBackendScript, /LINEWATCH_ARRIVALS_GTFS_ZIP_PATH/);
    assert.match(scenarioBackendScript, /tmp\/ttc-merged-gtfs\.zip/);
  });

  it("provides an opt-in live backend script with local Web Push keys", () => {
    const livePushBackendScript = readFileSync(livePushBackendScriptUrl, "utf8");

    assert.match(livePushBackendScript, /tmp\/linewatch-vapid\.env/);
    assert.match(livePushBackendScript, /createECDH\("prime256v1"\)/);
    assert.match(livePushBackendScript, /getPublicKey\(null,\s*"uncompressed"\)/);
    assert.match(livePushBackendScript, /LINEWATCH_PUSH_ENABLED=true/);
    assert.match(livePushBackendScript, /LINEWATCH_PUSH_VAPID_PUBLIC_KEY/);
    assert.match(livePushBackendScript, /LINEWATCH_PUSH_VAPID_PRIVATE_KEY/);
    assert.match(livePushBackendScript, /LINEWATCH_PUSH_VAPID_SUBJECT/);
    assert.match(livePushBackendScript, /spring-boot:run -Dspring-boot\.run\.profiles=dev-live/);
  });

  it("provides an end-to-end Cloudflare tunnel push test script", () => {
    const cloudflarePushScript = readFileSync(cloudflarePushScriptUrl, "utf8");

    assert.match(cloudflarePushScript, /\.cloudflared\/config\.yml/);
    assert.match(cloudflarePushScript, /hostname:/);
    assert.match(cloudflarePushScript, /LINEWATCH_PUSH_ENABLED=true/);
    assert.match(cloudflarePushScript, /LINEWATCH_AUTH_SECURE_COOKIE=true/);
    assert.match(cloudflarePushScript, /LINEWATCH_AUTH_ALLOWED_ORIGINS="\$PUBLIC_ORIGIN"/);
    assert.match(cloudflarePushScript, /LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL="\$PUBLIC_ORIGIN"/);
    assert.match(cloudflarePushScript, /NEXT_PUBLIC_LINEWATCH_API_BASE_URL=""/);
    assert.match(cloudflarePushScript, /NEXT_PUBLIC_LINEWATCH_ENABLE_SW=true/);
    assert.match(cloudflarePushScript, /LINEWATCH_BUILD_LABEL/);
    assert.match(cloudflarePushScript, /NEXT_PUBLIC_LINEWATCH_BUILD_LABEL="\$LINEWATCH_BUILD_LABEL"/);
    assert.doesNotMatch(cloudflarePushScript, /date -u \+%Y%m%d%H%M%S/);
    assert.match(cloudflarePushScript, /git -C "\$REPO_ROOT" rev-parse --short HEAD/);
    assert.match(cloudflarePushScript, /LINEWATCH_DEV_ALLOWED_ORIGIN="\$TUNNEL_HOSTNAME"/);
    assert.match(cloudflarePushScript, /cloudflared tunnel --config "\$CLOUDFLARED_CONFIG" run/);
    assert.match(cloudflarePushScript, /npm --prefix "\$REPO_ROOT\/frontend" run dev/);
    assert.match(cloudflarePushScript, /spring-boot:run -Dspring-boot\.run\.profiles=dev-live/);
  });

  it("lets the Cloudflare tunnel hostname through Next dev origin checks", () => {
    assert.match(nextConfigSource, /LINEWATCH_DEV_ALLOWED_ORIGIN/);
    assert.match(nextConfigSource, /allowedDevOrigins/);
    assert.match(nextConfigSource, /packageJson\.version/);
    assert.match(nextConfigSource, /NEXT_PUBLIC_LINEWATCH_APP_VERSION/);
    assert.match(nextConfigSource, /NEXT_PUBLIC_LINEWATCH_BUILD_LABEL/);
  });

  it("checks GTFS schedule health during deployment smoke verification", () => {
    const smokeDeployScript = readFileSync(smokeDeployScriptUrl, "utf8");

    assert.match(smokeDeployScript, /api\/health\/schedule/);
    assert.match(smokeDeployScript, /serviceDaysRemaining/);
    assert.match(smokeDeployScript, /refreshStatus/);
    assert.match(smokeDeployScript, /refreshErrorMessage/);
  });
});
