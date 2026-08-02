import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const scenarioBackendScript = readFileSync(
  new URL("../../scripts/dev-alert-scenario.sh", import.meta.url),
  "utf8",
);
const mockAlertsServerSource = readFileSync(
  new URL("../../scripts/mock-alerts-server.mjs", import.meta.url),
  "utf8",
);
const scenarioFrontendScript = readFileSync(
  new URL("../../scripts/dev-frontend-scenario.sh", import.meta.url),
  "utf8",
);
const liveBackendAliasUrl = new URL("../../scripts/dev-live-backend.sh", import.meta.url);
const liveFrontendScriptUrl = new URL("../../scripts/dev-live-frontend.sh", import.meta.url);
const alertScenarioBackendAliasUrl = new URL("../../scripts/dev-alert-scenario-backend.sh", import.meta.url);
const alertScenarioFrontendAliasUrl = new URL("../../scripts/dev-alert-scenario-frontend.sh", import.meta.url);
const regionalScenarioBackendUrl = new URL("../../scripts/dev-regional-alert-scenario-backend.sh", import.meta.url);
const regionalScenarioFrontendUrl = new URL("../../scripts/dev-regional-alert-scenario-frontend.sh", import.meta.url);
const regionalMockServerUrl = new URL("../../scripts/mock-regional-alerts-server.mjs", import.meta.url);
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

  it("keeps the scenario backend isolated from generic local live backend settings", () => {
    assert.match(scenarioBackendScript, /ORIGINAL_SERVER_PORT="\$\{SERVER_PORT:-\}"/);
    assert.match(scenarioBackendScript, /ORIGINAL_SPRING_DATASOURCE_URL="\$\{SPRING_DATASOURCE_URL:-\}"/);
    assert.match(scenarioBackendScript, /ORIGINAL_SPRING_DATA_REDIS_DATABASE="\$\{SPRING_DATA_REDIS_DATABASE:-\}"/);
    assert.match(scenarioBackendScript, /SCENARIO_SERVER_PORT="\$\{LINEWATCH_ALERT_SCENARIO_BACKEND_PORT:-\$\{ORIGINAL_SERVER_PORT:-8082\}\}"/);
    assert.match(
      scenarioBackendScript,
      /SCENARIO_SPRING_DATASOURCE_URL="\$\{LINEWATCH_ALERT_SCENARIO_DATASOURCE_URL:-\$\{ORIGINAL_SPRING_DATASOURCE_URL:-jdbc:postgresql:\/\/127\.0\.0\.1:5434\/linewatch_scenario\}\}"/,
    );
    assert.match(
      scenarioBackendScript,
      /SCENARIO_SPRING_DATA_REDIS_DATABASE="\$\{LINEWATCH_ALERT_SCENARIO_REDIS_DATABASE:-\$\{ORIGINAL_SPRING_DATA_REDIS_DATABASE:-1\}\}"/,
    );
    assert.match(scenarioBackendScript, /SERVER_PORT="\$SCENARIO_SERVER_PORT"/);
    assert.match(scenarioBackendScript, /SPRING_DATASOURCE_URL="\$SCENARIO_SPRING_DATASOURCE_URL"/);
    assert.match(scenarioBackendScript, /SPRING_DATA_REDIS_DATABASE="\$SCENARIO_SPRING_DATA_REDIS_DATABASE"/);
  });

  it("labels the local alert scenario browser tab with the scenario name", () => {
    assert.match(scenarioFrontendScript, /SCENARIO="\$\{LINEWATCH_ALERT_SCENARIO:-\$\{1:-all-alert-types\}\}"/);
    assert.match(scenarioFrontendScript, /Starting LineWatchTO alert scenario frontend/);
    assert.match(
      scenarioFrontendScript,
      /NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL="\$\{NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL:-Dev: \$SCENARIO\}"/,
    );
    assert.match(
      scenarioFrontendScript,
      /NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN="\$\{NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN:-true\}"/,
    );
  });

  it("serves a stable active scenario payload for one mock server process", () => {
    assert.match(mockAlertsServerSource, /const activeScenarioFeed = buildScenarioFeed\(scenario, \{ now: new Date\(\) \}\);/);
    assert.match(mockAlertsServerSource, /sendJson\(response, 200, activeScenarioFeed\);/);
    assert.doesNotMatch(mockAlertsServerSource, /sendJson\(response, 200, buildScenarioFeed\(scenario, \{ now: new Date\(\) \}\)\);/);
  });

  it("makes the shared all-alert-types runner deterministic across TTC and GO/UP modes", () => {
    assert.match(mockAlertsServerSource, /buildRegionalScenario\("all-alert-types"/);
    assert.match(mockAlertsServerSource, /ServiceUpdate\/ServiceAlert\/All/);
    assert.match(mockAlertsServerSource, /UP\/Gtfs\/Feed\/Alerts/);
    assert.match(scenarioBackendScript, /if \[ "\$SCENARIO" = "all-alert-types" \]/);
    assert.match(scenarioBackendScript, /LINEWATCH_INGESTION_METROLINX_ENABLED="\$REGIONAL_SCENARIO_ENABLED"/);
    assert.match(scenarioBackendScript, /LINEWATCH_INGESTION_METROLINX_BASE_URL="\$REGIONAL_SCENARIO_BASE_URL"/);
    assert.match(scenarioBackendScript, /GO\/UP ingestion is disabled for this TTC-focused scenario/);
  });

  it("provides a named live dev frontend script with a dev tab label", () => {
    assert.equal(existsSync(liveFrontendScriptUrl), true);

    const liveFrontendScript = readFileSync(liveFrontendScriptUrl, "utf8");

    assert.match(liveFrontendScript, /Starting LineWatchTO live dev frontend/);
    assert.match(liveFrontendScript, /NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL="\$\{NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL:-Dev\}"/);
    assert.match(liveFrontendScript, /NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN="\$\{NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN:-true\}"/);
    assert.match(liveFrontendScript, /npm --prefix "\$REPO_ROOT\/frontend" run dev/);
  });

  it("enables the local dev account in local live and alert scenario helpers", () => {
    const liveBackendScript = readFileSync(new URL("../../scripts/dev-backend-live.sh", import.meta.url), "utf8");
    const livePushBackendScript = readFileSync(livePushBackendScriptUrl, "utf8");
    const cloudflarePushScript = readFileSync(cloudflarePushScriptUrl, "utf8");

    assert.match(liveBackendScript, /LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED:=true/);
    assert.match(liveBackendScript, /export LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED/);
    assert.match(liveBackendScript, /Refusing to start on \$AVAILABLE_SERVER_PORT because the live frontend would continue calling \$REQUESTED_SERVER_PORT/);
    assert.doesNotMatch(liveBackendScript, /Backend server port[^\n]*Automatically switching/);
    assert.match(scenarioBackendScript, /LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED:=true/);
    assert.match(scenarioBackendScript, /export LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED/);
    assert.doesNotMatch(livePushBackendScript, /LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED:=true/);
    assert.doesNotMatch(cloudflarePushScript, /LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED:=true/);
  });

  it("provides precise mode-role script aliases without removing existing script names", () => {
    assert.equal(existsSync(liveBackendAliasUrl), true);
    assert.equal(existsSync(alertScenarioBackendAliasUrl), true);
    assert.equal(existsSync(alertScenarioFrontendAliasUrl), true);

    assert.match(readFileSync(liveBackendAliasUrl, "utf8"), /exec "\$SCRIPT_DIR\/dev-backend-live\.sh" "\$@"/);
    assert.match(
      readFileSync(alertScenarioBackendAliasUrl, "utf8"),
      /exec "\$SCRIPT_DIR\/dev-alert-scenario\.sh" "\$@"/,
    );
    assert.match(
      readFileSync(alertScenarioFrontendAliasUrl, "utf8"),
      /exec "\$SCRIPT_DIR\/dev-frontend-scenario\.sh" "\$@"/,
    );
  });

  it("runs regional scenarios through isolated Metrolinx-shaped source endpoints", () => {
    assert.equal(existsSync(regionalScenarioBackendUrl), true);
    assert.equal(existsSync(regionalScenarioFrontendUrl), true);
    assert.equal(existsSync(regionalMockServerUrl), true);

    const backend = readFileSync(regionalScenarioBackendUrl, "utf8");
    const frontend = readFileSync(regionalScenarioFrontendUrl, "utf8");
    const source = readFileSync(regionalMockServerUrl, "utf8");
    assert.match(backend, /LINEWATCH_INGESTION_METROLINX_ENABLED=true/);
    assert.match(backend, /LINEWATCH_INGESTION_ALERTS_ENABLED=false/);
    assert.match(backend, /linewatch_regional_scenario/);
    assert.match(backend, /CREATE DATABASE linewatch_regional_scenario/);
    assert.match(backend, /LINEWATCH_REGIONAL_ALERT_SCENARIO_REDIS_DATABASE:-2/);
    assert.match(frontend, /Dev: regional \$SCENARIO/);
    assert.match(source, /ServiceUpdate\/ServiceAlert\/All/);
    assert.match(source, /UP\/Gtfs\/Feed\/Alerts/);
    assert.match(source, /const payload = buildRegionalScenario\(scenario, \{ now: new Date\(\) \}\)/);
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
