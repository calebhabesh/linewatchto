import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

export type ShellTab = "index" | "alerts" | "stations" | "commutes" | "more";

export interface ShellContextValue {
  isShellMounted: boolean;
  activeTab: ShellTab;
  setActiveTab: (tab: ShellTab) => void;
  isMapInteractive: boolean;
  setMapInteractive: (interactive: boolean) => void;
  resetNonce: number;
  triggerMapReset: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export interface ShellProviderProps {
  initialTab?: ShellTab;
}

export function ShellProvider({
  children,
  initialTab = "index",
}: PropsWithChildren<ShellProviderProps>) {
  const [activeTab, setActiveTab] = useState<ShellTab>(initialTab);
  const [isMapInteractive, setMapInteractive] = useState(true);
  const [resetNonce, setResetNonce] = useState(0);

  const triggerMapReset = useCallback(() => {
    setResetNonce((n) => n + 1);
  }, []);

  const value = useMemo<ShellContextValue>(
    () => ({
      isShellMounted: true,
      activeTab,
      setActiveTab,
      isMapInteractive,
      setMapInteractive,
      resetNonce,
      triggerMapReset,
    }),
    [activeTab, isMapInteractive, resetNonce, triggerMapReset],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShell must be used within a ShellProvider");
  }
  return ctx;
}

export function useShellOptional(): ShellContextValue | null {
  return useContext(ShellContext);
}
