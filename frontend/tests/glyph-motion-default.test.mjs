import assert from "node:assert/strict";
import { describe, it } from "node:test";

// The glyph ripple shipped as an opt-in prototype (?glyphMotion=ripple) and
// riders never saw it. It is on by default; Reduce Animations in Settings
// (.motion-paused) and the system preference stop it in CSS and in the timer.
async function install({ search = "", stored = {} } = {}) {
  const storage = new Map(Object.entries(stored));
  const dataset = {};
  const styles = new Map();
  globalThis.window = { location: { search } };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.document = { documentElement: { dataset, style: { setProperty: (name, value) => styles.set(name, value) } } };
  window.matchMedia = () => ({ matches: true });
  // A fresh module instance per case: installGlyphMotion runs once per page load.
  const glyphMotion = await import(`../src/components/map-overlays/glyph-motion.ts?case=${Math.random()}`);
  glyphMotion.installGlyphMotion();
  return { dataset, styles, storage };
}

describe("glyph ripple default", () => {
  it("is on with nothing stored", async () => {
    const { dataset, styles } = await install();
    assert.equal(dataset.glyphMotion, "ripple");
    assert.equal(styles.get("--glyph-ripple-step"), "550ms");
  });

  it("turns off only for the developer override, and remembers it", async () => {
    const off = await install({ search: "?glyphMotion=off" });
    assert.equal(off.dataset.glyphMotion, undefined);
    assert.equal(off.storage.get("linewatch-glyph-motion-v1"), "off");

    const back = await install({ search: "?glyphMotion=ripple", stored: { "linewatch-glyph-motion-v1": "off" } });
    assert.equal(back.dataset.glyphMotion, "ripple");
    assert.equal(back.storage.has("linewatch-glyph-motion-v1"), false);
  });

  it("ignores the retired prototype key", async () => {
    const { dataset } = await install({ stored: { "linewatch-glyph-motion-prototype-v1": "ripple-stepped" } });
    assert.equal(dataset.glyphMotion, "ripple");
  });
});
