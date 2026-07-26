import type { NetworkId } from "./regional-data";

export type LineWatchThemePreference = "dark" | "light";

export type VisualPreferences = {
  theme: LineWatchThemePreference;
  highContrast: boolean;
  reducedMotion: boolean;
  estimatedTrainsEnabled: boolean;
  dotBackgroundEnabled: boolean;
  defaultNetwork: NetworkId;
};

export type InitialVisualPreferences = VisualPreferences & {
  reducedMotionOverride: boolean;
};

export type StoredVisualPreferences = {
  theme: LineWatchThemePreference | null;
  highContrast: boolean | null;
  reducedMotion: boolean | null;
  estimatedTrainsEnabled: boolean | null;
  dotBackgroundEnabled: boolean | null;
  defaultNetwork: NetworkId | null;
};

export type VisualPreferencesToPersist = Omit<VisualPreferences, "reducedMotion"> & {
  reducedMotion: boolean | null;
};

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const VISUAL_PREFERENCES_COOKIE_NAME = "linewatch-visual-preferences-v1";
const VISUAL_PREFERENCES_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const visualPreferenceStorageKeys = {
  theme: "linewatch-theme-v1",
  highContrast: "linewatch-high-contrast-enabled-v1",
  reducedMotion: "linewatch-reduced-motion-enabled-v1",
  estimatedTrainsEnabled: "linewatch-estimated-trains-enabled-v1",
  dotBackgroundEnabled: "linewatch-dot-background-enabled-v1",
  defaultNetwork: "linewatch-default-network-v1",
} as const;

export const defaultVisualPreferences: InitialVisualPreferences = {
  theme: "dark",
  highContrast: false,
  reducedMotion: false,
  reducedMotionOverride: false,
  estimatedTrainsEnabled: false,
  dotBackgroundEnabled: true,
  defaultNetwork: "ttc",
};

function readStorageValue(storage: PreferenceStorage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(storage: PreferenceStorage, key: string, value: string | null) {
  try {
    if (value === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  } catch {
    // Browser privacy modes can reject localStorage writes. The in-memory UI state still works.
  }
}

function readStoredBoolean(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function readStoredTheme(value: string | null): LineWatchThemePreference | null {
  if (value === "dark" || value === "light") return value;
  return null;
}

function readStoredNetwork(value: string | null): NetworkId | null {
  if (value === "ttc" || value === "regional") return value;
  return null;
}

function normalizeCookieRecord(value: unknown): Partial<VisualPreferencesToPersist> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    theme: readStoredTheme(typeof record.theme === "string" ? record.theme : null) ?? undefined,
    highContrast: typeof record.highContrast === "boolean" ? record.highContrast : undefined,
    reducedMotion: typeof record.reducedMotion === "boolean" ? record.reducedMotion : undefined,
    estimatedTrainsEnabled: typeof record.estimatedTrainsEnabled === "boolean" ? record.estimatedTrainsEnabled : undefined,
    dotBackgroundEnabled: typeof record.dotBackgroundEnabled === "boolean" ? record.dotBackgroundEnabled : undefined,
    defaultNetwork: readStoredNetwork(typeof record.defaultNetwork === "string" ? record.defaultNetwork : null) ?? undefined,
  };
}

export function readVisualPreferencesFromStorage(storage: PreferenceStorage): StoredVisualPreferences {
  return {
    theme: readStoredTheme(readStorageValue(storage, visualPreferenceStorageKeys.theme)),
    highContrast: readStoredBoolean(readStorageValue(storage, visualPreferenceStorageKeys.highContrast)),
    reducedMotion: readStoredBoolean(readStorageValue(storage, visualPreferenceStorageKeys.reducedMotion)),
    estimatedTrainsEnabled: readStoredBoolean(readStorageValue(storage, visualPreferenceStorageKeys.estimatedTrainsEnabled)),
    dotBackgroundEnabled: readStoredBoolean(readStorageValue(storage, visualPreferenceStorageKeys.dotBackgroundEnabled)),
    defaultNetwork: readStoredNetwork(readStorageValue(storage, visualPreferenceStorageKeys.defaultNetwork)),
  };
}

export function writeVisualPreferencesToStorage(storage: PreferenceStorage, preferences: VisualPreferencesToPersist) {
  writeStorageValue(storage, visualPreferenceStorageKeys.theme, preferences.theme);
  writeStorageValue(storage, visualPreferenceStorageKeys.highContrast, preferences.highContrast ? "true" : "false");
  writeStorageValue(
    storage,
    visualPreferenceStorageKeys.reducedMotion,
    preferences.reducedMotion === null ? null : preferences.reducedMotion ? "true" : "false",
  );
  writeStorageValue(storage, visualPreferenceStorageKeys.estimatedTrainsEnabled, preferences.estimatedTrainsEnabled ? "true" : "false");
  writeStorageValue(storage, visualPreferenceStorageKeys.dotBackgroundEnabled, preferences.dotBackgroundEnabled ? "true" : "false");
  writeStorageValue(storage, visualPreferenceStorageKeys.defaultNetwork, preferences.defaultNetwork);
}

export function resolveReducedMotionPreference(storedPreference: boolean | null, systemPrefersReducedMotion: boolean) {
  return storedPreference ?? systemPrefersReducedMotion;
}

export function initialVisualPreferencesFromCookie(cookieValue: string | undefined): InitialVisualPreferences {
  if (!cookieValue) {
    return defaultVisualPreferences;
  }

  try {
    const normalized = normalizeCookieRecord(JSON.parse(decodeURIComponent(cookieValue)));
    const reducedMotionOverride = typeof normalized.reducedMotion === "boolean";

    return {
      theme: normalized.theme ?? defaultVisualPreferences.theme,
      highContrast: normalized.highContrast ?? defaultVisualPreferences.highContrast,
      reducedMotion: normalized.reducedMotion ?? defaultVisualPreferences.reducedMotion,
      reducedMotionOverride,
      estimatedTrainsEnabled: normalized.estimatedTrainsEnabled ?? defaultVisualPreferences.estimatedTrainsEnabled,
      dotBackgroundEnabled: normalized.dotBackgroundEnabled ?? defaultVisualPreferences.dotBackgroundEnabled,
      defaultNetwork: normalized.defaultNetwork ?? defaultVisualPreferences.defaultNetwork,
    };
  } catch {
    return defaultVisualPreferences;
  }
}

export function buildVisualPreferencesCookie(preferences: VisualPreferencesToPersist, protocol: string) {
  const payload: Partial<VisualPreferencesToPersist> = {
    theme: preferences.theme,
    highContrast: preferences.highContrast,
    estimatedTrainsEnabled: preferences.estimatedTrainsEnabled,
    dotBackgroundEnabled: preferences.dotBackgroundEnabled,
    defaultNetwork: preferences.defaultNetwork,
  };
  if (preferences.reducedMotion !== null) {
    payload.reducedMotion = preferences.reducedMotion;
  }

  const secureAttribute = protocol === "https:" ? "; Secure" : "";
  return [
    `${VISUAL_PREFERENCES_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(payload))}`,
    `Max-Age=${VISUAL_PREFERENCES_COOKIE_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
  ].join("; ") + secureAttribute;
}
