import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  didUserSessionChange,
  reconcileAccountState,
  INITIAL_ACCOUNT_STATE,
} from "../src/hooks/useAccountSession.ts";

describe("useAccountSession contracts and pure reconciliation", () => {
  const userA = { id: "user-1", email: "a@example.com", displayName: "User A" };
  const userB = { id: "user-2", email: "b@example.com", displayName: "User B" };

  it("exports correct initial account state", () => {
    assert.deepEqual(INITIAL_ACCOUNT_STATE, {
      source: "unavailable",
      authenticated: false,
      user: null,
    });
  });

  describe("didUserSessionChange", () => {
    it("returns false when both previous and next states are unauthenticated", () => {
      const state1 = { source: "unavailable", authenticated: false, user: null };
      const state2 = { source: "backend", authenticated: false, user: null };
      assert.equal(didUserSessionChange(state1, state2), false);
    });

    it("returns true when transitioning from signed-out to signed-in", () => {
      const signedOut = { source: "backend", authenticated: false, user: null };
      const signedIn = { source: "backend", authenticated: true, user: userA };
      assert.equal(didUserSessionChange(signedOut, signedIn), true);
    });

    it("returns true when transitioning from signed-in to signed-out", () => {
      const signedIn = { source: "backend", authenticated: true, user: userA };
      const signedOut = { source: "backend", authenticated: false, user: null };
      assert.equal(didUserSessionChange(signedIn, signedOut), true);
    });

    it("returns true when switching between different authenticated user IDs", () => {
      const userState1 = { source: "backend", authenticated: true, user: userA };
      const userState2 = { source: "backend", authenticated: true, user: userB };
      assert.equal(didUserSessionChange(userState1, userState2), true);
    });

    it("returns false when session refreshes for the exact same user ID", () => {
      const userState1 = { source: "backend", authenticated: true, user: userA };
      const userState2 = { source: "backend", authenticated: true, user: { ...userA, displayName: "Updated Name" } };
      assert.equal(didUserSessionChange(userState1, userState2), false);
    });
  });

  describe("reconcileAccountState", () => {
    it("preserves authenticated session when network drops or backend is unavailable", () => {
      const activeState = { source: "backend", authenticated: true, user: userA };
      const outageState = { source: "unavailable", authenticated: false, user: null };
      const reconciled = reconcileAccountState(activeState, outageState);

      assert.equal(reconciled.authenticated, true);
      assert.equal(reconciled.source, "unavailable");
      assert.deepEqual(reconciled.user, userA);
    });

    it("accepts backend signed-out state after explicit sign-out or session expiration", () => {
      const activeState = { source: "backend", authenticated: true, user: userA };
      const backendSignedOut = { source: "backend", authenticated: false, user: null };
      const reconciled = reconcileAccountState(activeState, backendSignedOut);

      assert.equal(reconciled.authenticated, false);
      assert.equal(reconciled.source, "backend");
      assert.equal(reconciled.user, null);
    });

    it("retains unauthenticated unavailable state when initial hydration fails", () => {
      const initial = INITIAL_ACCOUNT_STATE;
      const failed = { source: "unavailable", authenticated: false, user: null };
      const reconciled = reconcileAccountState(initial, failed);

      assert.equal(reconciled.authenticated, false);
      assert.equal(reconciled.source, "unavailable");
      assert.equal(reconciled.user, null);
    });

    it("transitions from outage to live backend state on network recovery", () => {
      const outageState = { source: "unavailable", authenticated: true, user: userA };
      const recoveredState = { source: "backend", authenticated: true, user: userA };
      const reconciled = reconcileAccountState(outageState, recoveredState);

      assert.equal(reconciled.authenticated, true);
      assert.equal(reconciled.source, "backend");
      assert.deepEqual(reconciled.user, userA);
    });
  });
});
