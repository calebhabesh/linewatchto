export type AlertHistoryPeriod = "today" | "7d" | "30d";
export type AlertHistorySource = "backend" | "fallback";

export type AlertHistoryEvent = {
  id: number;
  state: "opened" | "updated" | "cleared" | string;
  label: string;
  happenedAt: string;
  title: string;
  description: string;
  location: string;
  displayDirection: string | null;
  cause: string | null;
  source: string;
};

export type AlertHistoryIncident = {
  alertId: string;
  sourceId: string | null;
  lineId: string | null;
  lineNumber: string | null;
  lineName: string | null;
  eventType: string;
  title: string;
  location: string;
  displayDirection: string | null;
  source: string;
  cause: string | null;
  status: "active" | "cleared" | string;
  firstSeenAt: string | null;
  lastUpdatedAt: string | null;
  clearedAt: string | null;
  durationMinutes: number | null;
  events: AlertHistoryEvent[];
};

export type AlertHistoryResponse = {
  generatedAt: string;
  period: AlertHistoryPeriod;
  since: string;
  until: string;
  incidents: AlertHistoryIncident[];
};

export type AlertHistoryResult = {
  source: AlertHistorySource;
  data: AlertHistoryResponse;
};

export const emptyAlertHistory: AlertHistoryResponse = {
  generatedAt: "",
  period: "today",
  since: "",
  until: "",
  incidents: [],
};

export async function getAlertHistory(
  period: AlertHistoryPeriod = "today",
  limit = 300,
): Promise<AlertHistoryResult> {
  const params = new URLSearchParams({
    period,
    limit: String(limit),
  });

  try {
    const response = await fetch(`/api/alert-history?${params.toString()}`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Alert history request failed: ${response.status}`);
    }
    const data = await response.json() as AlertHistoryResponse;
    return { source: "backend", data };
  } catch {
    return {
      source: "fallback",
      data: {
        ...emptyAlertHistory,
        period,
      },
    };
  }
}
