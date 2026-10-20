import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const workerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

describe("service worker push receipts", () => {
  it("records signed delivery receipts without depending on account-cookie endpoints", () => {
    assert.match(workerSource, /deliveryId:\s*typeof body\.deliveryId === "string"/);
    assert.match(workerSource, /receiptToken:\s*typeof body\.receiptToken === "string"/);
    assert.match(workerSource, /\/api\/account\/push\/receipt/);
    assert.match(workerSource, /deliveryId:\s*notification\.deliveryId/);
    assert.match(workerSource, /receiptToken:\s*notification\.receiptToken/);
  });
});

async function tapNotification(notification, windowClients) {
  const { runInNewContext } = await import("node:vm");
  const listeners = new Map();
  const opened = [];
  const fetches = [];
  const clientsApi = {
    matchAll: async () => windowClients,
    openWindow: async (url) => {
      opened.push(url);
      return { url };
    },
  };
  const context = {
    URL,
    Promise,
    MessageChannel,
    setTimeout,
    clearTimeout,
    fetch: async (url) => {
      fetches.push(url);
      return { ok: true };
    },
    clients: clientsApi,
    self: {
      location: new URL("https://linewatch.test/sw.js"),
      addEventListener: (type, listener) => listeners.set(type, listener),
      clients: clientsApi,
      registration: { pushManager: { getSubscription: async () => null } },
    },
  };
  runInNewContext(workerSource, context, { filename: "sw.js" });
  let work;
  listeners.get("notificationclick")({
    notification: { close: () => {}, tag: "line-current|line-1|suspension|alert-1|active", ...notification },
    waitUntil: (promise) => {
      work = promise;
    },
  });
  await work;
  return { opened };
}

function windowClient(url, { acknowledges = false, focused = false } = {}) {
  const client = {
    url,
    focused,
    visibilityState: focused ? "visible" : "hidden",
    messages: [],
    navigations: [],
    focusCalls: 0,
    focus: async () => {
      client.focusCalls += 1;
      return client;
    },
    navigate: async (target) => {
      client.navigations.push(target);
      return client;
    },
    postMessage: (message, ports) => {
      client.messages.push(message);
      if (acknowledges) ports[0].postMessage({ type: `${message.type}-ack` });
    },
  };
  return client;
}

describe("service worker notification taps", () => {
  const target = "/?panel=alerts&impactKind=suspension&impactId=alert-1&targetLine=line-1";

  it("steers the open dashboard instead of opening another window", async () => {
    const client = windowClient("https://linewatch.test/?network=ttc", { acknowledges: true, focused: true });
    const { opened } = await tapNotification({ data: { url: target, state: "ACTIVE" } }, [client]);

    assert.equal(client.focusCalls, 1);
    assert.equal(JSON.stringify(client.messages), JSON.stringify([{ type: "linewatch-notification-open", url: target }]));
    assert.deepEqual(client.navigations, []);
    assert.deepEqual(opened, []);
  });

  it("navigates an open window that does not acknowledge the target", async () => {
    const client = windowClient("https://linewatch.test/account/reset");
    const { opened } = await tapNotification({ data: { url: target, state: "ACTIVE" } }, [client]);

    assert.deepEqual(client.navigations, [`https://linewatch.test${target}`]);
    assert.deepEqual(opened, []);
  });

  it("opens a window when the app is not running", async () => {
    const { opened } = await tapNotification({ data: { url: target, state: "ACTIVE" } }, []);
    assert.deepEqual(opened, [`https://linewatch.test${target}`]);
  });

  it("keeps cleared meaning for payloads queued before targets carried state", async () => {
    const { opened } = await tapNotification({ data: { url: target, state: "CLEARED" } }, []);
    assert.deepEqual(opened, [`https://linewatch.test${target}&state=cleared`]);
  });

  it("refuses cross-origin notification URLs", async () => {
    const { opened } = await tapNotification({ data: { url: "https://evil.test/phish", state: "ACTIVE" } }, []);
    assert.deepEqual(opened, ["https://linewatch.test/"]);
  });
});
