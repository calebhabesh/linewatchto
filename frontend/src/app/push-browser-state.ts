export type PushServiceWorkerContainer = {
  getRegistration: (clientURL?: string | URL) => Promise<ServiceWorkerRegistration | undefined>;
  ready: Promise<ServiceWorkerRegistration>;
  register: (
    scriptURL: string | URL,
    options?: RegistrationOptions,
  ) => Promise<ServiceWorkerRegistration>;
};

export type PushManagedServiceWorkerRegistration = {
  pushManager: {
    getSubscription: () => Promise<PushSubscription | null>;
  };
  unregister: () => Promise<boolean>;
};

export type PushRegistrationLookupOptions = {
  readyTimeoutMs?: number;
  scopePath?: string;
};

const DEFAULT_READY_TIMEOUT_MS = 4_000;
const DEFAULT_SCOPE_PATH = "/";

export function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = globalThis.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

function bytesForApplicationServerKey(value: unknown): Uint8Array | null {
  if (!value) return null;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

export function pushSubscriptionUsesApplicationServerKey(
  subscription: Pick<PushSubscription, "options">,
  vapidPublicKey: string,
) {
  if (!vapidPublicKey) return true;

  const currentKey = bytesForApplicationServerKey(subscription.options?.applicationServerKey);
  if (!currentKey) return true;

  const expectedKey = base64UrlToUint8Array(vapidPublicKey);
  if (currentKey.byteLength !== expectedKey.byteLength) return false;

  for (let index = 0; index < currentKey.byteLength; index += 1) {
    if (currentKey[index] !== expectedKey[index]) return false;
  }

  return true;
}

async function serviceWorkerReadyWithin(
  serviceWorker: PushServiceWorkerContainer,
  timeoutMs: number,
): Promise<ServiceWorkerRegistration | null> {
  return await new Promise((resolve) => {
    const timer = globalThis.setTimeout(() => {
      resolve(null);
    }, timeoutMs);

    serviceWorker.ready.then(
      (registration) => {
        globalThis.clearTimeout(timer);
        resolve(registration);
      },
      () => {
        globalThis.clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export async function getPushServiceWorkerRegistration(
  serviceWorker: PushServiceWorkerContainer,
  options: PushRegistrationLookupOptions = {},
): Promise<ServiceWorkerRegistration | null> {
  const scopePath = options.scopePath ?? DEFAULT_SCOPE_PATH;
  const existing = await serviceWorker.getRegistration(scopePath);
  if (existing) return existing;

  return await serviceWorkerReadyWithin(
    serviceWorker,
    options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
  );
}

export async function getCurrentPushSubscription(
  serviceWorker: PushServiceWorkerContainer,
  options: PushRegistrationLookupOptions = {},
): Promise<PushSubscription | null> {
  const registration = await getPushServiceWorkerRegistration(serviceWorker, options);
  return await registration?.pushManager.getSubscription() ?? null;
}

export async function unregisterServiceWorkersWithoutPushSubscriptions(
  registrations: readonly PushManagedServiceWorkerRegistration[],
): Promise<void> {
  await Promise.all(registrations.map(async (registration) => {
    try {
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        await registration.unregister();
      }
    } catch {
      // Preserve the registration if we cannot prove it has no push subscription.
    }
  }));
}
