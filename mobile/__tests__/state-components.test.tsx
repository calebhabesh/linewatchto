import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";
import { Text } from "react-native";

import { DataStateBanner } from "@/components/data-state-banner";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { ThemeProvider } from "@/theme/theme-provider";
import { themes } from "@/theme/tokens";
import { mockTtcDashboard } from "./fixtures/mock-dashboards";

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("LoadingState component", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("renders default message and accessible progressbar role", async () => {
    await render(<LoadingState />, { wrapper: Wrapper });
    expect(screen.getByText("Loading service status…")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByTestId("loading-state")).toBeTruthy();
  });

  it("renders custom message and respects compact mode", async () => {
    await render(
      <LoadingState compact message="Loading stations…" accessibilityLabel="Fetching station list" />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("Loading stations…")).toBeTruthy();
    expect(screen.getByLabelText("Fetching station list")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("renders with high-contrast text color in high-contrast mode", async () => {
    await AsyncStorage.setItem("linewatch.theme-mode", "high-contrast");
    await render(<LoadingState message="High contrast loading…" />, { wrapper: Wrapper });

    await waitFor(() => {
      const msg = screen.getByText("High contrast loading…");
      expect(msg.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: "#ffffff" })]),
      );
    });
  });
});

describe("ErrorState component", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("renders default source-honesty title and disclaimer hint", async () => {
    await render(<ErrorState message="Connection timed out" />, { wrapper: Wrapper });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Service data unavailable")).toBeTruthy();
    expect(screen.getByText("Connection timed out")).toBeTruthy();
    expect(
      screen.getByText("Pull down to retry. Mobile release builds do not substitute demo fixtures."),
    ).toBeTruthy();
  });

  it("triggers onRetry callback when retry button is pressed", async () => {
    const handleRetry = jest.fn();
    await render(<ErrorState message="API unreachable" onRetry={handleRetry} />, { wrapper: Wrapper });

    const retryButton = screen.getByRole("button", { name: "Retry request" });
    expect(retryButton).toBeTruthy();

    fireEvent.press(retryButton);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("renders custom title, message, and hint with suspension tone", async () => {
    await render(
      <ErrorState
        hint="Check Wi-Fi or mobile data."
        message="Unable to contact transit gateway"
        title="Network Offline"
        tone="suspension"
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Network Offline")).toBeTruthy();
    expect(screen.getByText("Unable to contact transit gateway")).toBeTruthy();
    expect(screen.getByText("Check Wi-Fi or mobile data.")).toBeTruthy();
  });

  it("renders transit accent strip when showAccentStrip is true", async () => {
    await render(
      <ErrorState
        message="Server temporarily down"
        showAccentStrip
        title="Ingestion Offline"
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId("error-state")).toBeTruthy();
    expect(screen.getByText("Ingestion Offline")).toBeTruthy();
  });

  it("adapts to high-contrast theme", async () => {
    await AsyncStorage.setItem("linewatch.theme-mode", "high-contrast");
    await render(
      <ErrorState
        message="High contrast error message"
        onRetry={jest.fn()}
        title="High Contrast Error"
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      const title = screen.getByText("High Contrast Error");
      expect(title.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: "#ffffff" })]),
      );
    });
  });
});

describe("EmptyState component", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("renders card variant with title and message", async () => {
    await render(
      <EmptyState
        message="This does not override the source-state notice above."
        title="No current impacts in this response"
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("summary")).toBeTruthy();
    expect(screen.getByText("No current impacts in this response")).toBeTruthy();
    expect(screen.getByText("This does not override the source-state notice above.")).toBeTruthy();
  });

  it("renders compact variant without card borders", async () => {
    await render(
      <EmptyState compact message="Service running normally." title="No planned closures in this response." />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("summary")).toBeTruthy();
    expect(screen.getByText("No planned closures in this response.")).toBeTruthy();
    expect(screen.getByText("Service running normally.")).toBeTruthy();
  });

  it("renders optional icon in empty state", async () => {
    await render(
      <EmptyState
        icon={<Text testID="test-icon">✓</Text>}
        title="All clear"
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId("test-icon")).toBeTruthy();
    expect(screen.getByText("All clear")).toBeTruthy();
  });

  it("uses theme tokens conforming to the 8px or less radius constraint", () => {
    expect(themes.dark.radius.small).toBeLessThanOrEqual(8);
    expect(themes.dark.radius.medium).toBeLessThanOrEqual(8);
    expect(themes["high-contrast"].radius.small).toBeLessThanOrEqual(8);
    expect(themes["high-contrast"].radius.medium).toBeLessThanOrEqual(8);
  });
});

describe("DataStateBanner component", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("renders fresh source data banner when live", async () => {
    await render(
      <DataStateBanner
        cachedAt={Date.now()}
        dashboard={mockTtcDashboard}
        hasRefreshError={false}
        showingCachedData={false}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId("data-state-banner")).toBeTruthy();
    expect(screen.getByText("Fresh source data")).toBeTruthy();
    expect(screen.getByText(mockTtcDashboard.message)).toBeTruthy();
  });

  it("renders cached data banner with timestamp and refresh pending info", async () => {
    const fixedTime = new Date("2026-09-02T10:30:00Z").getTime();
    await render(
      <DataStateBanner
        cachedAt={fixedTime}
        dashboard={mockTtcDashboard}
        hasRefreshError={false}
        showingCachedData
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("Showing cached data")).toBeTruthy();
    expect(screen.getByText(/Refresh pending\. Cached/)).toBeTruthy();
  });

  it("renders cached data banner with refresh failed info", async () => {
    const fixedTime = new Date("2026-09-02T10:30:00Z").getTime();
    await render(
      <DataStateBanner
        cachedAt={fixedTime}
        dashboard={mockTtcDashboard}
        hasRefreshError
        showingCachedData
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("Showing cached data")).toBeTruthy();
    expect(screen.getByText(/Refresh failed\. Cached/)).toBeTruthy();
  });

  it("renders non-live banner when source is not live", async () => {
    const nonLiveDashboard = {
      ...mockTtcDashboard,
      status: {
        ...mockTtcDashboard.status,
        generatedAt: {
          ...mockTtcDashboard.status.generatedAt,
          live: false,
        },
      },
    };

    await render(
      <DataStateBanner
        cachedAt={Date.now()}
        dashboard={nonLiveDashboard}
        hasRefreshError={false}
        showingCachedData={false}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("Source is not live")).toBeTruthy();
  });
});
