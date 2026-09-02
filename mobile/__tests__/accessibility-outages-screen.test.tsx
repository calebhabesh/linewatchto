import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";

import { useAccessibilityOutages } from "@/api/accessibility";
import type { AccessibilityOutagesResponse } from "@/api/accessibility-schema";
import { accessibilityOutagesResponseSchema } from "@/api/accessibility-schema";
import { AccessibilityOutagesScreen } from "@/features/accessibility/accessibility-outages-screen";
import { NetworkProvider } from "@/state/network-provider";
import { ThemeProvider } from "@/theme/theme-provider";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
  },
}));

jest.mock("@/hooks/use-screen-focused", () => ({
  useScreenFocused: () => true,
}));

jest.mock("@/hooks/use-app-active", () => ({
  useAppActive: () => true,
}));

jest.mock("@/api/accessibility", () => {
  const actual = jest.requireActual<Record<string, unknown>>("@/api/accessibility");
  return {
    ...actual,
    useAccessibilityOutages: jest.fn(),
  };
});

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <NetworkProvider>{children}</NetworkProvider>
    </ThemeProvider>
  );
}

const mockAccessibilityData: AccessibilityOutagesResponse = {
  generatedAt: "2026-09-01T14:30:00Z",
  fresh: true,
  source: "TTC Live Alerts",
  assetTypes: [
    {
      assetType: "elevator",
      label: "Elevators",
      count: 2,
      lines: [
        {
          lineId: "line-1",
          lineNumber: "1",
          lineName: "Yonge-University",
          color: "#F8C300",
          count: 2,
        },
      ],
    },
  ],
  groups: [
    {
      lineId: "line-1",
      lineNumber: "1",
      lineName: "Yonge-University",
      color: "#F8C300",
      stations: [
        {
          stationId: "bloor-yonge",
          stationName: "Bloor-Yonge",
          count: 2,
          outages: [
            {
              id: "outage-1",
              assetType: "elevator",
              title: "Line 1 Southbound Platform to Concourse Elevator",
              description: "Elevator temporarily removed from service for scheduled maintenance.",
              cause: "Scheduled Maintenance",
              updatedAt: "10 mins ago",
              source: "TTC",
            },
            {
              id: "outage-2",
              assetType: "escalator",
              title: "East Concourse to Street Escalator",
              description: "Escalator stopped for motor inspection.",
              cause: "Mechanical issue",
              updatedAt: "25 mins ago",
              source: "TTC",
            },
          ],
        },
      ],
    },
  ],
};

const mockEmptyAccessibilityData: AccessibilityOutagesResponse = {
  generatedAt: "2026-09-01T14:30:00Z",
  fresh: true,
  source: "TTC Live Alerts",
  assetTypes: [],
  groups: [],
};

describe("Accessibility Outages Feature", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("validates accessibility response schema with contract parser", () => {
    const parsed = accessibilityOutagesResponseSchema.safeParse(mockAccessibilityData);
    expect(parsed.success).toBe(true);
  });

  it("renders loading state when query is pending", async () => {
    (useAccessibilityOutages as jest.Mock).mockReturnValue({
      data: null,
      isPending: true,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<AccessibilityOutagesScreen />, { wrapper: Wrapper });
    expect(screen.getByText("Loading accessibility outages…")).toBeTruthy();
  });

  it("renders empty state when no outages are reported", async () => {
    (useAccessibilityOutages as jest.Mock).mockReturnValue({
      data: mockEmptyAccessibilityData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<AccessibilityOutagesScreen />, { wrapper: Wrapper });
    expect(screen.getByText("All Facilities in Service")).toBeTruthy();
  });

  it("renders line groups, station summaries, and outage details", async () => {
    (useAccessibilityOutages as jest.Mock).mockReturnValue({
      data: mockAccessibilityData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<AccessibilityOutagesScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Accessibility Outages")).toBeTruthy();
    expect(screen.getByText("Yonge-University")).toBeTruthy();
    expect(screen.getByText("Bloor-Yonge")).toBeTruthy();
    expect(screen.getByText("2 Active Outages")).toBeTruthy();
    expect(
      screen.getByText("Line 1 Southbound Platform to Concourse Elevator")
    ).toBeTruthy();
    expect(screen.getAllByText("CAUSE:").length).toBe(2);
    expect(screen.getByText("Scheduled Maintenance")).toBeTruthy();
  });

  it("navigates to station detail when station card is tapped", async () => {
    (useAccessibilityOutages as jest.Mock).mockReturnValue({
      data: mockAccessibilityData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<AccessibilityOutagesScreen />, { wrapper: Wrapper });

    const stationRow = screen.getByTestId("station-outage-row-bloor-yonge");
    fireEvent.press(stationRow);

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/station/[network]/[id]",
      params: { network: "ttc", id: "bloor-yonge" },
    });
  });

  it("navigates back when back button is pressed", async () => {
    (useAccessibilityOutages as jest.Mock).mockReturnValue({
      data: mockAccessibilityData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<AccessibilityOutagesScreen />, { wrapper: Wrapper });

    const backButton = screen.getByTestId("accessibility-back-button");
    fireEvent.press(backButton);

    expect(router.back).toHaveBeenCalled();
  });
});
