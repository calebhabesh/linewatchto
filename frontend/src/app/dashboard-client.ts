import type { ReliabilitySnapshot } from "./linewatch-data.ts";
import { isDashboardApiResponse, type DashboardApiResponse } from "./dashboard-contract.ts";
import type { NetworkId } from "./regional-data.ts";
import { apiUrl } from "./api-client.ts";

export const DASHBOARD_RETRY_DELAYS_MS = [1_000, 2_500] as const;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Wait = (milliseconds: number) => Promise<void>;

export type DashboardRefreshResult = {
  payload: DashboardApiResponse;
  reliability: ReliabilitySnapshot | null;
};

const waitFor = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

export async function getDashboardRefresh(
  networkId: NetworkId,
  fetcher: Fetcher = fetch,
): Promise<DashboardRefreshResult> {
  const reliabilityRequest = fetcher(apiUrl(`/api/reliability/lines?network=${networkId}`), {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  }).then(async (response) => response.ok
    ? await response.json() as ReliabilitySnapshot
    : null
  ).catch(() => null);

  const response = await fetcher(apiUrl(`/api/dashboard?network=${networkId}`), {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`${networkId} dashboard request failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (!isDashboardApiResponse(payload) || (payload.networkId && payload.networkId !== networkId)) {
    throw new Error(`${networkId} dashboard returned an incomplete payload`);
  }

  return {
    payload,
    reliability: await reliabilityRequest,
  };
}

export async function retryDashboardRefresh<T>(
  request: () => Promise<T>,
  onRetry: (attempt: number) => void,
  retryDelays: readonly number[] = DASHBOARD_RETRY_DELAYS_MS,
  wait: Wait = waitFor,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await request();
    } catch (error) {
      if (attempt >= retryDelays.length) throw error;
      onRetry(attempt + 1);
      await wait(retryDelays[attempt]);
      attempt += 1;
    }
  }
}
