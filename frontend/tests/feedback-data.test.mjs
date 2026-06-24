import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FeedbackRequestError,
  MAX_FEEDBACK_MESSAGE_LENGTH,
  buildFeedbackMailtoUrl,
  submitFeedback,
} from "../src/app/feedback-data.ts";

describe("feedback data adapter", () => {
  it("posts feedback to the same-origin backend endpoint", async () => {
    const requests = [];
    const response = await submitFeedback(
      {
        message: "Please make weekend closures easier to scan.",
        pageUrl: "/?panel=closures",
        appVersion: "0.1.0-dev",
        dataSource: "backend",
        viewport: "390x844",
        website: "",
      },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(JSON.stringify({ accepted: true, message: "Feedback received." }), {
            status: 202,
            headers: { "content-type": "application/json" },
          });
        },
      },
    );

    assert.deepEqual(response, { accepted: true, message: "Feedback received." });
    assert.equal(requests[0].input, "/api/feedback");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      message: "Please make weekend closures easier to scan.",
      pageUrl: "/?panel=closures",
      appVersion: "0.1.0-dev",
      dataSource: "backend",
      viewport: "390x844",
      website: "",
    });
  });

  it("surfaces backend feedback errors", async () => {
    await assert.rejects(
      () =>
          submitFeedback(
            {
              message: "x".repeat(MAX_FEEDBACK_MESSAGE_LENGTH + 1),
              pageUrl: "/",
              appVersion: "0.1.0-dev",
              dataSource: "fixture",
              viewport: "1280x720",
              website: "",
            },
            {
              fetcher: async () =>
                new Response(JSON.stringify({ error: "feedback_too_long", message: "Feedback must be 2000 characters or less." }), {
                  status: 400,
                  headers: { "content-type": "application/json" },
                }),
            },
          ),
      (error) =>
        error instanceof FeedbackRequestError &&
        error.status === 400 &&
        error.errorCode === "feedback_too_long" &&
        error.message === "Feedback must be 2000 characters or less.",
    );
  });

  it("builds a mailto fallback with the typed message and page context", () => {
    const url = buildFeedbackMailtoUrl({
      message: "Could you make Line 2 delays more visible?",
      pageUrl: "/?panel=delays",
      appVersion: "0.1.0-dev",
      dataSource: "fixture",
      viewport: "1280x720",
      website: "",
    });

    assert.match(url, /^mailto:feedback@linewatchto\.ca\?/);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("subject"), "LineWatchTO feedback");
    assert.match(parsed.searchParams.get("body"), /Could you make Line 2 delays more visible\?/);
    assert.match(parsed.searchParams.get("body"), /Page: \/\?panel=delays/);
    assert.match(parsed.searchParams.get("body"), /App version: 0\.1\.0-dev/);
  });
});
