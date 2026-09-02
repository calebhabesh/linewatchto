import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";

import { useDashboard } from "@/api/dashboard";
import { MobileBottomNavBar } from "@/components/mobile-bottom-nav-bar";
import { NetworkProvider } from "@/state/network-provider";
import { ThemeProvider } from "@/theme/theme-provider";
import { mockTtcDashboard } from "./fixtures/mock-dashboards";

jest.mock("@/api/dashboard", () => ({
  useDashboard: jest.fn(),
}));

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <NetworkProvider>{children}</NetworkProvider>
    </ThemeProvider>
  );
}

describe("MobileBottomNavBar", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  const mockNavigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  } as any;

  const mockState = {
    index: 0,
    routes: [
      { key: "index-1", name: "index" },
      { key: "alerts-2", name: "alerts" },
      { key: "stations-3", name: "stations" },
      { key: "commutes-4", name: "commutes" },
      { key: "more-5", name: "more" },
    ],
  } as any;

  it("renders all 5 tabs, illuminated night sign glider, and active pill on Map tab", async () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: mockTtcDashboard,
    });

    await render(
      <MobileBottomNavBar
        descriptors={{} as any}
        insets={{ top: 0, right: 0, bottom: 20, left: 0 }}
        navigation={mockNavigation}
        state={mockState}
      />,
      { wrapper: Wrapper },
    );

    const navBar = screen.getByTestId("mobile-bottom-nav");
    expect(navBar).toBeTruthy();
    expect(navBar.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          left: 16,
          right: 16,
          height: 72,
          borderWidth: 0,
        }),
      ])
    );

    expect(screen.getByTestId("bottom-nav-glider")).toBeTruthy();
    expect(screen.getByText("Map")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Search")).toBeTruthy();
    expect(screen.getByText("Commutes")).toBeTruthy();
    expect(screen.getByText("More")).toBeTruthy();

    const mapTab = screen.getByTestId("tab-index");
    expect(mapTab.props.accessibilityState.selected).toBe(true);

    const statusTab = screen.getByTestId("tab-alerts");
    expect(statusTab.props.accessibilityState.selected).toBe(false);

    // Verify individual tabs do not paint their own rectangular background
    const navItemStyle = mapTab.props.style;
    expect(navItemStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          flex: 1,
          borderRadius: 999,
        }),
      ])
    );

    // Verify active Map label has white color
    const mapLabel = screen.getByText("Map");
    expect(mapLabel.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          color: "#ffffff",
        }),
      ])
    );

    // Verify status badge renders with disruption count
    expect(screen.getByTestId("tab-badge-alerts")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("handles navigation tab presses", async () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: mockTtcDashboard,
    });

    await render(
      <MobileBottomNavBar
        descriptors={{} as any}
        insets={{ top: 0, right: 0, bottom: 20, left: 0 }}
        navigation={mockNavigation}
        state={mockState}
      />,
      { wrapper: Wrapper },
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-alerts"));
    });
    expect(mockNavigation.navigate).toHaveBeenCalledWith("alerts", undefined);
  });

  it("renders high-contrast mode with solid white glider and black active text", async () => {
    await AsyncStorage.setItem("linewatch.theme-mode", "high-contrast");
    (useDashboard as jest.Mock).mockReturnValue({
      data: mockTtcDashboard,
    });

    await render(
      <MobileBottomNavBar
        descriptors={{} as any}
        insets={{ top: 0, right: 0, bottom: 20, left: 0 }}
        navigation={mockNavigation}
        state={mockState}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      const mapLabel = screen.getByText("Map");
      expect(mapLabel.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            color: "#000000",
          }),
        ])
      );
    });
  });
});
