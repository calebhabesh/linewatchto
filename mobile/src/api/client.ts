import { ZodError, type ZodType } from "zod";

import { resolveApiConfiguration } from "@/config/environment";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type RequestOptions = {
  signal?: AbortSignal;
  token?: string | null;
  headers?: Record<string, string>;
};

function buildHeaders(options?: RequestOptions, hasBody = false): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options?.headers,
  };
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  return headers;
}

async function handleResponse<T>(response: Response, schema?: ZodType<T>): Promise<T> {
  if (!response.ok) {
    let errorBody: { error?: string; message?: string } | null = null;
    try {
      errorBody = await response.json();
    } catch {
      // ignore non-json response body
    }
    const message = errorBody?.message || `The LineWatchTO API returned HTTP ${response.status}.`;
    const code = errorBody?.error;
    throw new ApiError(message, response.status, undefined, code);
  }

  if (response.status === 204 || !schema) {
    return undefined as unknown as T;
  }

  try {
    return schema.parse(await response.json());
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError("The LineWatchTO API response did not match the mobile contract.", response.status, error);
    }
    throw new ApiError("The LineWatchTO API returned invalid JSON.", response.status, error);
  }
}

async function executeRequest(path: string, init: RequestInit): Promise<Response> {
  const configuration = resolveApiConfiguration();
  if (!configuration.ok) {
    throw new ApiError(configuration.message);
  }

  try {
    return await fetch(`${configuration.baseUrl}${path}`, init);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError("The LineWatchTO API could not be reached.", undefined, error);
  }
}

export async function getJson<T>(
  path: string,
  schema: ZodType<T>,
  optionsOrSignal?: RequestOptions | AbortSignal,
): Promise<T> {
  const options: RequestOptions =
    optionsOrSignal instanceof AbortSignal
      ? { signal: optionsOrSignal }
      : optionsOrSignal ?? {};

  const response = await executeRequest(path, {
    method: "GET",
    headers: buildHeaders(options),
    signal: options.signal,
  });

  return handleResponse(response, schema);
}

export async function postJson<T, B = unknown>(
  path: string,
  schema: ZodType<T>,
  body?: B,
  options?: RequestOptions,
): Promise<T> {
  const response = await executeRequest(path, {
    method: "POST",
    headers: buildHeaders(options, body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  return handleResponse(response, schema);
}

export async function putJson<T, B = unknown>(
  path: string,
  schema: ZodType<T>,
  body?: B,
  options?: RequestOptions,
): Promise<T> {
  const response = await executeRequest(path, {
    method: "PUT",
    headers: buildHeaders(options, body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  return handleResponse(response, schema);
}

export async function patchJson<T, B = unknown>(
  path: string,
  schema: ZodType<T>,
  body?: B,
  options?: RequestOptions,
): Promise<T> {
  const response = await executeRequest(path, {
    method: "PATCH",
    headers: buildHeaders(options, body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  return handleResponse(response, schema);
}

export async function deleteJson<T>(
  path: string,
  schema: ZodType<T>,
  options?: RequestOptions,
): Promise<T> {
  const response = await executeRequest(path, {
    method: "DELETE",
    headers: buildHeaders(options),
    signal: options?.signal,
  });

  return handleResponse(response, schema);
}

export async function deleteEmpty(
  path: string,
  options?: RequestOptions,
): Promise<void> {
  const response = await executeRequest(path, {
    method: "DELETE",
    headers: buildHeaders(options),
    signal: options?.signal,
  });

  if (!response.ok) {
    let errorBody: { error?: string; message?: string } | null = null;
    try {
      errorBody = await response.json();
    } catch {
      // ignore
    }
    const message = errorBody?.message || `The LineWatchTO API returned HTTP ${response.status}.`;
    const code = errorBody?.error;
    throw new ApiError(message, response.status, undefined, code);
  }
}
