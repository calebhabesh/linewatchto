// Push subscription check shared by the service worker (importScripts) and
// mirrored for the page in src/app/push-subscription-check.ts; the parity test
// (tests/push-subscription-check.test.mjs) runs both on the same cases.
//
// The device keeps the hash of the endpoint it last saved in IndexedDB, which
// the worker can read. A different endpoint from getSubscription() is a
// replacement the server has not heard of yet. Only hashes are stored.
(function (scope) {
  const DB_NAME = "linewatch-push";
  const DB_VERSION = 1;
  const STORE = "state";
  const KEY = "subscription";

  // Registration reason for a save, from what the device last saved.
  function registrationReasonFor(input) {
    if (input.subscribedAnew) return "restored-missing";
    if (input.savedEndpointHash && input.savedEndpointHash !== input.currentEndpointHash) return "endpoint-replaced";
    return "refreshed";
  }

  // What a background check (worker wake, push, periodic sync) should do.
  // "restore" only when this device had saved an endpoint and the browser
  // dropped it; the page owns first enablement and rider choices. With
  // verifyUnchanged (the periodic sync), an unchanged endpoint is "verify":
  // ask the server, because the browser can hold an endpoint for days after
  // the push service answered 410.
  function subscriptionCheckAction(input) {
    if (!input.hasSubscription) return input.savedEndpointHash ? "restore" : "none";
    if (!input.savedEndpointHash) return "none";
    if (input.savedEndpointHash !== input.currentEndpointHash) return "save";
    return input.verifyUnchanged ? "verify" : "none";
  }

  function browserMajorVersion(userAgent, userAgentData) {
    const brands = Array.isArray(userAgentData?.brands) ? userAgentData.brands : [];
    const brand = brands.find((entry) => /^(Google Chrome|Chromium|Microsoft Edge)$/.test(entry?.brand || ""));
    const fromBrand = brand ? Number.parseInt(brand.version, 10) : NaN;
    if (Number.isFinite(fromBrand) && fromBrand > 0) return fromBrand;
    const text = typeof userAgent === "string" ? userAgent : "";
    const match = text.match(/(?:Edg|EdgA|EdgiOS|CriOS|FxiOS|Firefox|Chrome)\/(\d+)/) || text.match(/Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari/);
    const parsed = match ? Number.parseInt(match[1], 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  async function endpointHash(endpoint) {
    const digest = await scope.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(endpoint).trim()));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function openStateDb() {
    return new Promise((resolve, reject) => {
      if (!scope.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const request = scope.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  async function withStore(mode, action) {
    const db = await openStateDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
        transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
      });
    } finally {
      db.close();
    }
  }

  async function readSavedSubscriptionState() {
    try {
      const value = await withStore("readonly", (store) => store.get(KEY));
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  async function writeSavedSubscriptionState(state) {
    try {
      const previous = await readSavedSubscriptionState();
      await withStore("readwrite", (store) => store.put({ ...(previous || {}), ...state }, KEY));
    } catch {
      // Storage can be unavailable; the next app open saves again.
    }
  }

  async function clearSavedSubscriptionState() {
    try {
      await withStore("readwrite", (store) => store.delete(KEY));
    } catch {
      // Nothing saved means nothing to restore.
    }
  }

  scope.LineWatchPushSubscriptionCheck = {
    DB_NAME,
    STORE,
    KEY,
    registrationReasonFor,
    subscriptionCheckAction,
    browserMajorVersion,
    endpointHash,
    readSavedSubscriptionState,
    writeSavedSubscriptionState,
    clearSavedSubscriptionState,
  };
})(typeof self !== "undefined" ? self : globalThis);
