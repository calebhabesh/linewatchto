// Page twin of public/push-subscription-check.js (loaded by the service worker).
// Keep the decisions and storage names identical; the parity test runs both.

export const PUSH_STATE_DB_NAME = "linewatch-push";
const DB_VERSION = 1;
export const PUSH_STATE_STORE = "state";
export const PUSH_STATE_KEY = "subscription";

export type PushRegistrationReason =
  | "refreshed"
  | "restored-missing"
  | "endpoint-replaced"
  | "user-enabled"
  | "invalid-endpoint-replacement";

export type PushDisplayMode = "standalone" | "browser";

export type SavedPushSubscriptionState = {
  endpointHash?: string;
  savedAt?: string;
  displayMode?: PushDisplayMode;
};

export function registrationReasonFor(input: {
  savedEndpointHash: string | null | undefined;
  currentEndpointHash: string;
  subscribedAnew: boolean;
}): "refreshed" | "restored-missing" | "endpoint-replaced" {
  if (input.subscribedAnew) return "restored-missing";
  if (input.savedEndpointHash && input.savedEndpointHash !== input.currentEndpointHash) return "endpoint-replaced";
  return "refreshed";
}

export function subscriptionCheckAction(input: {
  hasSubscription: boolean;
  savedEndpointHash: string | null | undefined;
  currentEndpointHash: string | null | undefined;
}): "none" | "save" | "restore" {
  if (!input.hasSubscription) return input.savedEndpointHash ? "restore" : "none";
  if (!input.savedEndpointHash) return "none";
  return input.savedEndpointHash === input.currentEndpointHash ? "none" : "save";
}

type UserAgentBrands = { brands?: { brand?: string; version?: string }[] } | undefined;

export function browserMajorVersion(userAgent: string | undefined, userAgentData?: UserAgentBrands): number | null {
  const brands = Array.isArray(userAgentData?.brands) ? userAgentData.brands : [];
  const brand = brands.find((entry) => /^(Google Chrome|Chromium|Microsoft Edge)$/.test(entry?.brand || ""));
  const fromBrand = brand ? Number.parseInt(brand.version ?? "", 10) : NaN;
  if (Number.isFinite(fromBrand) && fromBrand > 0) return fromBrand;
  const text = typeof userAgent === "string" ? userAgent : "";
  const match = text.match(/(?:Edg|EdgA|EdgiOS|CriOS|FxiOS|Firefox|Chrome)\/(\d+)/) || text.match(/Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari/);
  const parsed = match ? Number.parseInt(match[1], 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function currentDisplayMode(): PushDisplayMode {
  if (typeof window === "undefined") return "browser";
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone ? "standalone" : "browser";
}

export async function endpointHash(endpoint: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint.trim()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function openStateDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = globalThis.indexedDB.open(PUSH_STATE_DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PUSH_STATE_STORE)) request.result.createObjectStore(PUSH_STATE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | undefined): Promise<T | undefined> {
  const db = await openStateDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(PUSH_STATE_STORE, mode);
      const request = action(transaction.objectStore(PUSH_STATE_STORE));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
}

export async function readSavedSubscriptionState(): Promise<SavedPushSubscriptionState | null> {
  try {
    const value = await withStore<unknown>("readonly", (store) => store.get(PUSH_STATE_KEY));
    return value && typeof value === "object" ? value as SavedPushSubscriptionState : null;
  } catch {
    return null;
  }
}

export async function writeSavedSubscriptionState(state: SavedPushSubscriptionState): Promise<void> {
  try {
    const previous = await readSavedSubscriptionState();
    await withStore("readwrite", (store) => store.put({ ...(previous ?? {}), ...state }, PUSH_STATE_KEY));
  } catch {
    // Storage can be unavailable; the next app open saves again.
  }
}

export async function clearSavedSubscriptionState(): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(PUSH_STATE_KEY));
  } catch {
    // Nothing saved means nothing to restore.
  }
}

export const SUBSCRIPTION_CHECK_SYNC_TAG = "linewatch-subscription-check";
const SUBSCRIPTION_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

type PeriodicSyncManager = {
  register: (tag: string, options?: { minInterval?: number }) => Promise<void>;
  unregister: (tag: string) => Promise<void>;
};

function periodicSyncFor(registration: ServiceWorkerRegistration): PeriodicSyncManager | null {
  const manager = (registration as ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }).periodicSync;
  return manager && typeof manager.register === "function" ? manager : null;
}

// Periodic Background Sync is Chromium-only, needs an installed app, and Chrome
// sets its timing from site engagement: it shortens a gap, it cannot close it.
export async function registerPeriodicSubscriptionCheck(
  registration: ServiceWorkerRegistration,
): Promise<"registered" | "unsupported" | "not-installed" | "denied"> {
  const periodicSync = periodicSyncFor(registration);
  if (!periodicSync) return "unsupported";
  if (currentDisplayMode() !== "standalone") return "not-installed";
  try {
    const status = await navigator.permissions.query({ name: "periodic-background-sync" as PermissionName });
    if (status.state !== "granted") return "denied";
    await periodicSync.register(SUBSCRIPTION_CHECK_SYNC_TAG, { minInterval: SUBSCRIPTION_CHECK_INTERVAL_MS });
    return "registered";
  } catch {
    return "unsupported";
  }
}

export async function unregisterPeriodicSubscriptionCheck(registration: ServiceWorkerRegistration | null | undefined) {
  const periodicSync = registration ? periodicSyncFor(registration) : null;
  try {
    await periodicSync?.unregister(SUBSCRIPTION_CHECK_SYNC_TAG);
  } catch {
    // Nothing registered.
  }
}
