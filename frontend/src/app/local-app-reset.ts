let appUpdateNavigationInFlight = false;
let localResetNavigationInFlight = false;

function currentReturnPath() {
  const currentUrl = new URL(window.location.href);
  return `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
}

export async function reloadLineWatchAppForUpdate() {
  if (typeof window === "undefined" || appUpdateNavigationInFlight) return;

  appUpdateNavigationInFlight = true;

  const updateUrl = new URL("/app-update.html", window.location.origin);
  updateUrl.searchParams.set("auto", "1");
  updateUrl.searchParams.set("source", "update");
  updateUrl.searchParams.set("mode", process.env.NODE_ENV === "production" ? "app" : "dev");
  updateUrl.searchParams.set("return", currentReturnPath());
  updateUrl.searchParams.set("update", String(Date.now()));

  try {
    window.location.replace(updateUrl.href);
  } catch (error) {
    appUpdateNavigationInFlight = false;
    throw error;
  }
}

const BACKGROUND_UPDATE_WORKER_TIMEOUT_MS = 3_000;

function waitForControllerChange(serviceWorker: ServiceWorkerContainer) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout);
      serviceWorker.removeEventListener("controllerchange", finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, BACKGROUND_UPDATE_WORKER_TIMEOUT_MS);
    serviceWorker.addEventListener("controllerchange", finish);
  });
}

function refreshLaunchShell(controller: ServiceWorker) {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(resolve, BACKGROUND_UPDATE_WORKER_TIMEOUT_MS);
    channel.port1.onmessage = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    controller.postMessage({ type: "linewatch-refresh-launch-shell" }, [channel.port2]);
  });
}

// The installed start page is served from cache, so a plain reload can reopen the
// previous build. Activate a waiting worker (which drops the old build's caches) or
// store the current start page before reloading.
async function prepareServiceWorkerForReload() {
  if (!("serviceWorker" in navigator)) return;

  const serviceWorker = navigator.serviceWorker;
  const registration = await serviceWorker.getRegistration();
  if (registration?.waiting) {
    const activated = waitForControllerChange(serviceWorker);
    registration.waiting.postMessage({ type: "linewatch-skip-waiting" });
    await activated;
    return;
  }

  if (serviceWorker.controller) {
    await refreshLaunchShell(serviceWorker.controller);
  }
}

export async function reloadLineWatchAppInBackground() {
  if (typeof window === "undefined" || appUpdateNavigationInFlight) return;

  appUpdateNavigationInFlight = true;
  try {
    await prepareServiceWorkerForReload();
  } catch {
    // A reload still reaches the network for every non-launch URL.
  }
  window.location.reload();
}

export async function resetLineWatchLocalAppState() {
  if (typeof window === "undefined" || localResetNavigationInFlight) return;

  localResetNavigationInFlight = true;

  const resetUrl = new URL("/dev-reset.html", window.location.origin);
  resetUrl.searchParams.set("auto", "1");
  resetUrl.searchParams.set("source", "in-app");
  resetUrl.searchParams.set("reset", String(Date.now()));

  try {
    window.location.replace(resetUrl.href);
  } catch (error) {
    localResetNavigationInFlight = false;
    throw error;
  }
}
