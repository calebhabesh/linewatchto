import { apiUrl as buildApiUrl } from "./api-client.ts";

type Fetcher = typeof fetch;

type AdapterOptions = {
  fetcher?: Fetcher;
  apiBaseUrl?: string;
};

export const MAX_FEEDBACK_MESSAGE_LENGTH = 2000;
export const FEEDBACK_DESTINATION_EMAIL = "feedback@linewatchto.ca";

export type SubmitFeedbackInput = {
  message: string;
  pageUrl: string;
  appVersion: string;
  dataSource: "backend" | "fixture" | "unavailable" | string;
  viewport: string;
  website: string;
};

export type SubmitFeedbackResponse = {
  accepted: boolean;
  message: string;
};

export class FeedbackRequestError extends Error {
  status: number;
  errorCode: string | null;

  constructor(status: number, message: string, errorCode: string | null = null) {
    super(message);
    this.name = "FeedbackRequestError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export async function submitFeedback(input: SubmitFeedbackInput, options: AdapterOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl("/api/feedback", options), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await readFeedbackError(response);
    throw new FeedbackRequestError(response.status, error.message, error.errorCode);
  }
  return (await response.json()) as SubmitFeedbackResponse;
}

export function buildFeedbackMailtoUrl(input: SubmitFeedbackInput) {
  const body = [
    input.message.trim(),
    "",
    `Page: ${input.pageUrl || "/"}`,
    `App version: ${input.appVersion || "unknown"}`,
    `Data source: ${input.dataSource || "unknown"}`,
    `Viewport: ${input.viewport || "unknown"}`,
  ].join("\n");
  const params = new URLSearchParams({
    subject: "LineWatch TO feedback",
    body,
  });
  return `mailto:${FEEDBACK_DESTINATION_EMAIL}?${params.toString()}`;
}

function apiUrl(path: string, options: AdapterOptions = {}) {
  return buildApiUrl(path, options.apiBaseUrl);
}

async function readFeedbackError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return {
      errorCode: body.error ?? null,
      message: body.message || `Feedback request failed with ${response.status}`,
    };
  } catch {
    return {
      errorCode: null,
      message: `Feedback request failed with ${response.status}`,
    };
  }
}
