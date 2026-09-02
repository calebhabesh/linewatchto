import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";

import { ApiError, getJson } from "@/api/client";
import { fetchDashboard } from "@/api/dashboard";
import { dashboardSchema } from "@/api/dashboard-schema";

import { mockTtcDashboard } from "./fixtures/mock-dashboards";

describe("API Client & Contract Validation", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches and parses valid dashboard data conforming to schema", async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockTtcDashboard),
      } as Response),
    ) as any;

    const data = await fetchDashboard("ttc");
    expect(data.networkId).toBe("ttc");
    expect(data.status.lines).toHaveLength(4);
    expect(data.activeAlerts).toHaveLength(1);
  });

  it("throws ApiError when API returns HTTP 404 or 500 error", async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 503,
      } as Response),
    ) as any;

    await expect(fetchDashboard("ttc")).rejects.toThrow(ApiError);
    await expect(fetchDashboard("ttc")).rejects.toThrow("The LineWatchTO API returned HTTP 503.");
  });

  it("throws ApiError when network connection fails", async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    ) as any;

    await expect(fetchDashboard("ttc")).rejects.toThrow(ApiError);
    await expect(fetchDashboard("ttc")).rejects.toThrow("The LineWatchTO API could not be reached.");
  });

  it("propagates AbortError without wrapping when signal is aborted", async () => {
    const abortError = new Error("Request was aborted");
    abortError.name = "AbortError";

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.reject(abortError),
    ) as any;

    await expect(fetchDashboard("ttc")).rejects.toThrow("Request was aborted");
  });

  it("throws ApiError with schema failure message when payload fails Zod validation", async () => {
    const invalidDashboardPayload = {
      networkId: "invalid-network",
      // missing required fields
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(invalidDashboardPayload),
      } as Response),
    ) as any;

    await expect(fetchDashboard("ttc")).rejects.toThrow(
      "The LineWatchTO API response did not match the mobile contract.",
    );
  });

  it("throws ApiError when response contains malformed JSON", async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token in JSON")),
      } as Response),
    ) as any;

    await expect(getJson("/test", z.object({}))).rejects.toThrow(
      "The LineWatchTO API returned invalid JSON.",
    );
  });
});
