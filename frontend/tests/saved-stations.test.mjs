import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = process.cwd();

function loadModule(relativePath, extra = {}) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(`(function (require, module, exports) { ${output}\n})`, { console })(
    (id) => extra[id] ?? require(id), loadedModule, loadedModule.exports,
  );
  return loadedModule.exports;
}

const { filterAndSortSavedStations } = loadModule("src/app/saved-stations.ts");

function saved(id, name, lineIds, options = {}) {
  return {
    station: {
      id, name, lineIds, mapX: 0, mapY: 0, interchange: lineIds.length > 1,
      hasActiveImpact: options.impact ?? false,
      accessStatus: options.outage ? "outage" : "normal",
      accessOutageCounts: { elevator: options.outage ? 1 : 0, escalator: 0 },
    },
    savedAt: options.savedAt ?? "2026-07-23T12:00:00Z",
  };
}

test("saved station filtering includes interchanges on every served line", () => {
  const stations = [
    saved("sheppard-yonge", "Sheppard-Yonge", ["line-1", "line-4"]),
    saved("union", "Union", ["line-1"]),
  ];
  assert.deepEqual(
    filterAndSortSavedStations(stations, "sheppard", "line-4", "name").map((item) => item.station.id),
    ["sheppard-yonge"],
  );
});

test("needs-attention sort prioritizes service impacts then access outages", () => {
  const stations = [
    saved("union", "Union", ["line-1"]),
    saved("kennedy", "Kennedy", ["line-2", "line-5"], { outage: true }),
    saved("finch", "Finch", ["line-1"], { impact: true }),
  ];
  assert.deepEqual(
    filterAndSortSavedStations(stations, "", "all", "attention").map((item) => item.station.id),
    ["finch", "kennedy", "union"],
  );
});

test("saved date and line sorts are deterministic", () => {
  const stations = [
    saved("kennedy", "Kennedy", ["line-2", "line-5"], { savedAt: "2026-07-20T12:00:00Z" }),
    saved("union", "Union", ["line-1"], { savedAt: "2026-07-23T12:00:00Z" }),
  ];
  assert.deepEqual(filterAndSortSavedStations(stations, "", "all", "recent").map((item) => item.station.id), ["union", "kennedy"]);
  assert.deepEqual(filterAndSortSavedStations(stations, "", "all", "oldest").map((item) => item.station.id), ["kennedy", "union"]);
  assert.deepEqual(filterAndSortSavedStations(stations, "", "all", "line").map((item) => item.station.id), ["union", "kennedy"]);
});

test("saved station notice toast uses max-content width so mobile toasts remain single-line unless constrained", () => {
  const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  const noticeRuleMatch = css.match(/\.saved-station-global-notice\s*\{([^}]+)\}/);
  assert.ok(noticeRuleMatch, "found .saved-station-global-notice rule");
  const block = noticeRuleMatch[1];
  assert.match(block, /width:\s*max-content;/, "toast specifies width: max-content");
  assert.match(block, /max-width:\s*calc\(100vw\s*-\s*24px\);/, "toast specifies max-width constraint");
});

