/**
 * The schedule-assets service (plan 16): checks each network's GTFS
 * publication, regenerates on a real change, validates, and publishes. TTC
 * and GO are checked, generated and published independently; a failure in
 * one never blocks the other, and a failed or rejected set keeps the last
 * good one in service.
 */

import { access, mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  scheduleAssetCounts,
  shrinkProblems,
  validateScheduleAssetSet,
} from "../../../scripts/lib/schedule-asset-validation.mjs";
import { readJsonOrNull, writeJsonAtomic } from "./files.mjs";
import { FeedError, currentTtcRelease, downloadArchive, tablesSha256, verifyArchive } from "./feeds.mjs";
import { bakedSet, generateGo, generateTtc, generatorFingerprint } from "./generate.mjs";
import { publishNetwork, pruneFiles, readManifest, readPublishedFiles } from "./publish.mjs";

export const NETWORKS = ["ttc", "go"];
export const STATUS_SCHEMA_VERSION = "1.0.0";

const parse = (name, data) => (name.endsWith(".json") ? JSON.parse(data.toString("utf8")) : data.toString("utf8"));
const parseSet = files => Object.fromEntries(Object.entries(files).map(([name, data]) => [name, parse(name, data)]));
const exists = path => access(path).then(() => true, () => false);

/** Feed metadata for the manifest, read from the set's own catalog. */
function feedMeta(network, parsed) {
  const source = parsed[network === "ttc" ? "ttc-surface-streetcar.json" : "go-surface-bus.json"].source;
  return { feedVersion: source.feedVersion, feedStartDate: source.feedStartDate, feedEndDate: source.feedEndDate };
}

