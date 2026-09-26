import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AccountRequestError,
  apiUrl,
  readJson,
  readAccountError,
  accountRequestError,
  accountJsonRequest,
  accountEmptyRequest,
} from "../src/app/account-transport.ts";

describe("account transport primitives", () => {
  it("constructs AccountRequestError with status, message, and optional errorCode", () => {
    const errorWithCode = new AccountRequestError(409, "Account already exists", "email_exists");
    assert.equal(errorWithCode.name, "AccountRequestError");
    assert.equal(errorWithCode.status, 409);
    assert.equal(errorWithCode.message, "Account already exists");
    assert.equal(errorWithCode.errorCode, "email_exists");
    assert.equal(errorWithCode instanceof Error, true);

    const errorWithoutCode = new AccountRequestError(500, "Server error");
    assert.equal(errorWithoutCode.status, 500);
    assert.equal(errorWithoutCode.message, "Server error");
    assert.equal(errorWithoutCode.errorCode, null);
  });

  it("builds apiUrl with default same-origin and custom base URL", () => {
    assert.equal(apiUrl("/api/account/me"), "/api/account/me");
    assert.equal(
      apiUrl("/api/account/me", { apiBaseUrl: "https://api.linewatch.ca" }),
      "https://api.linewatch.ca/api/account/me",
    );
  });

  it("handles 204 No Content and 205 Reset Content responses without throwing in readJson", async () => {
    const response204 = new Response(null, { status: 204 });
    const result204 = await readJson(response204);
    assert.equal(result204, undefined);

    const response205 = new Response(null, { status: 205 });
    const result205 = await readJson(response205);
    assert.equal(result205, undefined);
  });

  it("handles empty and whitespace-only bodies in readJson", async () => {
    const emptyResponse = new Response("", { status: 200, headers: { "content-type": "application/json" } });
    const resultEmpty = await readJson(emptyResponse);
    assert.equal(resultEmpty, undefined);

    const whitespaceResponse = new Response("   \n\t  ", { status: 200 });
    const resultWhitespace = await readJson(whitespaceResponse);
    assert.equal(resultWhitespace, undefined);
  });

  it("handles non-JSON bodies in readJson gracefully without throwing SyntaxError", async () => {
    const htmlResponse = new Response("<html><body>Bad Gateway</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    const resultHtml = await readJson(htmlResponse);
    assert.equal(resultHtml, undefined);
  });

  it("parses valid JSON in readJson", async () => {
    const response = new Response(JSON.stringify({ authenticated: true, user: { id: "u_1" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const result = await readJson(response);
    assert.deepEqual(result, { authenticated: true, user: { id: "u_1" } });
  });

  it("extracts errorCode and message from JSON error response", async () => {
    const errorResponse = new Response(
      JSON.stringify({ error: "invalid_credentials", message: "Incorrect password" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
    const parsed = await readAccountError(errorResponse);
    assert.equal(parsed.errorCode, "invalid_credentials");
    assert.equal(parsed.message, "Incorrect password");
  });

  it("falls back gracefully when error response is non-JSON or missing error/message fields", async () => {
    const plainError = new Response("Service Unavailable", { status: 503 });
    const parsed = await readAccountError(plainError, "Authentication check failed");
    assert.equal(parsed.errorCode, null);
    assert.equal(parsed.message, "Authentication check failed with 503");

    const jsonNoFields = new Response(JSON.stringify({}), { status: 500 });
    const parsedEmptyJson = await readAccountError(jsonNoFields, "Request failed");
    assert.equal(parsedEmptyJson.errorCode, null);
    assert.equal(parsedEmptyJson.message, "Request failed with 500");
  });

  it("constructs AccountRequestError directly via accountRequestError helper", async () => {
    const response = new Response(
      JSON.stringify({ error: "rate_limited", message: "Too many attempts" }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
    const err = await accountRequestError(response);
    assert.equal(err instanceof AccountRequestError, true);
    assert.equal(err.status, 429);
    assert.equal(err.errorCode, "rate_limited");
    assert.equal(err.message, "Too many attempts");
  });

  it("sends credentials: 'include' and application/json header on accountJsonRequest", async () => {
    const requests = [];
    const fetcher = async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const data = await accountJsonRequest(
      "/api/auth/test",
      { method: "POST", body: JSON.stringify({ key: "val" }) },
      { fetcher },
    );

    assert.deepEqual(data, { ok: true });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/auth/test");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.headers["content-type"], "application/json");
  });

  it("throws AccountRequestError on non-ok status in accountJsonRequest", async () => {
    const fetcher = async () => new Response(
      JSON.stringify({ error: "not_found", message: "Item not found" }),
      { status: 404, headers: { "content-type": "application/json" } },
    );

    await assert.rejects(
      () => accountJsonRequest("/api/account/item", { method: "GET" }, { fetcher }),
      (err) => {
        assert.equal(err instanceof AccountRequestError, true);
        assert.equal(err.status, 404);
        assert.equal(err.errorCode, "not_found");
        assert.equal(err.message, "Item not found");
        return true;
      },
    );
  });

  it("sends credentials: 'include' and succeeds on 204 with accountEmptyRequest", async () => {
    const requests = [];
    const fetcher = async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: 204 });
    };

    await accountEmptyRequest("/api/account/delete-something", { method: "DELETE" }, { fetcher });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/account/delete-something");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.method, "DELETE");
  });

  it("throws AccountRequestError on error in accountEmptyRequest", async () => {
    const fetcher = async () => new Response(
      JSON.stringify({ error: "unauthorized", message: "Not logged in" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );

    await assert.rejects(
      () => accountEmptyRequest("/api/account/delete-something", { method: "DELETE" }, { fetcher }),
      (err) => {
        assert.equal(err instanceof AccountRequestError, true);
        assert.equal(err.status, 401);
        assert.equal(err.errorCode, "unauthorized");
        assert.equal(err.message, "Not logged in");
        return true;
      },
    );
  });
});
