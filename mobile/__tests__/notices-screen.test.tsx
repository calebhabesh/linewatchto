import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";

import { useRegionalTripChanges, useSurfaceNotices } from "@/api/notices";
import type { RegionalTripChangeResponse, SurfaceNoticeResponse } from "@/api/notices-schema";
import {
  regionalTripChangeResponseSchema,
  surfaceNoticeResponseSchema,
} from "@/api/notices-schema";
import { NoticesScreen } from "@/features/notices/notices-screen";
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

jest.mock("@/api/notices", () => {
  const actual = jest.requireActual<Record<string, unknown>>("@/api/notices");
  return {
    ...actual,
    useSurfaceNotices: jest.fn(),
    useRegionalTripChanges: jest.fn(),
  };
});

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <NetworkProvider>{children}</NetworkProvider>
    </ThemeProvider>
  );
}

const mockSurfaceData: SurfaceNoticeResponse = {
  generatedAt: "2026-09-01T14:30:00Z",
  fresh: true,
  source: "TTC GTFS-RT",
  categories: [
    { category: "detour", label: "Detours", count: 1 },
    { category: "service-change", label: "Service Changes", count: 1 },
  ],
  notices: [
    {
      id: "notice-501",
      category: "detour",
      routeType: "streetcar",
      routeIds: ["501", "501A"],
      title: "501 Queen Streetcar Diversion",
      description: "Streetcars diverting around track reconstruction between Spadina and Bathurst.",
      location: "Queen St W from Spadina to Bathurst",
      stopIds: ["1001", "1002"],
      direction: "Eastbound / Westbound",
      cause: "Track Maintenance",
      updatedAt: "15 mins ago",
      source: "TTC GTFS-RT",
    },
  ],
};

const mockTripChangeData: RegionalTripChangeResponse = {
  generatedAt: "2026-09-01T14:30:00Z",
  fresh: true,
  source: "Metrolinx Open API",
  sourceUpdatedAt: "2026-09-01T14:28:00Z",
  totalCount: 1,
  changes: [
    {
      id: "tc-lw-101",
      kind: "cancellation",
      tripId: "trip-lw-101",
      tripNumber: "1234",
      lineId: "regional-lw",
      lineNumber: "LW",
      lineName: "Lakeshore West",
      destination: "Aldershot GO",
      serviceDate: "2026-09-01",
      scheduledStartAt: "2026-09-01T15:00:00Z",
      updatedAt: "2026-09-01T14:20:00Z",
      scheduleMatched: true,
      title: "3:00 PM Westbound Train Cancelled",
      description: "The 3:00 PM departure from Union to Aldershot is cancelled due to equipment inspection.",
      cause: "Equipment inspection",
      sourceSystems: ["metrolinx-exceptions", "gtfs-rt-tripupdates"],
      affectedStops: [
        { stationId: "union", stationName: "Union Station", kind: "cancellation" },
        { stationId: "exhibition", stationName: "Exhibition", kind: "cancellation" },
        { stationId: "mimico", stationName: "Mimico", kind: "cancellation" },
      ],
    },
  ],
};

describe("Service Notices & Regional Trip Changes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("validates schemas for surface notices and trip changes", () => {
    expect(surfaceNoticeResponseSchema.safeParse(mockSurfaceData).success).toBe(true);
    expect(regionalTripChangeResponseSchema.safeParse(mockTripChangeData).success).toBe(true);
  });

  it("renders surface notices in TTC mode with route badges and metadata", async () => {
    (useSurfaceNotices as jest.Mock).mockReturnValue({
      data: mockSurfaceData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
    (useRegionalTripChanges as jest.Mock).mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<NoticesScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Service Notices")).toBeTruthy();
    expect(screen.getByText("501 Queen Streetcar Diversion")).toBeTruthy();
    expect(screen.getByText("501")).toBeTruthy();
    expect(screen.getByText("DETOUR")).toBeTruthy();
    expect(screen.getByText("LOCATION:")).toBeTruthy();
    expect(screen.getByText("Queen St W from Spadina to Bathurst")).toBeTruthy();
    expect(screen.getByText("Track Maintenance")).toBeTruthy();
  });

  it("renders regional trip changes with schedule-matched status and affected stops", async () => {
    (useSurfaceNotices as jest.Mock).mockReturnValue({
      data: mockSurfaceData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
    (useRegionalTripChanges as jest.Mock).mockReturnValue({
      data: mockTripChangeData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<NoticesScreen />, { wrapper: Wrapper });

    // Switch to Regional
    await act(async () => {
      fireEvent.press(screen.getByTestId("network-regional"));
    });

    // Wait for Regional mode and switch to Trip Changes tab
    await waitFor(() => {
      expect(screen.getByTestId("subtab-trip-changes")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("subtab-trip-changes"));
    });

    await waitFor(() => {
      expect(screen.getByText("3:00 PM Westbound Train Cancelled")).toBeTruthy();
      expect(screen.getByText("CANCELLATION")).toBeTruthy();
      expect(screen.getByText("✓ SCHEDULE-MATCHED")).toBeTruthy();
      expect(screen.getByText("Towards Aldershot GO · Trip #1234")).toBeTruthy();
      expect(screen.getByText("Union Station → Exhibition → Mimico")).toBeTruthy();
    });
  });

  it("navigates back when back button is tapped", async () => {
    (useSurfaceNotices as jest.Mock).mockReturnValue({
      data: mockSurfaceData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });
    (useRegionalTripChanges as jest.Mock).mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<NoticesScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId("notices-back-button"));
    expect(router.back).toHaveBeenCalled();
  });
});
