import { resolveApiConfiguration } from "@/config/environment";
import { describe, expect, it } from "@jest/globals";

describe("resolveApiConfiguration", () => {
  it("normalizes a configured public API URL", () => {
    expect(resolveApiConfiguration("https://staging.example.test/", false)).toEqual({
      ok: true,
      baseUrl: "https://staging.example.test",
    });
  });

  it("rejects non-HTTP schemes", () => {
    expect(resolveApiConfiguration("file:///tmp/secret", false)).toEqual({
      ok: false,
      message: "EXPO_PUBLIC_LINEWATCH_API_BASE_URL must be a valid HTTP or HTTPS URL.",
    });
  });

  it("does not silently choose an endpoint for release builds", () => {
    expect(resolveApiConfiguration(undefined, false)).toEqual({
      ok: false,
      message: "This build has no LineWatchTO API URL configured.",
    });
  });
});
