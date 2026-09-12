"use client";

import { History } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import { AlertHistoryTimeline } from "./AlertHistoryTimeline";
import type { NetworkId } from "../app/regional-data";

type Props = {
  onBack: () => void;
  onClose: () => void;
  network: NetworkId;
};

export function AlertHistoryPanel({ onBack, onClose, network }: Props) {
  return (
    <section className="alert-history-panel panel min-w-0 border border-transparent rounded-2xl" aria-label="Alert history panel">
      <PanelHeader
        title="Alert History"
        icon={<History className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />}
        onBack={onBack}
        onClose={onClose}
      />

      <AlertHistoryTimeline network={network} />
    </section>
  );
}
