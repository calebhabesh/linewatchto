import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRuleGroup, definitionsPath, withLinewatchRoute } from "../grafana-apply-alerts.mjs";

const definitions = JSON.parse(readFileSync(definitionsPath, "utf8"));

test("every rule is routable, thresholded, and avoids labels Adaptive Metrics aggregates away", () => {
  const group = buildRuleGroup(definitions);
  assert.equal(group.interval, 60);
  assert.equal(new Set(group.rules.map((rule) => rule.uid)).size, group.rules.length);
  for (const rule of group.rules) {
    assert.equal(rule.labels.project, "linewatch");
    assert.match(rule.data[0].model.expr, /environment="production"/);
    assert.doesNotMatch(rule.data[0].model.expr, /status=/);
    assert.equal(rule.data[1].model.expression, "A");
  }
});

test("the stale-ingestion and missing-metrics rules alert when data disappears", () => {
  const byUid = Object.fromEntries(buildRuleGroup(definitions).rules.map((rule) => [rule.uid, rule]));
  assert.equal(byUid["linewatch-ttc-ingestion-stale"].noDataState, "Alerting");
  assert.equal(byUid["linewatch-backend-scrape-missing"].noDataState, "Alerting");
});

test("routing replaces only the LineWatch route and keeps the default receiver", () => {
  const unrelated = { receiver: "other", object_matchers: [["team", "=", "billing"]] };
  const stale = { receiver: "old", object_matchers: [["project", "=", "linewatch"]] };
  const tree = withLinewatchRoute({ receiver: "empty", routes: [stale, unrelated] }, definitions);
  assert.equal(tree.receiver, "empty");
  assert.deepEqual(tree.routes.map((route) => route.receiver), ["LineWatchTO email", "other"]);
});
