import type { AccountSavedCommuteNotificationRule } from "./account-data";
import type { NetworkId } from "./regional-data";

export interface SavedCommuteDraft {
  newLabel: string;
  editingCommuteId: string | null;
  originStationId: string;
  destinationStationId: string;
  watchReturnTrip: boolean;
  newNotificationRule: AccountSavedCommuteNotificationRule;
  showNotificationSettings: boolean;
  showRoutingDisclaimer: boolean;
  draftNetworkId: NetworkId;
  commuteError: string | null;
}

export const persistedCommuteDraftStore: { current: SavedCommuteDraft | null } = { current: null };

export function clearPersistedCommuteDraft(): void {
  persistedCommuteDraftStore.current = null;
}

export function setPersistedCommuteDraft(draft: SavedCommuteDraft | null): void {
  persistedCommuteDraftStore.current = draft;
}

export const persistedExpandedImpactDisclosures = new Set<string>();