export function createScheduleAssetService(options) {
  const {
    root,
    bakedDir,
    scriptsDir,
    config,
    fetchImpl = fetch,
    now = () => new Date(),
    log = () => {},
    generators = { ttc: generateTtc, go: generateGo },
  } = options;
  const stateDir = join(root, ".state");
  const statePath = join(stateDir, "state.json");
  const statusPath = join(root, "status.json");
  const archivePath = network => join(stateDir, "gtfs", `${network}.zip`);
  const userAgent = config.userAgent;
  const status = { schemaVersion: STATUS_SCHEMA_VERSION, service: "schedule-assets", startedAt: now().toISOString(), networks: {} };

  async function loadState() {
    return (await readJsonOrNull(statePath)) ?? {};
  }

  async function saveStatus() {
    status.updatedAt = now().toISOString();
    const manifest = await readManifest(root);
    status.generation = manifest?.generation ?? null;
    for (const network of NETWORKS) {
      const entry = manifest?.networks?.[network];
      status.networks[network] = {
        ...status.networks[network],
        enabled: config.networks.includes(network),
        intervalSeconds: config.intervals[network],
        published: entry
          ? { origin: entry.origin, feedVersion: entry.feedVersion, feedStartDate: entry.feedStartDate, feedEndDate: entry.feedEndDate, publishedAt: entry.publishedAt }
          : null,
      };
    }
    await writeJsonAtomic(statusPath, status);
  }

  /** On an empty volume, publish the release's own files as the first generation. */
  async function bootstrap() {
    await mkdir(join(stateDir, "gtfs"), { recursive: true });
    const manifest = await readManifest(root);
    for (const network of NETWORKS) {
      if (manifest?.networks?.[network]) continue;
      const files = await bakedSet(network, bakedDir);
      const parsed = parseSet(files);
      const problems = validateScheduleAssetSet(network, parsed);
      if (problems.length > 0) throw new Error(`release files for ${network} fail validation: ${problems.slice(0, 3).join("; ")}`);
      await publishNetwork(root, network, files, { origin: "release", ...feedMeta(network, parsed) }, { now: now() });
      log("bootstrap", { network, feedVersion: feedMeta(network, parsed).feedVersion });
    }
    await saveStatus();
  }

  async function rejectedOrValid(network, files) {
    const parsed = parseSet(files);
    const problems = validateScheduleAssetSet(network, parsed);
    const current = await readPublishedFiles(root, await readManifest(root), network).catch(() => null);
    if (current) {
      problems.push(...shrinkProblems(scheduleAssetCounts(network, parseSet(current)), scheduleAssetCounts(network, parsed)));
    }
    return { parsed, problems };
  }

  /**
   * One check of one network. Returns the outcome: "unchanged", "same-tables"
   * (a re-zip), "published", "rejected" or "failed".
   */
  async function check(network) {
    const state = await loadState();
    const previous = state[network] ?? {};
    const next = { ...previous };
    const record = status.networks[network] ?? (status.networks[network] = { consecutiveFailures: 0 });
    const startedAt = now();
    record.lastCheckAt = startedAt.toISOString();
    const archive = archivePath(network);
    const incoming = `${archive}.new`;
    let outcome;
    try {
      const fingerprint = await generatorFingerprint(network, { scriptsDir, bakedDir });
      let downloaded = false;
      if (network === "ttc") {
        const release = await currentTtcRelease(config.ttcPackageUrl, { fetchImpl, userAgent });
        // Without a release key (CKAN gave no last_modified) every check downloads, as the backend does.
        if (!release.releaseKey || release.releaseKey !== previous.releaseKey || !(await exists(archive))) {
          await downloadArchive(release.zipUrl, incoming, { fetchImpl, userAgent });
          downloaded = true;
        }
        next.releaseKey = release.releaseKey;
      } else {
        const haveArchive = await exists(archive);
        const result = await downloadArchive(config.goGtfsUrl, incoming, {
          fetchImpl, userAgent,
          etag: haveArchive ? previous.etag : null,
          lastModified: haveArchive ? previous.lastModified : null,
        });
        if (result.status === "downloaded") {
          downloaded = true;
          next.etag = result.etag;
          next.lastModified = result.lastModified;
        }
      }

      let tables = previous.archiveTablesSha256;
      if (downloaded) {
        await verifyArchive(incoming);
        tables = await tablesSha256(incoming);
      }
      const alreadyPublished = tables === previous.publishedTablesSha256 && fingerprint === previous.fingerprint;
      const alreadyRejected = tables === previous.rejected?.tablesSha256 && fingerprint === previous.rejected?.fingerprint;
      if (downloaded) {
        await rename(incoming, archive);
        next.archiveTablesSha256 = tables;
      }
      if (alreadyPublished) {
        outcome = downloaded ? "same-tables" : "unchanged";
      } else if (alreadyRejected) {
        outcome = "rejected";
        record.lastFailureAt = startedAt.toISOString();
        record.lastFailure = { stage: "validation", message: previous.rejected.problems?.[0] ?? "rejected" };
      } else {
        const workDir = join(stateDir, "work", network);
        const files = await generators[network]({ scriptsDir, bakedDir, archive, workDir, log });
        const { parsed, problems } = await rejectedOrValid(network, files);
        await rm(workDir, { recursive: true, force: true });
        if (problems.length > 0) {
          next.rejected = { tablesSha256: tables, fingerprint, problems: problems.slice(0, 10) };
          outcome = "rejected";
          record.lastFailureAt = startedAt.toISOString();
          record.lastFailure = { stage: "validation", message: problems[0] };
          log("rejected", { network, problems: problems.slice(0, 10) }, "warn");
        } else {
          const meta = { origin: "runtime", ...feedMeta(network, parsed), tablesSha256: tables };
          const { changed, manifest } = await publishNetwork(root, network, files, meta, { now: now() });
          next.publishedTablesSha256 = tables;
          next.fingerprint = fingerprint;
          delete next.rejected;
          record.lastPublishAt = changed ? startedAt.toISOString() : record.lastPublishAt ?? null;
          outcome = changed ? "published" : "unchanged";
          log(changed ? "published" : "regenerated-unchanged", { network, ...meta, generation: manifest.generation });
          if (changed) {
            const removed = await pruneFiles(root, { now: now() });
            if (removed.length > 0) log("pruned", { files: removed.length });
          }
        }
      }
      if (outcome === "rejected") {
        record.state = "failing";
        record.consecutiveFailures = (record.consecutiveFailures ?? 0) + 1;
      } else {
        record.state = "ok";
        record.lastSuccessAt = startedAt.toISOString();
        record.consecutiveFailures = 0;
      }
      state[network] = next;
      await writeJsonAtomic(statePath, state);
    } catch (error) {
      await rm(incoming, { force: true });
      outcome = "failed";
      record.state = "failing";
      record.consecutiveFailures = (record.consecutiveFailures ?? 0) + 1;
      record.lastFailureAt = startedAt.toISOString();
      record.lastFailure = { stage: error instanceof FeedError ? error.stage : "internal", message: String(error.message).slice(0, 500) };
      log("check-failed", { network, stage: record.lastFailure.stage, message: record.lastFailure.message }, "error");
    }
    record.lastOutcome = outcome;
    record.lastCheckSeconds = Math.round((now() - startedAt) / 100) / 10;
    await saveStatus();
    if (outcome !== "failed") log("checked", { network, outcome, seconds: record.lastCheckSeconds });
    return outcome;
  }

  return { bootstrap, check, status: () => status, statusPath };
}
