import type { AccountCommutePathPreview } from "./commute-data.ts";

/** The panel a path preview returns to. */
export function pathPreviewReturnView(preview: Pick<AccountCommutePathPreview, "returnView">): "commutes" | "alert-history" {
  return preview.returnView ?? "commutes";
}

/** The saved commute My Commutes focuses on returning from a preview; none for other previews. */
export function pathPreviewCommuteId(preview: Pick<AccountCommutePathPreview, "returnView" | "commuteId" | "id">): string | null {
  return preview.returnView ? null : preview.commuteId ?? preview.id;
}
