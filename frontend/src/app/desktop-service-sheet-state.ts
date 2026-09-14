export const DESKTOP_SERVICE_SHEET_STORAGE_KEY = "linewatch-desktop-service-sheet-position-v1";

export type DesktopServiceSheetPosition = { expanded: boolean; height: number | null };

export function parseDesktopServiceSheetPosition(raw: string | null): DesktopServiceSheetPosition | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.expanded !== "boolean") return null;
    if (value.height !== null && (typeof value.height !== "number" || !Number.isFinite(value.height) || value.height < 116)) return null;
    return { expanded: value.expanded, height: value.expanded ? value.height : null };
  } catch {
    return null;
  }
}
