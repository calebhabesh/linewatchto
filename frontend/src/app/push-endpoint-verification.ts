// A push service can hand out an endpoint that is dead from the start: on
// 2026-11-02 a fresh Android Chrome endpoint answered 410 on its first send,
// and the phone stayed unreachable until the app was opened again 12 minutes
// later. The server sends a replacement endpoint its catch-up seconds after it
// registers, so the open app checks back shortly after saving a new endpoint;
// a re-save the server rejects as dead makes the page subscribe afresh.

import type { PushRegistrationReason } from "./push-subscription-check";

// After the backend's settle (5 s) and prompt catch-up tick (2 s), then once
// past the regular minute evaluation in case the prompt one was skipped.
export const NEW_ENDPOINT_VERIFICATION_DELAYS_MS = [15_000, 75_000] as const;
// Bounds replacement chains when every new endpoint keeps failing.
export const MAX_NEW_ENDPOINT_VERIFICATIONS = 3;

type Timer = ReturnType<typeof setTimeout>;

export type NewEndpointVerifier = {
  /** Call after each successful save, with the reason the endpoint was saved under. */
  endpointSaved: (reason: PushRegistrationReason) => void;
  dispose: () => void;
};

/** Endpoints the page itself obtained: a rider's enable has no catch-up to test it. */
export function savedEndpointNeedsVerification(reason: PushRegistrationReason): boolean {
  return reason === "restored-missing"
    || reason === "endpoint-replaced"
    || reason === "invalid-endpoint-replacement";
}

export function createNewEndpointVerifier({
  verify,
  delaysMs = NEW_ENDPOINT_VERIFICATION_DELAYS_MS,
  maxVerifications = MAX_NEW_ENDPOINT_VERIFICATIONS,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
}: {
  verify: () => Promise<unknown>;
  delaysMs?: readonly number[];
  maxVerifications?: number;
  schedule?: (callback: () => void, delayMs: number) => Timer;
  cancel?: (timer: Timer) => void;
}): NewEndpointVerifier {
  let verifications = 0;
  let timers: Timer[] = [];
  let disposed = false;

  const clearTimers = () => {
    timers.forEach((timer) => cancel(timer));
    timers = [];
  };

  return {
    endpointSaved(reason) {
      if (disposed || !savedEndpointNeedsVerification(reason) || verifications >= maxVerifications) return;
      verifications += 1;
      // A newer endpoint supersedes the checks scheduled for the previous one.
      clearTimers();
      timers = delaysMs.map((delay) => schedule(() => {
        if (disposed) return;
        verify().catch((error: unknown) => {
          console.warn("Push endpoint verification failed", error);
        });
      }, delay));
    },
    dispose() {
      disposed = true;
      clearTimers();
    },
  };
}
