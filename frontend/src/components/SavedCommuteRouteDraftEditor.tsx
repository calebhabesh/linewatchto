"use client";

import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import type { AccountSavedCommuteNotificationRule } from "../app/commute-data.ts";
import type { NetworkId } from "../app/regional-data.ts";
import type { StationSummary } from "../app/station-data.ts";
import { SavedCommuteStationPicker } from "./SavedCommuteStationPicker";
import { SavedCommuteNotificationRuleEditor } from "./SavedCommuteNotificationRuleEditor";
import SquishSwitch from "./SquishSwitch";
import {
  SavedCommuteNotificationSummary,
  MonitoredRoutesDisclaimer,
} from "./SavedCommuteNotificationSummary";

export interface SavedCommuteRouteDraftEditorProps {
  editingCommuteId: string | null;
  draftNetworkId: NetworkId;
  onDraftNetworkIdChange: (networkId: NetworkId) => void;
  newLabel: string;
  onLabelChange: (label: string) => void;
  originStationId: string;
  onOriginStationIdChange: (id: string) => void;
  destinationStationId: string;
  onDestinationStationIdChange: (id: string) => void;
  stationSummaries: StationSummary[];
  activePicker: "origin" | "destination" | null;
  onActivePickerChange: (picker: "origin" | "destination" | null) => void;
  watchReturnTrip: boolean;
  onWatchReturnTripChange: (watch: boolean) => void;
  showNotificationSettings: boolean;
  onToggleNotificationSettings: () => void;
  notificationRule: AccountSavedCommuteNotificationRule;
  onNotificationRuleChange: (rule: AccountSavedCommuteNotificationRule) => void;
  saving: boolean;
  commuteError: string | null;
  onSave: () => void;
  onCancel: () => void;
  deletingCommuteId: string | null;
  onStartDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onOpenNotificationSettings: () => void;
  notificationSummary?: {
    label: string;
    detail: string;
    tone: "on" | "off" | "unavailable";
  };
  showRoutingDisclaimer: boolean;
  onToggleRoutingDisclaimer: () => void;
}

