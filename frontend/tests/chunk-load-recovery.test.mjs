import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHUNK_RECOVERY_STORAGE_KEY,
  claimChunkRecovery,
  isChunkLoadFailure,
  isNextStaticResourceUrl,
} from "../src/app/chunk-load-recovery.ts";

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("chunk load recovery", () => {
  it("recognizes webpack, Turbopack, and native dynamic import failures", () => {
    const chunkError = new Error("Loading chunk 123 failed.");
    chunkError.name = "ChunkLoadError";
    assert.equal(isChunkLoadFailure(chunkError), true);
    assert.equal(isChunkLoadFailure(new Error("Failed to load chunk /_next/static/chunks/abc.js from module 42")), true);
    assert.equal(isChunkLoadFailure(new TypeError("Failed to fetch dynamically imported module: https://x/_next/static/a.js")), true);
    assert.equal(isChunkLoadFailure(new TypeError("Importing a module script failed.")), true);
    assert.equal(isChunkLoadFailure(new Error("Loading CSS chunk 7 failed.")), true);
  });

  it("ignores unrelated failures", () => {
    assert.equal(isChunkLoadFailure(new TypeError("Failed to fetch")), false);
    assert.equal(isChunkLoadFailure(new Error("Dashboard unavailable")), false);
    assert.equal(isChunkLoadFailure(undefined), false);
  });

  it("only treats same-origin Next static resources as chunks", () => {
    const origin = "https://linewatch.test";
    assert.equal(isNextStaticResourceUrl("/_next/static/chunks/a.js?dpl=prod-abc", origin), true);
    assert.equal(isNextStaticResourceUrl("https://cdn.example/_next/static/chunks/a.js", origin), false);
    assert.equal(isNextStaticResourceUrl("/assets/linewatch/logo.svg", origin), false);
    assert.equal(isNextStaticResourceUrl(null, origin), false);
  });

  it("reloads once per installed build", () => {
    const storage = memoryStorage();
    assert.equal(claimChunkRecovery(storage, "prod-old"), true);
    assert.equal(storage.values.get(CHUNK_RECOVERY_STORAGE_KEY), "prod-old");
    assert.equal(claimChunkRecovery(storage, "prod-old"), false);
    assert.equal(claimChunkRecovery(storage, "prod-new"), true);
  });

  it("does not reload offline, and keeps the build's recovery for later", () => {
    const storage = memoryStorage();
    assert.equal(claimChunkRecovery(storage, "prod-old", false), false);
    assert.equal(storage.values.has(CHUNK_RECOVERY_STORAGE_KEY), false);
    assert.equal(claimChunkRecovery(storage, "prod-old", true), true);
  });

  it("does not reload without a loop guard", () => {
    assert.equal(claimChunkRecovery(null, "prod-old"), false);
    assert.equal(
      claimChunkRecovery({ getItem: () => { throw new Error("blocked"); }, setItem: () => undefined }, "prod-old"),
      false,
    );
  });
});
