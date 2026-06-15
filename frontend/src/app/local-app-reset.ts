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
