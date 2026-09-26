import { apiUrl as buildApiUrl } from "./api-client.ts";

export type Fetcher = typeof fetch;

export type AdapterOptions = {
  fetcher?: Fetcher;
  apiBaseUrl?: string;
};

export type AccountRetryOptions = AdapterOptions & {
  retryDelaysMs?: number[];
  wait?: (delayMs: number) => Promise<void>;
};

export class AccountRequestError extends Error {
  status: number;
  errorCode: string | null;

  constructor(status: number, message: string, errorCode: string | null = null) {
    super(message);
    this.name = "AccountRequestError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export function apiUrl(path: string, options: AdapterOptions = {}): string {
  return buildApiUrl(path, options.apiBaseUrl);
}

export async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as unknown as T;
  }
  const text = await response.text();
  if (!text || !text.trim()) {
    return undefined as unknown as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as unknown as T;
  }
}

export async function readAccountError(response: Response, defaultMessage = "Account request failed") {
  try {
    const text = await response.text();
    if (text && text.trim()) {
      const body = JSON.parse(text) as { error?: string; message?: string };
      return {
        errorCode: body?.error ?? null,
        message: body?.message || `${defaultMessage} with ${response.status}`,
      };
    }
  } catch {
    // Non-JSON or unreadable error body fallback
  }
  return {
    errorCode: null,
    message: `${defaultMessage} with ${response.status}`,
  };
}

export async function accountRequestError(
  response: Response,
  defaultMessage = "Account request failed",
): Promise<AccountRequestError> {
  const err = await readAccountError(response, defaultMessage);
  return new AccountRequestError(response.status, err.message, err.errorCode);
}

export async function accountJsonRequest<T>(
  path: string,
  init: RequestInit = {},
  options: AdapterOptions = {},
): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl(path, options), {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw await accountRequestError(response);
  }
  return readJson<T>(response);
}

export async function accountEmptyRequest(
  path: string,
  init: RequestInit = {},
  options: AdapterOptions = {},
): Promise<void> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl(path, options), {
    ...init,
    credentials: "include",
    ...(init.headers ? { headers: init.headers } : {}),
  });
  if (!response.ok) {
    throw await accountRequestError(response);
  }
}
