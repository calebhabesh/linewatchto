import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router, useLocalSearchParams } from "expo-router";
import type { PropsWithChildren } from "react";

import { useDashboard } from "@/api/dashboard";
import { ImpactDetailScreen } from "@/features/alerts/impact-detail-screen";
import { ImpactSelectionProvider } from "@/state/impact-selection-provider";
import { NetworkProvider } from "@/state/network-provider";
import { ThemeProvider } from "@/theme/theme-provider";
import { mockTtcDashboard } from "./fixtures/mock-dashboards";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
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

describe("ImpactDetailScreen", () => {
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

  it("renders active suspension details with line badge, shuttle status, and timings", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      kind: "suspension",
      id: "alert-suspension-1",
    });

    await render(<ImpactDetailScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Line 1 Suspension")).toBeTruthy();
    expect(screen.getByText("Union to King")).toBeTruthy();
    expect(screen.getByText("ACTIVE ALERT")).toBeTruthy();
    expect(screen.getByText("Shuttle buses requested / operating")).toBeTruthy();
    expect(screen.getByText("9:00 AM")).toBeTruthy();
    expect(screen.getByText("9:30 AM")).toBeTruthy();
    expect(screen.getByText("TTC Live Alerts")).toBeTruthy();
    expect(screen.getByText("Service suspended for track repairs.")).toBeTruthy();
    expect(screen.getByText("Track work")).toBeTruthy();
  });

  it("renders reduced speed zone with metrics breakdown", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      kind: "reduced-speed-zone",
      id: "rsz-line-2-1",
    });

    await render(<ImpactDetailScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Line 2 Reduced Speed Zone")).toBeTruthy();
    expect(screen.getByText("REDUCED SPEED ZONE")).toBeTruthy();
    expect(screen.getByText("Speed & Track Metrics")).toBeTruthy();
    expect(screen.getByText("20 km/h")).toBeTruthy();
    expect(screen.getByText("45 km/h")).toBeTruthy();
    expect(screen.getByText("450m")).toBeTruthy();
    expect(screen.getByText("200m")).toBeTruthy();
  });

  it("renders not-found state when impact is not in dashboard", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      kind: "delay",
      id: "nonexistent-delay",
    });

    await render(<ImpactDetailScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Impact not found in current response")).toBeTruthy();
  });

  it("handles back button navigation", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      kind: "suspension",
      id: "alert-suspension-1",
    });

    await render(<ImpactDetailScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByLabelText("Go back"));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("renders inside an OperationsSheet detail variant frame with 64% initial height and dismiss backdrop", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      kind: "suspension",
      id: "alert-suspension-1",
    });

    await render(<ImpactDetailScreen />, { wrapper: Wrapper });

    const sheet = screen.getByTestId("impact-detail-sheet");
    expect(sheet).toBeTruthy();
    expect(sheet.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          left: 8,
          right: 8,
          borderRadius: 8,
          borderWidth: 1,
        }),
        expect.objectContaining({
          height: "64%",
          maxHeight: "78%",
        }),
      ]),
    );

    // Tapping outside the detail sheet dismisses back
    const backdrop = screen.getByTestId("impact-detail-sheet-backdrop");
    expect(backdrop).toBeTruthy();
    fireEvent.press(backdrop);
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
