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
