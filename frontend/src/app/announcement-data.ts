import { apiUrl } from "./api-client.ts";

export type TtcAnnouncementDetail = {
  id: string;
  scope: "site-wide" | "general" | "update";
  title: string;
  description: string;
  url?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  updatedAt?: string | null;
  source: string;
};

export type TtcAnnouncementResponse = {
  generatedAt: string;
  fresh: boolean;
  source: string;
  announcements: TtcAnnouncementDetail[];
};

export type TtcAnnouncementResult = {
  source: "backend" | "fallback";
  data: TtcAnnouncementResponse;
};

export const fallbackTtcAnnouncements: TtcAnnouncementResponse = {
  generatedAt: new Date().toISOString(),
  fresh: false,
  source: "LineWatchTO fixture",
  announcements: [],
};

export async function getTtcAnnouncements(options: {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
  query?: string;
  limit?: number;
} = {}): Promise<TtcAnnouncementResult> {
  const params = new URLSearchParams();
  if (options.query?.trim()) params.set("query", options.query.trim());
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  const queryString = params.toString();
  const path = queryString ? `/api/announcements?${queryString}` : "/api/announcements";

  try {
    const response = await (options.fetcher ?? fetch)(apiUrl(path, options.apiBaseUrl));
    if (!response.ok) {
      throw new Error(`Announcements request failed with ${response.status}`);
    }
    return {
      source: "backend",
      data: (await response.json()) as TtcAnnouncementResponse,
    };
  } catch {
    return { source: "fallback", data: fallbackTtcAnnouncements };
  }
}
