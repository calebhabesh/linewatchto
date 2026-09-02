import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React, { type PropsWithChildren } from "react";

import {
  resolveImpactFromDashboard,
  SelectedImpactPreview,
} from "@/features/dashboard/selected-impact-preview";
import { ThemeProvider } from "@/theme/theme-provider";
import { mockTtcDashboard } from "./fixtures/mock-dashboards";

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("SelectedImpactPreview & resolveImpactFromDashboard", () => {
  it("resolves suspension from activeAlerts and renders preview card", async () => {
    const selection = {
      cardId: "alert-suspension-1",
      kind: "suspension" as const,
      label: "Union to King",
    };

    const resolved = resolveImpactFromDashboard(selection, mockTtcDashboard);
    expect(resolved).not.toBeNull();
    expect(resolved?.title).toBe("Line 1 Suspension");
    expect(resolved?.location).toBe("Union to King");
    expect(resolved?.shuttle).toBe(true);

    await render(
      <SelectedImpactPreview
        bottomOffset={100}
        dashboard={mockTtcDashboard}
        onDismiss={jest.fn()}
        onOpenDetails={jest.fn()}
        selection={selection}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("selected-impact-preview")).toBeTruthy();
    expect(screen.getByText("Line 1 Suspension")).toBeTruthy();
    expect(screen.getByText("Union to King")).toBeTruthy();
    expect(screen.getByText("ACTIVE ALERT")).toBeTruthy();
    expect(screen.getByText("Shuttle")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("handles dismiss action press", async () => {
    const onDismiss = jest.fn();
    const selection = {
      cardId: "alert-suspension-1",
      kind: "suspension" as const,
    };

    await render(
      <SelectedImpactPreview
        bottomOffset={100}
        dashboard={mockTtcDashboard}
        onDismiss={onDismiss}
        onOpenDetails={jest.fn()}
        selection={selection}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.press(screen.getByTestId("dismiss-impact-preview"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("handles view details action press", async () => {
    const onOpenDetails = jest.fn();
    const selection = {
      cardId: "alert-suspension-1",
      kind: "suspension" as const,
    };

    await render(
      <SelectedImpactPreview
        bottomOffset={100}
        dashboard={mockTtcDashboard}
        onDismiss={jest.fn()}
        onOpenDetails={onOpenDetails}
        selection={selection}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.press(screen.getByTestId("view-impact-details"));
    expect(onOpenDetails).toHaveBeenCalledWith(selection);
  });

  it("resolves delay from delays collection", async () => {
    const selection = {
      cardId: "delay-station-queen",
      kind: "delay" as const,
      label: "Queen (Elevator Outage)",
    };

    const resolved = resolveImpactFromDashboard(selection, mockTtcDashboard);
    expect(resolved).not.toBeNull();
    expect(resolved?.title).toBe("Queen Elevator Outage");
    expect(resolved?.location).toBe("Queen Station");

    await render(
      <SelectedImpactPreview
        bottomOffset={100}
        dashboard={mockTtcDashboard}
        onDismiss={jest.fn()}
        onOpenDetails={jest.fn()}
        selection={selection}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("selected-impact-preview")).toBeTruthy();
    expect(screen.getByText("Queen Elevator Outage")).toBeTruthy();
    expect(screen.getByText("SERVICE DELAY")).toBeTruthy();
  });

  it("resolves reduced speed zone from reducedSpeedZones collection", async () => {
    const selection = {
      cardId: "rsz-line-2-1",
      kind: "reduced-speed-zone" as const,
    };

    const resolved = resolveImpactFromDashboard(selection, mockTtcDashboard);
    expect(resolved).not.toBeNull();
    expect(resolved?.title).toBe("Line 2 Reduced Speed Zone");

    await render(
      <SelectedImpactPreview
        bottomOffset={100}
        dashboard={mockTtcDashboard}
        onDismiss={jest.fn()}
        onOpenDetails={jest.fn()}
        selection={selection}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("selected-impact-preview")).toBeTruthy();
    expect(screen.getByText("REDUCED SPEED ZONE")).toBeTruthy();
    expect(screen.getByText("Line 2 Reduced Speed Zone")).toBeTruthy();
  });

  it("returns null when impact is not found in dashboard", () => {
    const resolved = resolveImpactFromDashboard(
      { cardId: "nonexistent-id", kind: "delay" },
      mockTtcDashboard,
    );
    expect(resolved).toBeNull();
  });
});
