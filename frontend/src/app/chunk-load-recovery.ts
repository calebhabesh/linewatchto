// A cached start page from an older deploy can request code chunks the current
// server no longer has. Recover by reloading into the current build, once per
// installed build so a persistently missing chunk cannot cause a reload loop.

export const CHUNK_RECOVERY_STORAGE_KEY = "linewatch-chunk-recovery-build";

const CHUNK_FAILURE_MESSAGE =
  /ChunkLoadError|Loading (CSS )?chunk \S+ failed|Failed to load chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export function isChunkLoadFailure(reason: unknown) {
  if (!reason || typeof reason !== "object") {
    return typeof reason === "string" && CHUNK_FAILURE_MESSAGE.test(reason);
  }
  const { name, message } = reason as { name?: unknown; message?: unknown };
  return (typeof name === "string" && name === "ChunkLoadError")
    || (typeof message === "string" && CHUNK_FAILURE_MESSAGE.test(message));
}

export function isNextStaticResourceUrl(value: string | null | undefined, origin: string) {
  if (!value) return false;
  try {
    const url = new URL(value, origin);
    return url.origin === origin && url.pathname.startsWith("/_next/static/");
  } catch {
    return false;
  }
}

type RecoveryStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Whether to reload into the current build. Offline, a chunk fails because the
 * network is down, not because the build is stale, and a reload cannot fetch it
 * either (riders saw the page reload itself on going offline), so it declines
 * without spending the build's one recovery.
 */
export function claimChunkRecovery(storage: RecoveryStorage | null, buildLabel: string, online = true) {
  if (!online) return false;
  try {
    if (!storage || storage.getItem(CHUNK_RECOVERY_STORAGE_KEY) === buildLabel) return false;
    storage.setItem(CHUNK_RECOVERY_STORAGE_KEY, buildLabel);
    return true;
  } catch {
    // Without storage there is no loop guard, so leave the failure to the page.
    return false;
  }
}
