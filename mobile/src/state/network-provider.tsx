import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

import type { NetworkId } from "@/api/dashboard-schema";

const STORAGE_KEY = "linewatch.network-id";

type NetworkContextValue = {
  network: NetworkId;
  setNetwork: (network: NetworkId) => void;
};

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: PropsWithChildren) {
  const [network, setNetworkState] = useState<NetworkId>("ttc");

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === "ttc" || value === "regional") {
        setNetworkState(value);
      }
    });
  }, []);

  const value = useMemo<NetworkContextValue>(
    () => ({
      network,
      setNetwork: (nextNetwork) => {
        setNetworkState(nextNetwork);
        void AsyncStorage.setItem(STORAGE_KEY, nextNetwork);
      },
    }),
    [network],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  const value = useContext(NetworkContext);
  if (!value) {
    throw new Error("useNetwork must be used inside NetworkProvider.");
  }
  return value;
}
