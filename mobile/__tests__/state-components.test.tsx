import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { ThemeProvider } from "@/theme/theme-provider";
import { themes } from "@/theme/tokens";

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("LoadingState component", () => {
  it("renders default message and accessible progressbar role", async () => {
    await render(<LoadingState />, { wrapper: Wrapper });
    expect(screen.getByText("Loading service status…")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
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
});

describe("ErrorState component", () => {
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
        title="Network Offline"
        message="Unable to contact transit gateway"
        hint="Check Wi-Fi or mobile data."
        tone="suspension"
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Network Offline")).toBeTruthy();
    expect(screen.getByText("Unable to contact transit gateway")).toBeTruthy();
    expect(screen.getByText("Check Wi-Fi or mobile data.")).toBeTruthy();
  });
});

describe("EmptyState component", () => {
  it("renders card variant with title and message", async () => {
    await render(
      <EmptyState
        title="No current impacts in this response"
        message="This does not override the source-state notice above."
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("summary")).toBeTruthy();
    expect(screen.getByText("No current impacts in this response")).toBeTruthy();
    expect(screen.getByText("This does not override the source-state notice above.")).toBeTruthy();
  });

  it("renders compact variant without card borders", async () => {
    await render(
      <EmptyState compact title="No planned closures in this response." message="Service running normally." />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("summary")).toBeTruthy();
    expect(screen.getByText("No planned closures in this response.")).toBeTruthy();
    expect(screen.getByText("Service running normally.")).toBeTruthy();
  });

  it("uses theme tokens conforming to the 8px or less radius constraint", () => {
    expect(themes.dark.radius.small).toBeLessThanOrEqual(8);
    expect(themes.dark.radius.medium).toBeLessThanOrEqual(8);
    expect(themes["high-contrast"].radius.small).toBeLessThanOrEqual(8);
    expect(themes["high-contrast"].radius.medium).toBeLessThanOrEqual(8);
  });
});
