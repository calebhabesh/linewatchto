const PUSH_IDENTITY_CACHE = "linewatch-push-identity-v1";
const PUSH_IDENTITY_CACHE_KEY = "/__linewatch/push-installation-id";
const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,80}$/;

let memoryInstallationId: string | null = null;

function newInstallationId(cryptoSource: Crypto): string {
  if (typeof cryptoSource.randomUUID === "function") {
    return cryptoSource.randomUUID();
  }
  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validPushInstallationId(value: string | null | undefined): value is string {
  return typeof value === "string" && INSTALLATION_ID_PATTERN.test(value.trim());
}

export async function getOrCreatePushInstallationId(
  cacheStorage: CacheStorage = globalThis.caches,
  cryptoSource: Crypto = globalThis.crypto,
): Promise<string> {
  if (memoryInstallationId) return memoryInstallationId;

  try {
    const cache = await cacheStorage.open(PUSH_IDENTITY_CACHE);
    const cached = await cache.match(PUSH_IDENTITY_CACHE_KEY);
    const cachedValue = cached ? (await cached.text()).trim() : null;
    if (validPushInstallationId(cachedValue)) {
      memoryInstallationId = cachedValue;
      return cachedValue;
    }

    const created = newInstallationId(cryptoSource);
    await cache.put(PUSH_IDENTITY_CACHE_KEY, new Response(created, {
      headers: { "content-type": "text/plain" },
    }));
    memoryInstallationId = created;
    return created;
  } catch {
    memoryInstallationId = newInstallationId(cryptoSource);
    return memoryInstallationId;
  }
}
