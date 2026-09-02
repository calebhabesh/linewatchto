import { ZodError, type ZodType } from "zod";

import { resolveApiConfiguration } from "@/config/environment";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function getJson<T>(
  path: string,
  schema: ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const configuration = resolveApiConfiguration();
  if (!configuration.ok) {
    throw new ApiError(configuration.message);
  }

  let response: Response;
  try {
    response = await fetch(`${configuration.baseUrl}${path}`, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError("The LineWatchTO API could not be reached.", undefined, error);
  }

  if (!response.ok) {
    throw new ApiError(`The LineWatchTO API returned HTTP ${response.status}.`, response.status);
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
