import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  VISUAL_PREFERENCES_COOKIE_NAME,
  buildVisualPreferencesCookie,
  defaultVisualPreferences,
  initialVisualPreferencesFromCookie,
  readVisualPreferencesFromStorage,
  resolveReducedMotionPreference,
  writeVisualPreferencesToStorage,
} from "../src/app/visual-preferences.ts";

function memoryStorage(initialEntries = {}) {
  const entries = new Map(Object.entries(initialEntries));
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    },
    snapshot() {
      return Object.fromEntries(entries);
    },
  };
}

describe("visual preference persistence", () => {
  it("stores visual state as per-device local preferences", () => {
    const storage = memoryStorage();

    writeVisualPreferencesToStorage(storage, {
      theme: "light",
      highContrast: true,
      reducedMotion: true,
      estimatedTrainsEnabled: true,
    });

    assert.deepEqual(readVisualPreferencesFromStorage(storage), {
      theme: "light",
      highContrast: true,
      reducedMotion: true,
      estimatedTrainsEnabled: true,
    });
  });

  it("falls back safely when local preference values are missing or invalid", () => {
    const storage = memoryStorage({
      "linewatch-theme-v1": "sepia",
      "linewatch-high-contrast-enabled-v1": "yes",
      "linewatch-reduced-motion-enabled-v1": "",
      "linewatch-estimated-trains-enabled-v1": "false",
    });

    assert.deepEqual(readVisualPreferencesFromStorage(storage), {
      theme: null,
      highContrast: null,
      reducedMotion: null,
      estimatedTrainsEnabled: false,
    });
  });

  it("lets system reduced motion apply until a local override exists", () => {
    assert.equal(resolveReducedMotionPreference(null, true), true);
    assert.equal(resolveReducedMotionPreference(null, false), false);
    assert.equal(resolveReducedMotionPreference(false, true), false);
    assert.equal(resolveReducedMotionPreference(true, false), true);
  });

  it("round-trips a cookie snapshot for first render theme seeding", () => {
    const cookie = buildVisualPreferencesCookie(
      {
        theme: "light",
        highContrast: true,
        reducedMotion: false,
        estimatedTrainsEnabled: true,
      },
      "https:",
    );

    assert.match(cookie, new RegExp(`^${VISUAL_PREFERENCES_COOKIE_NAME}=`));
    assert.match(cookie, /;\s*Path=\//);
    assert.match(cookie, /;\s*SameSite=Lax/);
    assert.match(cookie, /;\s*Secure/);

    const encodedValue = cookie.slice(cookie.indexOf("=") + 1, cookie.indexOf(";"));
    assert.deepEqual(initialVisualPreferencesFromCookie(encodedValue), {
      theme: "light",
      highContrast: true,
      reducedMotion: false,
      reducedMotionOverride: true,
      estimatedTrainsEnabled: true,
    });
  });

  it("uses dark dashboard defaults when no usable cookie exists", () => {
    assert.deepEqual(initialVisualPreferencesFromCookie(undefined), defaultVisualPreferences);
    assert.deepEqual(initialVisualPreferencesFromCookie("%7Bbroken"), defaultVisualPreferences);
  });
});
