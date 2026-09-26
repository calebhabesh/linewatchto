import { apiUrl } from "./api-client.ts";
import type { NetworkId } from "./regional-data.ts";

export type AccessibilityAssetType = "elevator" | "escalator";

export type AccessibilityOutageLineSummary = {
  lineId: string;
  lineNumber: string;
  lineName: string;
  color: string;
  count: number;
};

export type AccessibilityOutageAssetSummary = {
  assetType: string;
  label: string;
  count: number;
  lines: AccessibilityOutageLineSummary[];
};

export type AccessibilityOutageDetail = {
  id: string;
  assetType: string;
  title: string;
  description: string;
  cause?: string | null;
  updatedAt: string;
  source: string;
};

export type AccessibilityOutageStationGroup = {
  stationId: string;
  stationName: string;
  count: number;
  outages: AccessibilityOutageDetail[];
};

export type AccessibilityOutageLineGroup = {
  lineId: string;
  lineNumber: string;
  lineName: string;
  color: string;
  stations: AccessibilityOutageStationGroup[];
};

export type AccessibilityOutageResponse = {
  generatedAt: string;
  fresh: boolean;
  source: string;
  assetTypes: AccessibilityOutageAssetSummary[];
  groups: AccessibilityOutageLineGroup[];
};

export type AccessibilityOutageResult = {
  source: "backend" | "fallback";
  data: AccessibilityOutageResponse;
};

export type AccessibilityOutageFetchOptions = {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
  networkId?: NetworkId;
  signal?: AbortSignal;
};

export const fallbackAccessibilityOutages: AccessibilityOutageResponse = {
  generatedAt: new Date().toISOString(),
  fresh: false,
  source: "LineWatchTO fixture",
  assetTypes: [],
  groups: [],
};

export async function getAccessibilityOutages(
  asset?: AccessibilityAssetType,
  options: AccessibilityOutageFetchOptions = {}
): Promise<AccessibilityOutageResult> {
  const fetcher = options.fetcher ?? fetch;
  const parameters = new URLSearchParams();
  if (asset) parameters.set("asset", asset);
  if (options.networkId === "regional") parameters.set("network", "regional");
  const query = parameters.toString();
  const path = `/api/accessibility-outages${query ? `?${query}` : ""}`;

  try {
    const fetchInit: RequestInit = {};
    if (options.signal) {
      fetchInit.signal = options.signal;
    }
    const response = await fetcher(apiUrl(path, options.apiBaseUrl), fetchInit);
    if (!response.ok) {
      throw new Error(`Accessibility outages request failed with ${response.status}`);
    }

    return {
      source: "backend",
      data: (await response.json()) as AccessibilityOutageResponse,
    };
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError")
      || (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError")
    ) {
      throw error;
    }
    return {
      source: "fallback",
      data: options.networkId === "regional"
        ? {
            ...fallbackAccessibilityOutages,
            generatedAt: new Date().toISOString(),
            source: "Metrolinx Open API unavailable",
          }
        : fallbackAccessibilityOutages,
    };
  }
}
