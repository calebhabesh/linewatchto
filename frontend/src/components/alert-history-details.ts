import type { AlertHistoryEvent, AlertHistoryIncident } from "../app/alert-history-data";

function comparable(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function historyDescription(event: Pick<AlertHistoryEvent, "title" | "description">) {
  const description = event.description?.trim() ?? "";
  return comparable(description) === comparable(event.title) ? "" : description;
}

export function historyCause(cause: string | null | undefined) {
  const key = comparable(cause).replace(/_/g, " ");
  return !key || ["unknown", "unknown cause"].includes(key) ? null : cause!.trim();
}

// This is a source title category, never a replacement structured cause.
export function historyCategory(incident: AlertHistoryIncident) {
  if (incident.source !== "Metrolinx Open API") return null;
  const parts = incident.title.split(/\s+[–—-]\s+/);
  if (parts.length !== 2) return null;
  const prefix = comparable(parts[0]);
  const corridor = comparable(incident.lineName).replace(/\s+line$/, "");
  if (!corridor || ![corridor, `${corridor} line`, "all corridors"].includes(prefix)) return null;
  return parts[1].trim() || null;
}

export function historyChangedFields(event: AlertHistoryEvent, previous?: AlertHistoryEvent) {
  if (!previous) return [];
  const fields = [
    ["title", "Title"], ["description", "Description"], ["location", "Affected area"],
    ["displayDirection", "Direction"], ["cause", "Cause"], ["source", "Source"],
  ] as const;
  return fields.filter(([key]) => comparable(event[key]) !== comparable(previous[key]))
    .map(([, label]) => label);
}

export function historyEventsNewestFirst(events: AlertHistoryEvent[]) {
  return [...events].sort((a, b) => Date.parse(b.happenedAt) - Date.parse(a.happenedAt) || b.id - a.id);
}
