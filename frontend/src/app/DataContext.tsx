"use client";

import { createContext, useContext, ReactNode } from "react";
import type { DashboardData } from "./dashboard-contract.ts";

export type { DashboardData };

const DataContext = createContext<DashboardData | null>(null);

export function DataProvider({ data, children }: { data: DashboardData; children: ReactNode }) {
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useDashboardData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useDashboardData must be used within a DataProvider");
  return ctx;
}

export function useOptionalDashboardData(): DashboardData | null {
  return useContext(DataContext);
}
