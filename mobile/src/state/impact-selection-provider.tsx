import React, { createContext, useCallback, useContext, useState, type PropsWithChildren } from "react";

import type { NetworkId } from "@/api/dashboard-schema";
import { useNetwork } from "@/state/network-provider";

export type ImpactKind = "suspension" | "delay" | "reduced-speed-zone" | "planned-closure";

export interface ImpactSelection {
  cardId: string;
  kind: ImpactKind;
  label?: string;
  stationId?: string;
  segmentId?: string;
  sourceNetwork?: NetworkId;
}

export interface ImpactSelectionContextValue {
  selection: ImpactSelection | null;
  setSelection: (selection: ImpactSelection | null) => void;
  clearSelection: () => void;
  isSelected: (cardId: string) => boolean;
}

const ImpactSelectionContext = createContext<ImpactSelectionContextValue | null>(null);

export function ImpactSelectionProvider({ children }: PropsWithChildren) {
  const { network } = useNetwork();
  const [selectionState, setSelectionState] = useState<{
    network: NetworkId;
    selection: ImpactSelection | null;
  }>({
    network,
    selection: null,
  });

  const selection = selectionState.network === network ? selectionState.selection : null;

  const setSelection = useCallback((next: ImpactSelection | null) => {
    setSelectionState({ network, selection: next });
  }, [network]);

  const clearSelection = useCallback(() => {
    setSelectionState({ network, selection: null });
  }, [network]);

  const isSelected = useCallback(
    (cardId: string) => selection?.cardId === cardId,
    [selection],
  );

  return (
    <ImpactSelectionContext.Provider
      value={{
        selection,
        setSelection,
        clearSelection,
        isSelected,
      }}
    >
      {children}
    </ImpactSelectionContext.Provider>
  );
}

export function useImpactSelection(): ImpactSelectionContextValue {
  const context = useContext(ImpactSelectionContext);
  if (!context) {
    throw new Error("useImpactSelection must be used within an ImpactSelectionProvider");
  }
  return context;
}
