#!/usr/bin/env node
// Applies LineWatchTO alert rules, the email contact point, and its notification route
// to Grafana Cloud from infra/observability/grafana/linewatch-alerts.json.
//
// Usage: node scripts/grafana-apply-alerts.mjs [--dry-run] [--test-notification]
// Env:   GRAFANA_URL (default https://goldcobra1172.grafana.net)
//        GRAFANA_SA_TOKEN_FILE (default ~/.config/linewatch/grafana-sa-token)
// The service account needs alert provisioning permission (Admin role, or Editor plus
// "Alerting: Provisioning writer"). Objects stay editable in the Grafana UI, but the
// next apply overwrites UI edits to them; change the JSON instead.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const definitionsPath = join(repoRoot, "infra/observability/grafana/linewatch-alerts.json");

const EXPRESSION_DATASOURCE = "__expr__";

export function buildRuleGroup(definitions) {
  return {
    title: definitions.ruleGroup.name,
    folderUid: definitions.folder.uid,
    interval: durationSeconds(definitions.ruleGroup.interval),
    rules: definitions.rules.map((rule) => ({
      uid: rule.uid,
      title: rule.title,
      ruleGroup: definitions.ruleGroup.name,
      folderUID: definitions.folder.uid,
      condition: "B",
      for: rule.for,
      noDataState: rule.noData,
      execErrState: "Error",
      labels: { [definitions.route.matchLabel[0]]: definitions.route.matchLabel[1], severity: rule.severity },
      annotations: { summary: rule.summary, description: rule.description },
      data: [
        {
          refId: "A",
          relativeTimeRange: { from: 600, to: 0 },
          datasourceUid: definitions.datasourceUid,
          model: { refId: "A", expr: rule.expr, instant: true, range: false },
        },
        {
          refId: "B",
          relativeTimeRange: { from: 0, to: 0 },
          datasourceUid: EXPRESSION_DATASOURCE,
          model: {
            refId: "B",
            type: "threshold",
            expression: "A",
            conditions: [{ evaluator: { type: rule.op, params: [rule.threshold] } }],
          },
        },
      ],
    })),
  };
}

export function buildContactPoint(definitions) {
  const { uid, name, addresses } = definitions.contactPoint;
  return { uid, name, type: "email", settings: { addresses, singleEmail: false }, disableResolveMessage: false };
}

// Replaces only LineWatch's child route; every other route and the default receiver stay as they were.
export function withLinewatchRoute(policyTree, definitions) {
  const [label, value] = definitions.route.matchLabel;
  const route = {
    receiver: definitions.contactPoint.name,
    object_matchers: [[label, "=", value]],
    group_by: definitions.route.groupBy,
    repeat_interval: definitions.route.repeatInterval,
  };
  const isLinewatchRoute = (existing) => (existing.object_matchers ?? [])
    .some(([name, op, matchValue]) => name === label && op === "=" && matchValue === value);
  return { ...policyTree, routes: [route, ...(policyTree.routes ?? []).filter((existing) => !isLinewatchRoute(existing))] };
}

function durationSeconds(duration) {
  const match = /^(\d+)([smh])$/.exec(duration);
  if (!match) throw new Error(`Unsupported duration: ${duration}`);
  return Number(match[1]) * { s: 1, m: 60, h: 3600 }[match[2]];
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const definitions = JSON.parse(readFileSync(definitionsPath, "utf8"));
  const ruleGroup = buildRuleGroup(definitions);
  const contactPoint = buildContactPoint(definitions);

  if (args.has("--dry-run")) {
    console.log(JSON.stringify({ contactPoint, ruleGroup }, null, 2));
    return;
  }

  const baseUrl = (process.env.GRAFANA_URL ?? "https://goldcobra1172.grafana.net").replace(/\/$/, "");
  const tokenFile = process.env.GRAFANA_SA_TOKEN_FILE ?? join(homedir(), ".config/linewatch/grafana-sa-token");
  const token = readFileSync(tokenFile, "utf8").trim();

  const grafana = async (method, path, body, { allow404 = false } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Disable-Provenance": "true",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (allow404 && response.status === 404) return null;
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${text}`);
    return text ? JSON.parse(text) : null;
  };

  const { uid: folderUid, title: folderTitle } = definitions.folder;
  if (!(await grafana("GET", `/api/folders/${folderUid}`, undefined, { allow404: true }))) {
    await grafana("POST", "/api/folders", { uid: folderUid, title: folderTitle });
    console.log(`Created folder ${folderTitle}`);
  }

  const contactPoints = await grafana("GET", "/api/v1/provisioning/contact-points");
  if (contactPoints.some((existing) => existing.uid === contactPoint.uid)) {
    await grafana("PUT", `/api/v1/provisioning/contact-points/${contactPoint.uid}`, contactPoint);
  } else {
    await grafana("POST", "/api/v1/provisioning/contact-points", contactPoint);
  }
  console.log(`Contact point ${contactPoint.name} -> ${contactPoint.settings.addresses}`);

  const policies = await grafana("GET", "/api/v1/provisioning/policies");
  await grafana("PUT", "/api/v1/provisioning/policies", withLinewatchRoute(policies, definitions));
  console.log(`Routed ${definitions.route.matchLabel.join("=")} alerts to ${contactPoint.name}`);

  await grafana("PUT", `/api/v1/provisioning/folder/${folderUid}/rule-groups/${definitions.ruleGroup.name}`, ruleGroup);
  console.log(`Applied ${ruleGroup.rules.length} rules to ${folderTitle}/${ruleGroup.title}`);

  if (args.has("--test-notification")) {
    const { namespace } = await grafana("GET", "/api/frontend/settings");
    const receiver = Buffer.from(contactPoint.name).toString("base64url");
    await grafana("POST", `/apis/notifications.alerting.grafana.app/v1beta1/namespaces/${namespace}/receivers/${receiver}/test`, {
      integration: { ...contactPoint, version: "v1" },
      alert: {
        annotations: { summary: "LineWatchTO alerting test", description: "Sent by scripts/grafana-apply-alerts.mjs." },
        labels: { alertname: "LineWatchTO test", project: "linewatch" },
      },
    });
    console.log(`Sent a test notification to ${contactPoint.settings.addresses}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
