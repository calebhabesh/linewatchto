import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { scheduleAssetNames, shrinkProblems, validateScheduleAssetSet } from "../lib/schedule-asset-validation.mjs";
import { tablesSha256 } from "../../services/schedule-assets/lib/feeds.mjs";
import {
  hashedName,
  logicalName,
  manifestFileUrls,
  publishNetwork,
  pruneFiles,
  readManifest,
  sameApartFromArchive,
} from "../../services/schedule-assets/lib/publish.mjs";
import { createScheduleAssetService } from "../../services/schedule-assets/lib/service.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const geographic = join(repo, "frontend/public/assets/linewatch/geographic");
const scriptsDir = join(repo, "scripts");
const temps = [];
const temp = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), `linewatch-${prefix}-`));
  temps.push(dir);
  return dir;
};
after(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** The committed release files, as the image bakes them. */
function bakedDir() {
  const dir = temp("baked");
  for (const name of readdirSync(geographic)) copyFileSync(join(geographic, name), join(dir, name));
  copyFileSync(join(repo, "backend/src/main/resources/regional/go-bus-stops.csv"), join(dir, "go-bus-stops.csv"));
  return dir;
}
const readSet = (network, dir) => Object.fromEntries(scheduleAssetNames(network).map((name) => [name, readFileSync(join(dir, name))]));
const json = (buffer) => JSON.parse(buffer.toString("utf8"));
const buffer = (value) => Buffer.from(JSON.stringify(value) + "\n");

/** A GTFS-shaped zip whose tables are given; `order` and `level` vary the archive, not the tables. */
function makeZip(dir, name, tables, { order = Object.keys(tables), level = "-6" } = {}) {
  const source = join(dir, `${name}-src`);
  mkdirSync(source, { recursive: true });
  for (const [table, text] of Object.entries(tables)) writeFileSync(join(source, table), text);
  const zip = join(dir, name);
  rmSync(zip, { force: true });
  execFileSync("zip", ["-q", "-X", level, zip, ...order], { cwd: source });
  return zip;
}

describe("hashed names", () => {
  it("name a file by its content and map back to the logical name", () => {
    const a = hashedName("ttc-surface-bus.json", Buffer.from("a"));
    assert.match(a, /^ttc-surface-bus\.[0-9a-f]{16}\.json$/);
    assert.notEqual(a, hashedName("ttc-surface-bus.json", Buffer.from("b")));
    assert.equal(a, hashedName("ttc-surface-bus.json", Buffer.from("a")));
    assert.equal(logicalName(a), "ttc-surface-bus.json");
    assert.equal(logicalName(`${a}.br`), "ttc-surface-bus.json");
    assert.equal(logicalName("go-bus-stops.0123456789abcdef.csv"), "go-bus-stops.csv");
    assert.equal(logicalName("manifest.json"), null);
  });

  it("treat a re-zip's archive hash as no change", () => {
    const a = buffer({ source: { feedVersion: "S1", archiveSha256: "aa" }, features: [1] });
    const b = buffer({ source: { feedVersion: "S1", archiveSha256: "bb" }, features: [1] });
    const c = buffer({ source: { feedVersion: "S1", archiveSha256: "bb" }, features: [2] });
    assert.ok(sameApartFromArchive(a, b));
    assert.ok(!sameApartFromArchive(a, c));
  });
});

describe("publishing", () => {
  const ttc = readSet("ttc", geographic);
  const meta = { origin: "release", feedVersion: "S1000544", feedStartDate: "2026-11-01", feedEndDate: "2026-12-19" };

  it("writes every file (with .gz and .br) before the manifest, and keeps the other network", async () => {
    const root = temp("vol");
    await publishNetwork(root, "go", { "go-bus-stops.csv": Buffer.from("stop_code,name,routes\n") }, { origin: "release", feedVersion: "G1" });
    const { changed, manifest } = await publishNetwork(root, "ttc", ttc, meta);
    assert.ok(changed);
    assert.deepEqual(Object.keys(manifest.networks).sort(), ["go", "ttc"]);
    for (const [name, path] of Object.entries(manifest.networks.ttc.files)) {
      assert.deepEqual(readFileSync(join(root, path)), ttc[name], name);
      assert.ok(existsSync(join(root, `${path}.gz`)) && existsSync(join(root, `${path}.br`)), `${name} is precompressed`);
    }
    assert.equal(manifestFileUrls(manifest)["search-index-ttc.json"], `/data/schedule/${manifest.networks.ttc.files["search-index-ttc.json"]}`);
    assert.ok(!readdirSync(join(root, "files")).some((file) => file.includes(".tmp-")), "no temporary files left");
  });

  it("does not rewrite the manifest for the same set, and reuses a file that differs only by archive hash", async () => {
    const root = temp("vol");
    const first = await publishNetwork(root, "ttc", ttc, meta);
    const again = await publishNetwork(root, "ttc", ttc, meta, { now: new Date(Date.now() + 1000) });
    assert.equal(again.changed, false);
    const rezipped = { ...ttc };
    const bus = json(ttc["ttc-surface-bus.json"]);
    bus.source.archiveSha256 = "f".repeat(64);
    rezipped["ttc-surface-bus.json"] = buffer(bus);
    const third = await publishNetwork(root, "ttc", rezipped, { ...meta, origin: "runtime" });
    assert.equal(third.manifest.networks.ttc.files["ttc-surface-bus.json"], first.manifest.networks.ttc.files["ttc-surface-bus.json"]);
    assert.equal(third.manifest.generation, first.manifest.generation, "same files, same generation");
    assert.equal(third.manifest.networks.ttc.origin, "runtime");
  });

  it("leaves the last manifest in place when a file cannot be written", { skip: process.getuid?.() === 0 }, async () => {
    const root = temp("vol");
    await publishNetwork(root, "ttc", ttc, meta);
    const before = readFileSync(join(root, "manifest.json"), "utf8");
    const changed = { ...ttc, "ttc-surface-night.json": buffer({ ...json(ttc["ttc-surface-night.json"]), routes: [] }) };
    chmodSync(join(root, "files"), 0o555);
    try {
      await assert.rejects(publishNetwork(root, "ttc", changed, meta));
    } finally {
      chmodSync(join(root, "files"), 0o755);
    }
    assert.equal(readFileSync(join(root, "manifest.json"), "utf8"), before);
  });

  it("prunes only files no recent manifest refers to, and only once they are old", async () => {
    const root = temp("vol");
    const network = (n) => ({ "go-bus-stops.csv": Buffer.from(`stop_code,name,routes\n${n},A,1\n`) });
    const start = Date.now();
    const paths = [];
    for (let n = 0; n < 5; n++) {
      const { manifest } = await publishNetwork(root, "go", network(n), { feedVersion: `G${n}` }, { now: new Date(start + n * 1000) });
      paths.push(manifest.networks.go.files["go-bus-stops.csv"]);
    }
    assert.deepEqual(await pruneFiles(root, { now: new Date(start + 10_000) }), [], "nothing young is removed");
    const old = new Date(start - 3 * 24 * 3600 * 1000);
    for (const path of paths) utimesSync(join(root, path), old, old);
    const removed = await pruneFiles(root, { now: new Date(start + 10_000) });
    assert.deepEqual(removed.sort(), [paths[0], paths[1]].map((path) => path.replace("files/", "")).sort());
    for (const path of paths.slice(2)) assert.ok(existsSync(join(root, path)), `${path} is kept`);
  });
});

describe("table hash", () => {
  it("is the same for a re-zip of the same tables and differs when a table changes", async (t) => {
    if (!existsSync("/usr/bin/zip")) return t.skip("zip is not installed");
    const dir = temp("zip");
    const tables = { "stops.txt": "stop_id\n1\n", "routes.txt": "route_id\n7\n" };
    const a = await tablesSha256(makeZip(dir, "a.zip", tables));
    const b = await tablesSha256(makeZip(dir, "b.zip", tables, { order: ["stops.txt", "routes.txt"], level: "-9" }));
    const c = await tablesSha256(makeZip(dir, "c.zip", { ...tables, "stops.txt": "stop_id\n2\n" }));
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});

describe("the service", () => {
  /** A service over file: feeds whose generators are stubs returning `sets[network]()`. */
  function harness({ sets = {}, ttcPackage } = {}) {
    if (!existsSync("/usr/bin/zip")) return null;
    const root = temp("vol");
    const baked = bakedDir();
    const feeds = temp("feeds");
    const goZip = makeZip(feeds, "GO-GTFS.zip", { "stops.txt": "stop_id\n1\n" });
    const ttcZip = makeZip(feeds, "completegtfs.zip", { "stops.txt": "stop_id\n9\n" });
    const packagePath = join(feeds, "package.json");
    writeFileSync(packagePath, JSON.stringify(ttcPackage ?? {
      result: { resources: [{ url: pathToFileURL(ttcZip).href, format: "ZIP", last_modified: "2026-11-04T19:51:45" }] },
    }));
    const calls = { ttc: 0, go: 0 };
    const generator = (network) => async () => {
      calls[network]++;
      return (sets[network] ?? (() => readSet(network, baked)))();
    };
    const events = [];
    const service = createScheduleAssetService({
      root,
      bakedDir: baked,
      scriptsDir,
      config: {
        networks: ["ttc", "go"],
        intervals: { ttc: 3600, go: 21600 },
        ttcPackageUrl: pathToFileURL(packagePath).href,
        goGtfsUrl: pathToFileURL(goZip).href,
        userAgent: "test",
      },
      generators: { ttc: generator("ttc"), go: generator("go") },
      log: (event, fields) => events.push({ event, ...fields }),
    });
    return { root, baked, feeds, goZip, service, calls, events };
  }

  it("bootstraps an empty volume from the release files, then marks them runtime after the first check", async (t) => {
    const h = harness();
    if (!h) return t.skip("zip is not installed");
    await h.service.bootstrap();
    const boot = await readManifest(h.root);
    assert.equal(boot.networks.ttc.origin, "release");
    assert.equal(boot.networks.go.origin, "release");
    assert.equal(await h.service.check("go"), "published");
    const after = await readManifest(h.root);
    assert.equal(after.networks.go.origin, "runtime");
    assert.deepEqual(after.networks.go.files, boot.networks.go.files, "the same data keeps its URLs");
    assert.equal(after.networks.ttc.origin, "release", "TTC is untouched by a GO check");
  });

  it("does not regenerate an unchanged feed or a re-zip of the same tables", async (t) => {
    const h = harness();
    if (!h) return t.skip("zip is not installed");
    await h.service.bootstrap();
    assert.equal(await h.service.check("go"), "published");
    assert.equal(await h.service.check("go"), "unchanged");
    // A new archive (new etag), same tables.
    makeZip(h.feeds, "GO-GTFS.zip", { "stops.txt": "stop_id\n1\n" }, { level: "-1" });
    utimesSync(h.goZip, new Date(), new Date(Date.now() + 5000));
    assert.equal(await h.service.check("go"), "same-tables");
    assert.equal(h.calls.go, 1);
    assert.equal(await h.service.check("ttc"), "published");
    assert.equal(await h.service.check("ttc"), "unchanged");
    assert.equal(h.calls.ttc, 1);
  });

  it("keeps the last good set when a regenerated set fails validation, and does not retry the same feed", async (t) => {
    let broken = false;
    const h = harness({
      sets: {
        go: () => {
          const files = readSet("go", h.baked);
          if (!broken) return files;
          const stops = json(files["go-surface-bus-stops.json"]);
          stops.features[0].properties.stopCode = "UN";
          return { ...files, "go-surface-bus-stops.json": buffer(stops) };
        },
      },
    });
    if (!h) return t.skip("zip is not installed");
    await h.service.bootstrap();
    assert.equal(await h.service.check("go"), "published");
    const good = readFileSync(join(h.root, "manifest.json"), "utf8");
    broken = true;
    makeZip(h.feeds, "GO-GTFS.zip", { "stops.txt": "stop_id\n2\n" });
    utimesSync(h.goZip, new Date(), new Date(Date.now() + 5000));
    assert.equal(await h.service.check("go"), "rejected");
    assert.equal(readFileSync(join(h.root, "manifest.json"), "utf8"), good, "the manifest still names the good set");
    const status = JSON.parse(readFileSync(join(h.root, "status.json"), "utf8"));
    assert.equal(status.networks.go.state, "failing");
    assert.equal(status.networks.go.lastFailure.stage, "validation");
    assert.equal(await h.service.check("go"), "rejected");
    assert.equal(h.calls.go, 2, "the rejected feed is not regenerated again");
    assert.ok(h.events.some((event) => event.event === "rejected"));
  });

  it("refuses a set that loses more than half its routes, lines or stops", () => {
    const previous = { routes: 224, lines: 1930, stops: 9017 };
    assert.deepEqual(shrinkProblems(previous, { routes: 200, lines: 1500, stops: 9100 }), []);
    assert.deepEqual(shrinkProblems(previous, { routes: 224, lines: 1930, stops: 4000 }), ["stops fell from 9017 to 4000"]);
    assert.deepEqual(shrinkProblems(null, { routes: 0 }), []);
  });

  it("keeps publishing GO while TTC's source fails", async (t) => {
    const h = harness({ ttcPackage: { result: {} } });
    if (!h) return t.skip("zip is not installed");
    await h.service.bootstrap();
    assert.equal(await h.service.check("ttc"), "failed");
    assert.equal(await h.service.check("go"), "published");
    const status = JSON.parse(readFileSync(join(h.root, "status.json"), "utf8"));
    assert.equal(status.networks.ttc.state, "failing");
    assert.equal(status.networks.ttc.lastFailure.stage, "lookup");
    assert.equal(status.networks.go.state, "ok");
    assert.equal(status.networks.ttc.published.origin, "release", "TTC keeps serving its last good set");
  });
});

describe("the committed bootstrap copies", () => {
  for (const network of ["ttc", "go"]) {
    it(`${network} passes the publish validation`, () => {
      const files = readSet(network, bakedDir());
      const parsed = Object.fromEntries(Object.entries(files).map(([name, data]) => [name, name.endsWith(".csv") ? data.toString() : json(data)]));
      assert.deepEqual(validateScheduleAssetSet(network, parsed), []);
    });
  }
});
