import { render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React, { type PropsWithChildren } from "react";
import Svg from "react-native-svg";

import { AlertFilterBar } from "@/features/alerts/alert-filter-bar";
import { MapLineRail, MapStatusPeek, MapTopChrome } from "@/features/dashboard/map-dashboard-chrome";
import { SelectedImpactPreview } from "@/features/dashboard/selected-impact-preview";
import { NetworkSwitcher } from "@/components/network-switcher";
import { ProductHeader } from "@/components/product-header";
import { ImpactSelectionProvider } from "@/state/impact-selection-provider";
import { NetworkProvider } from "@/state/network-provider";
import { TrainMarkersProvider } from "@/state/train-markers-provider";
import { ThemeProvider } from "@/theme/theme-provider";
import { mockTtcDashboard } from "./fixtures/mock-dashboards";

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <TrainMarkersProvider>
          <ImpactSelectionProvider>{children}</ImpactSelectionProvider>
        </TrainMarkersProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}

describe("Compact-Device & Accessibility Audit (Slice 18)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Touch Targets (44dp minimum compliance)", () => {
    it("renders MapTopChrome buttons with 44dp touch targets and accessibility labels", async () => {
      await render(
        <MapTopChrome
          network="ttc"
          onNetworkChange={jest.fn()}
          onRefresh={jest.fn()}
          onToggleTrains={jest.fn()}
          refreshing={false}
          trainsEnabled={true}
        />,
        { wrapper: Wrapper },
      );

      const trainToggle = screen.getByTestId("toggle-trains-button");
      const themeToggle = screen.getByTestId("toggle-theme-button");
      const refreshBtn = screen.getByTestId("refresh-dashboard-button");

      expect(trainToggle).toBeTruthy();
      expect(themeToggle).toBeTruthy();
      expect(refreshBtn).toBeTruthy();

      expect(screen.getByLabelText("Hide estimated train markers")).toBeTruthy();
      expect(screen.getByLabelText("Enable high contrast")).toBeTruthy();
      expect(screen.getByLabelText("Refresh dashboard")).toBeTruthy();
    });

    it("renders NetworkSwitcher tabs with accessible tablist role and state", async () => {
      await render(<NetworkSwitcher onChange={jest.fn()} value="ttc" />, {
        wrapper: Wrapper,
      });

      const ttcTab = screen.getByTestId("network-ttc");
      const regTab = screen.getByTestId("network-regional");

      expect(ttcTab).toBeTruthy();
      expect(regTab).toBeTruthy();
      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(2);
    });

    it("renders AlertFilterBar chips with tab roles and touch accessibility", async () => {
      const filters = [
        { key: "all" as const, label: "All Impacts", count: 4 },
        { key: "delay" as const, label: "Delays", count: 2 },
      ];

      await render(
        <AlertFilterBar
          activeFilter="all"
          filters={filters}
          onSelectFilter={jest.fn()}
        />,
        { wrapper: Wrapper },
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(2);
      expect(screen.getByLabelText("All Impacts (4)")).toBeTruthy();
      expect(screen.getByLabelText("Delays (2)")).toBeTruthy();
    });
  });

  describe("Screen Reader and TalkBack Semantic Hierarchy", () => {
    it("renders ProductHeader with accessible header role", async () => {
      await render(
        <ProductHeader
          eyebrow="NETWORK OPERATIONS"
          title="Service impacts"
          subtitle="Dashboard disruptions"
        />,
        { wrapper: Wrapper },
      );

      expect(screen.getByRole("header")).toBeTruthy();
      expect(screen.getByText("Service impacts")).toBeTruthy();
    });

    it("renders MapLineRail with accessible line status labels", async () => {
      await render(<MapLineRail lines={mockTtcDashboard.status.lines} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByLabelText("Transit line status legend")).toBeTruthy();
      for (const line of mockTtcDashboard.status.lines) {
        expect(
          screen.getByLabelText(`${line.number}, ${line.name}: ${line.statusLabel}`),
        ).toBeTruthy();
      }
    });

    it("renders SelectedImpactPreview with summary role and dismiss action", async () => {
      const selection = {
        cardId: "alert-suspension-1",
        kind: "suspension" as const,
        label: "Line 1 Bloor-Yonge to King",
        sourceNetwork: "ttc" as const,
      };

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
      expect(screen.getByTestId("dismiss-impact-preview")).toBeTruthy();
      expect(screen.getByTestId("view-impact-details")).toBeTruthy();
      expect(screen.getByLabelText("Dismiss impact preview")).toBeTruthy();
      expect(screen.getByLabelText("View details")).toBeTruthy();
    });
  });

  describe("Compact Viewport & Text Scaling Resilience", () => {
    it("renders MapStatusPeek within compact margins and includes center map action", async () => {
      await render(
        <MapStatusPeek
          bottomOffset={80}
          cachedAt={Date.now()}
          dashboard={mockTtcDashboard}
          hasRefreshError={false}
          onCenterMap={jest.fn()}
          onOpenStatus={jest.fn()}
          showingCachedData={false}
          trainsCount={6}
          trainsEnabled={true}
          trainsOperating={true}
        />,
        { wrapper: Wrapper },
      );

      expect(screen.getByTestId("map-status-peek")).toBeTruthy();
      expect(screen.getByTestId("open-status-button")).toBeTruthy();
      expect(screen.getByTestId("center-map-button")).toBeTruthy();
      expect(screen.getByText("6 Est. Trains")).toBeTruthy();
    });
  });
});
