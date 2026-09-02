import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";

import { useLineReliability } from "@/api/reliability";
import type { ReliabilityResponse } from "@/api/reliability-schema";
import { reliabilityResponseSchema } from "@/api/reliability-schema";
import { ReliabilityScreen } from "@/features/reliability/reliability-screen";
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

jest.mock("@/api/reliability", () => {
  const actual = jest.requireActual<Record<string, unknown>>("@/api/reliability");
  return {
    ...actual,
    useLineReliability: jest.fn(),
  };
});

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <NetworkProvider>{children}</NetworkProvider>
    </ThemeProvider>
  );
}

const mockTtcReliabilityData: ReliabilityResponse = {
  networkId: "ttc",
  period: "30d",
  since: "2026-08-01T00:00:00Z",
  until: "2026-08-31T23:59:59Z",
  source: "TTC Alert Lifecycles",
  observedDays: 30,
  observationMinutes: 43200,
  coveragePercentage: 99.4,
  confidence: "high",
  coverageLabel: "99.4% polling coverage",
  serviceWindowBasis: "GTFS Rapid Transit Daily Service Spans",
  scheduleBacked: true,
  scheduleCoveragePercentage: 100.0,
  message: "Derived from retained alert lifecycles and GTFS scheduled service spans.",
  metrics: [
    {
      id: "line-1",
      number: "1",
      label: "Yonge-University",
      incidents: 42,
      activeIncidents: 1,
      medianDurationMinutes: 18,
      serviceImpactMinutes: 540,
      observedServiceMinutes: 36000,
      incidentDisruptionMinutes: 620,
      serviceImpactPercentage: 1.5,
      confidence: "high",
    },
  ],
  breakdown: [
    {
      impactKind: "delay",
      label: "Delays",
      incidents: 30,
      incidentDisruptionMinutes: 450,
      percentage: 71.4,
    },
    {
      impactKind: "suspension",
      label: "Suspensions",
      incidents: 12,
      incidentDisruptionMinutes: 170,
      percentage: 28.6,
    },
  ],
  trainCancellations: null,
};

const mockRegionalReliabilityData: ReliabilityResponse = {
  networkId: "regional",
  period: "30d",
  since: "2026-08-01T00:00:00Z",
  until: "2026-08-31T23:59:59Z",
  source: "Metrolinx Alert Lifecycles",
  observedDays: 30,
  observationMinutes: 43200,
  coveragePercentage: 98.2,
  confidence: "medium",
  coverageLabel: "98.2% polling coverage",
  serviceWindowBasis: "Metrolinx Rail Timetables",
  scheduleBacked: true,
  scheduleCoveragePercentage: 96.5,
  message: "Derived from Metrolinx disruption events and train cancellations.",
  metrics: [
    {
      id: "regional-lw",
      number: "LW",
      label: "Lakeshore West",
      incidents: 15,
      activeIncidents: 0,
      medianDurationMinutes: 22,
      serviceImpactMinutes: 310,
      observedServiceMinutes: 30000,
      incidentDisruptionMinutes: 350,
      serviceImpactPercentage: 1.0,
      confidence: "medium",
    },
  ],
  breakdown: [
    {
      impactKind: "delay",
      label: "Delays",
      incidents: 15,
      incidentDisruptionMinutes: 350,
      percentage: 100.0,
    },
  ],
  trainCancellations: {
    cancellations: 8,
    scheduleMatchedCancellations: 7,
    sourceLabeledCancellations: 1,
    observationMinutes: 43200,
    coveragePercentage: 98.2,
    confidence: "medium",
    message: "Structured GO cancellations matched against static GTFS timetable trips.",
    corridors: [
      {
        id: "regional-lw",
        number: "LW",
        label: "Lakeshore West",
        cancellations: 5,
        scheduleMatchedCancellations: 5,
      },
    ],
  },
};

describe("Reliability Summaries Feature", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("validates reliability response schemas", () => {
    expect(reliabilityResponseSchema.safeParse(mockTtcReliabilityData).success).toBe(true);
    expect(reliabilityResponseSchema.safeParse(mockRegionalReliabilityData).success).toBe(true);
  });

  it("renders TTC reliability metrics, overview banner, and disruption breakdown", async () => {
    (useLineReliability as jest.Mock).mockReturnValue({
      data: mockTtcReliabilityData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<ReliabilityScreen />, { wrapper: Wrapper });

    expect(screen.getByText("Reliability Summaries")).toBeTruthy();
    expect(screen.getByText("30D Observation Window")).toBeTruthy();
    expect(screen.getByText("30 days observed · 99.4% polling coverage")).toBeTruthy();
    expect(screen.getAllByText("HIGH").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Yonge-University")).toBeTruthy();
    expect(screen.getByText("42 total incidents")).toBeTruthy();
    expect(screen.getByText("18m")).toBeTruthy();
    expect(screen.getByText("9.0h")).toBeTruthy();
    expect(screen.getByText("1.5%")).toBeTruthy();
    expect(screen.getByText("Disruption Breakdown")).toBeTruthy();
    expect(screen.getByText("Delays")).toBeTruthy();
  });

  it("renders regional reliability metrics with train cancellations block", async () => {
    (useLineReliability as jest.Mock).mockReturnValue({
      data: mockRegionalReliabilityData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<ReliabilityScreen />, { wrapper: Wrapper });

    await act(async () => {
      fireEvent.press(screen.getByTestId("network-regional"));
    });

    await waitFor(() => {
      expect(screen.getByText("Regional Corridors")).toBeTruthy();
      expect(screen.getByText("Lakeshore West")).toBeTruthy();
      expect(screen.getByText("Train Cancellations")).toBeTruthy();
      expect(screen.getByText("TOTAL CANCELLED")).toBeTruthy();
      expect(screen.getByText("SCHEDULE-MATCHED")).toBeTruthy();
    });
  });

  it("navigates back when back button is tapped", async () => {
    (useLineReliability as jest.Mock).mockReturnValue({
      data: mockTtcReliabilityData,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    await render(<ReliabilityScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId("reliability-back-button"));
    expect(router.back).toHaveBeenCalled();
  });
});