export function SavedCommuteRouteDraftEditor({
  editingCommuteId,
  draftNetworkId,
  onDraftNetworkIdChange,
  newLabel,
  onLabelChange,
  originStationId,
  onOriginStationIdChange,
  destinationStationId,
  onDestinationStationIdChange,
  stationSummaries,
  activePicker,
  onActivePickerChange,
  watchReturnTrip,
  onWatchReturnTripChange,
  showNotificationSettings,
  onToggleNotificationSettings,
  notificationRule,
  onNotificationRuleChange,
  saving,
  commuteError,
  onSave,
  onCancel,
  deletingCommuteId,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
  onOpenNotificationSettings,
  notificationSummary,
  showRoutingDisclaimer,
  onToggleRoutingDisclaimer,
}: SavedCommuteRouteDraftEditorProps) {
  return (
    <div className="saved-commute-form">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
        {editingCommuteId ? "Edit Route" : "Create a Route"}
      </h3>
      {!editingCommuteId ? (
        <div
          className="account-network-filter w-full"
          data-network={draftNetworkId}
          data-options-count={2}
          role="group"
          aria-label="Choose commute network"
        >
          <div className="account-network-glider" aria-hidden="true" />
          <button
            type="button"
            data-network="ttc"
            aria-pressed={draftNetworkId === "ttc"}
            onClick={() => onDraftNetworkIdChange("ttc")}
          >
            TTC
          </button>
          <button
            type="button"
            data-network="regional"
            aria-pressed={draftNetworkId === "regional"}
            onClick={() => onDraftNetworkIdChange("regional")}
          >
            GO & UP
          </button>
        </div>
      ) : null}
      <input
        value={newLabel}
        onChange={(event) => onLabelChange(event.target.value)}
        placeholder="Enter a Commute Label (e.g. Work)"
        aria-label="Commute label"
      />
      <div className="saved-commute-station-grid">
        <SavedCommuteStationPicker
          label="Origin"
          placeholder="Origin Station"
          value={originStationId}
          stations={stationSummaries}
          blockedStationId={destinationStationId || undefined}
          blockedLabel="Already selected as destination"
          onChange={onOriginStationIdChange}
          isOpen={activePicker === "origin"}
          onOpenChange={(open) => onActivePickerChange(open ? "origin" : null)}
        />
        <SavedCommuteStationPicker
          label="Destination"
          placeholder="Destination Station"
          value={destinationStationId}
          stations={stationSummaries}
          blockedStationId={originStationId || undefined}
          blockedLabel="Already selected as origin"
          onChange={onDestinationStationIdChange}
          isOpen={activePicker === "destination"}
          onOpenChange={(open) => onActivePickerChange(open ? "destination" : null)}
        />
      </div>
      <div className="saved-commute-return-toggle">
        <SquishSwitch
          checked={watchReturnTrip}
          ariaLabel="Track return route"
          label="Track Return Route"
          trackOnColor="#10b981"
          onChange={onWatchReturnTripChange}
        />
      </div>
      {!editingCommuteId ? (
        <button
          type="button"
          className="saved-commute-customize-toggle"
          aria-expanded={showNotificationSettings}
          onClick={onToggleNotificationSettings}
        >
          <span>Customize Commute Notifications</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${showNotificationSettings ? "rotate-180" : ""}`}
          />
        </button>
      ) : null}

      {draftNetworkId === "regional" ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Travel times are low-confidence planning estimates. Notification matching uses only fresh dashboard-visible Metrolinx corridor, segment, and station impacts.
        </p>
      ) : null}

      {!editingCommuteId && showNotificationSettings ? (
        <div className="saved-commute-rule-drawer">
          <SavedCommuteNotificationRuleEditor
            rule={notificationRule}
            onChange={onNotificationRuleChange}
            allowReturnLeg={watchReturnTrip}
            networkId={draftNetworkId}
          />
        </div>
      ) : null}

      <div className="flex gap-2.5 mt-2">
        <button
          type="button"
          className="saved-commute-cancel-button flex-1"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="saved-commute-primary-button flex-1"
          onClick={onSave}
          disabled={saving}
          aria-busy={saving}
        >
          {saving ? (
            <>
              <Loader2 size={15} className="saved-commute-loading-icon" aria-hidden="true" />
              Plotting route
            </>
          ) : editingCommuteId ? (
            "Save changes"
          ) : (
            "Save commute"
          )}
        </button>
      </div>
      {commuteError ? <p className="text-xs font-semibold text-red-600 dark:text-red-300">{commuteError}</p> : null}

      {editingCommuteId ? (
        <div className="saved-commute-edit-danger-zone">
          {deletingCommuteId === editingCommuteId ? (
            <div className="saved-commute-delete-confirm-box">
              <span className="saved-commute-delete-confirm-prompt">Delete this commute route?</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="saved-commute-delete-confirm-btn"
                  onClick={() => onConfirmDelete(editingCommuteId)}
                  aria-label={`Confirm delete commute ${newLabel}`}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="saved-commute-delete-cancel-btn"
                  onClick={onCancelDelete}
                  aria-label="Cancel delete commute"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="saved-commute-edit-delete-button"
              onClick={() => onStartDelete(editingCommuteId)}
              aria-label={`Delete commute ${newLabel}`}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>Delete this commute</span>
            </button>
          )}
        </div>
      ) : null}

      <SavedCommuteNotificationSummary
        onOpenNotificationSettings={onOpenNotificationSettings}
        notificationSummary={notificationSummary}
      />
      {!editingCommuteId ? (
        <MonitoredRoutesDisclaimer
          expanded={showRoutingDisclaimer}
          onToggle={onToggleRoutingDisclaimer}
          contentId="create-commute-routing-disclaimer"
          message="My Commutes monitors the TTC or GO/UP rail routes you select. If you use both systems, save one route for each so you can review both in this list. LineWatchTO evaluates only the selected rail networks, so the monitored routes may not be the fastest or most optimal choices across every travel scenario or account for buses, walking transfers, and alternatives."
        />
      ) : null}
    </div>
  );
}
