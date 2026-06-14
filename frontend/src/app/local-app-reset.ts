async function clearLineWatchCacheStorage() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const cacheNames = await window.caches.keys();
  await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
}

async function updateLineWatchServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.update()));
}

export async function reloadLineWatchAppForUpdate() {
  if (typeof window === "undefined") return;

  await Promise.allSettled([
    clearLineWatchCacheStorage(),
    updateLineWatchServiceWorkers(),
  ]);

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("app-update", String(Date.now()));
  window.location.assign(nextUrl.href);
}

export async function resetLineWatchLocalAppState() {
  if (typeof window === "undefined") return;

  const resetUrl = new URL("/dev-reset.html", window.location.origin);
  resetUrl.searchParams.set("auto", "1");
  resetUrl.searchParams.set("source", "in-app");
  resetUrl.searchParams.set("reset", String(Date.now()));
  window.location.assign(resetUrl.href);
}
