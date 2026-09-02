import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";

import { useDashboard } from "@/api/dashboard";
import { AlertsScreen } from "@/features/alerts/alerts-screen";
import { ImpactSelectionProvider } from "@/state/impact-selection-provider";
import { NetworkProvider } from "@/state/network-provider";
import { ThemeProvider } from "@/theme/theme-provider";
import { mockTtcDashboard } from "./fixtures/mock-dashboards";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
  },
}));

jest.mock("@/hooks/use-app-active", () => ({
  useAppActive: () => true,
}));

jest.mock("@/api/dashboard", () => ({
  useDashboard: jest.fn(),
}));

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <ImpactSelectionProvider>{children}</ImpactSelectionProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}

describe("AlertsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useDashboard as jest.Mock).mockReturnValue({
      data: mockTtcDashboard,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("renders line status, section headings for Current Disruptions and Planned Closures", async () => {
    await render(<AlertsScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Service impacts")).toBeTruthy();
    expect(screen.getByText("Line status")).toBeTruthy();
    expect(screen.getByText("Current Disruptions")).toBeTruthy();
    expect(screen.getAllByText("Planned Closures").length).toBeGreaterThanOrEqual(1);

    // Contains suspension and delay in Current Disruptions
    expect(screen.getByText("Line 1 Suspension")).toBeTruthy();
    expect(screen.getByText("Queen Elevator Outage")).toBeTruthy();

    // Contains planned closure in Planned Closures section
    expect(screen.getByText("Line 6 Nightly Maintenance")).toBeTruthy();
  });

  it("filters impacts when a filter tab is pressed", async () => {
    await render(<AlertsScreen />, { wrapper: Wrapper });

    // Press Delays tab
    const delaysTab = screen.getByRole("tab", { name: /Delays/ });
    fireEvent.press(delaysTab);

    await waitFor(() => {
      expect(screen.getByText("Queen Elevator Outage")).toBeTruthy();
      expect(screen.queryByText("Line 1 Suspension")).toBeNull();
      expect(screen.queryByText("Line 6 Nightly Maintenance")).toBeNull();
    });
  });

  it("navigates to impact detail when an alert card is pressed", async () => {
    await render(<AlertsScreen />, { wrapper: Wrapper });

    const suspensionCard = screen.getByTestId("alert-card-alert-suspension-1");
    fireEvent.press(suspensionCard);

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/impact/[kind]/[id]",
      params: { kind: "suspension", id: "alert-suspension-1" },
    });
  });
});
