import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";

import { useDashboard } from "@/api/dashboard";
import { OperationsSheet } from "@/components/operations-sheet";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import {
  OperationsShell,
  SHELL_ELEVATION,
  SHELL_LAYOUT,
  SHELL_Z_INDEX,
  ShellProvider,
  useShell,
} from "@/features/shell";
import { ImpactSelectionProvider } from "@/state/impact-selection-provider";
import { NetworkProvider } from "@/state/network-provider";
import { ThemeProvider } from "@/theme/theme-provider";
import { mockTtcDashboard } from "./fixtures/mock-dashboards";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
  },
}));

jest.mock("@/hooks/use-app-active", () => ({
  useAppActive: () => true,
}));

jest.mock("@/api/dashboard", () => ({
  useDashboard: jest.fn(),
}));

jest.mock("@/api/trains", () => ({
  useEstimatedTrains: jest.fn(() => ({
    data: { fresh: true, markers: [] },
    isPending: false,
    isError: false,
    error: null,
    isRefetching: false,
    refetch: jest.fn(),
  })),
}));

function TestTabSwitcher() {
  const { activeTab, setActiveTab, resetNonce, triggerMapReset } = useShell();
  return (
    <View testID="test-tab-switcher">
      <Text testID="current-tab-text">{activeTab}</Text>
      <Text testID="reset-nonce-text">{resetNonce}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setActiveTab("alerts")}
        testID="btn-status"
      >
        <Text>Switch to Status</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => setActiveTab("index")}
        testID="btn-map"
      >
        <Text>Switch to Map</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={triggerMapReset}
        testID="btn-reset"
      >
        <Text>Reset Map</Text>
      </Pressable>
    </View>
  );
}

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <ImpactSelectionProvider>
          <ShellProvider>{children}</ShellProvider>
        </ImpactSelectionProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}

describe("Persistent Operations Shell (B01)", () => {
  beforeEach(() => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: mockTtcDashboard,
      isPending: false,
      isError: false,
      error: null,
      isRefetching: false,
      dataUpdatedAt: Date.now(),
      isStale: false,
      refetch: jest.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("mounts the persistent schematic map layer at the shell level", async () => {
    await render(<OperationsShell />, { wrapper: Wrapper });

    expect(screen.getByTestId("operations-shell")).toBeTruthy();
    expect(screen.getByTestId("persistent-map-layer")).toBeTruthy();
    expect(screen.getByTestId("schematic-map-ttc")).toBeTruthy();
    expect(screen.getByTestId("map-top-chrome")).toBeTruthy();
    expect(screen.getByTestId("map-line-rail")).toBeTruthy();
  });

  it("renders MapStatusPeek when on the index (Map) tab and hides it when switching to alerts (Status) tab", async () => {
    await render(
      <View style={{ flex: 1 }}>
        <OperationsShell />
        <TestTabSwitcher />
      </View>,
      { wrapper: Wrapper },
    );

    // Initially on Map tab: MapStatusPeek is visible
    expect(screen.getByTestId("map-status-peek")).toBeTruthy();
    expect(screen.getByTestId("current-tab-text").props.children).toBe("index");

    // Switch to Alerts tab: Map remains mounted, but MapStatusPeek is hidden for tab sheet
    fireEvent.press(screen.getByTestId("btn-status"));
    await waitFor(() => {
      expect(screen.getByTestId("current-tab-text").props.children).toBe("alerts");
      expect(screen.queryByTestId("map-status-peek")).toBeNull();
    });
    // The persistent map layer remains mounted!
    expect(screen.getByTestId("persistent-map-layer")).toBeTruthy();
    expect(screen.getByTestId("schematic-map-ttc")).toBeTruthy();

    // Switch back to Map tab: MapStatusPeek reappears
    fireEvent.press(screen.getByTestId("btn-map"));
    await waitFor(() => {
      expect(screen.getByTestId("current-tab-text").props.children).toBe("index");
      expect(screen.getByTestId("map-status-peek")).toBeTruthy();
    });
  });

  it("increments resetNonce when map reset is triggered through shell", async () => {
    await render(
      <View style={{ flex: 1 }}>
        <OperationsShell />
        <TestTabSwitcher />
      </View>,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("reset-nonce-text").props.children).toBe(0);
    fireEvent.press(screen.getByTestId("btn-reset"));
    await waitFor(() => {
      expect(screen.getByTestId("reset-nonce-text").props.children).toBe(1);
    });
  });

  it("DashboardScreen delegates to shell when mounted in shell context", async () => {
    await render(<DashboardScreen />, { wrapper: Wrapper });

    // Since ShellProvider is in Wrapper, DashboardScreen delegates to persistent shell
    expect(screen.getByTestId("dashboard-tab-scene")).toBeTruthy();
  });

  it("conforms to SHELL_LAYOUT constants for 8dp radius and clearances", () => {
    expect(SHELL_LAYOUT.sheetCornerRadius).toBe(8);
    expect(SHELL_LAYOUT.sheetHorizontalInset).toBe(8);
    expect(SHELL_LAYOUT.sheetBorderWidth).toBe(1);
    expect(SHELL_LAYOUT.primarySheetMaxHeightPercent).toBe(0.78);
    expect(SHELL_LAYOUT.detailSheetInitialHeightPercent).toBe(0.64);
    expect(SHELL_LAYOUT.navBarHeight).toBe(72);
    expect(SHELL_LAYOUT.navBarHorizontalInset).toBe(16);
  });

  it("enforces strict layer order: map → mapOverlays → chrome → statusPeek → sheets → bottomNav → modal → systemUi", () => {
    expect(SHELL_Z_INDEX.map).toBeLessThan(SHELL_Z_INDEX.mapOverlays);
    expect(SHELL_Z_INDEX.mapOverlays).toBeLessThan(SHELL_Z_INDEX.chrome);
    expect(SHELL_Z_INDEX.chrome).toBeLessThan(SHELL_Z_INDEX.statusPeek);
    expect(SHELL_Z_INDEX.statusPeek).toBeLessThan(SHELL_Z_INDEX.sheets);
    expect(SHELL_Z_INDEX.sheets).toBeLessThan(SHELL_Z_INDEX.bottomNav);
    expect(SHELL_Z_INDEX.bottomNav).toBeLessThan(SHELL_Z_INDEX.modal);
    expect(SHELL_Z_INDEX.modal).toBeLessThan(SHELL_Z_INDEX.systemUi);
  });

  it("enforces matching Android elevation hierarchy", () => {
    expect(SHELL_ELEVATION.map).toBeLessThan(SHELL_ELEVATION.mapOverlays);
    expect(SHELL_ELEVATION.mapOverlays).toBeLessThan(SHELL_ELEVATION.chrome);
    expect(SHELL_ELEVATION.chrome).toBeLessThan(SHELL_ELEVATION.statusPeek);
    expect(SHELL_ELEVATION.statusPeek).toBeLessThan(SHELL_ELEVATION.sheets);
    expect(SHELL_ELEVATION.sheets).toBeLessThan(SHELL_ELEVATION.bottomNav);
    expect(SHELL_ELEVATION.bottomNav).toBeLessThan(SHELL_ELEVATION.modal);
    expect(SHELL_ELEVATION.modal).toBeLessThan(SHELL_ELEVATION.systemUi);
  });

  it("DashboardScreen sets pointerEvents to box-none in shell to allow map pan/zoom", async () => {
    await render(<DashboardScreen />, { wrapper: Wrapper });
    const tabScene = screen.getByTestId("dashboard-tab-scene");
    expect(tabScene.props.pointerEvents).toBe("box-none");
  });

  it("OperationsSheet adheres to SHELL_Z_INDEX for primary and modal variants", async () => {
    await render(
      <View>
        <OperationsSheet testID="test-primary-sheet">
          <Text>Primary Content</Text>
        </OperationsSheet>
        <OperationsSheet testID="test-modal-sheet" variant="modal">
          <Text>Modal Content</Text>
        </OperationsSheet>
      </View>,
      { wrapper: Wrapper },
    );

    const primarySheet = screen.getByTestId("test-primary-sheet");
    expect(primarySheet.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ zIndex: SHELL_Z_INDEX.sheets })]),
    );

    const modalSheet = screen.getByTestId("test-modal-sheet");
    expect(modalSheet.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ zIndex: SHELL_Z_INDEX.modal })]),
    );
  });

  it("OperationsSheet renders dismiss backdrop and fires onDismiss when tapped", async () => {
    const handleDismiss = jest.fn();
    await render(
      <OperationsSheet onDismiss={handleDismiss} testID="dismissible-sheet">
        <Text>Dismissible</Text>
      </OperationsSheet>,
      { wrapper: Wrapper },
    );

    const sheet = screen.getByTestId("dismissible-sheet");
    expect(sheet).toBeTruthy();
    const backdrop = screen.getByTestId("dismissible-sheet-backdrop");
    expect(backdrop).toBeTruthy();
    fireEvent.press(backdrop);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it("OperationsSheet supports detail variant with 64% initial snap height", async () => {
    await render(
      <OperationsSheet testID="test-detail-sheet" variant="detail">
        <Text>Detail</Text>
      </OperationsSheet>,
      { wrapper: Wrapper },
    );

    const sheet = screen.getByTestId("test-detail-sheet");
    expect(sheet.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ height: "64%", maxHeight: "78%" }),
        expect.objectContaining({ zIndex: SHELL_Z_INDEX.sheets }),
      ]),
    );
  });

  it("OperationsSheet supports tool variant with 88% height and elevated zIndex", async () => {
    await render(
      <OperationsSheet testID="test-tool-sheet" variant="tool">
        <Text>Tool</Text>
      </OperationsSheet>,
      { wrapper: Wrapper },
    );

    const sheet = screen.getByTestId("test-tool-sheet");
    expect(sheet.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ maxHeight: "88%" }),
        expect.objectContaining({ zIndex: SHELL_Z_INDEX.sheets + 2 }),
      ]),
    );
  });

  it("OperationsSheet registers Android hardwareBackPress handler that invokes onDismiss", async () => {
    const handleDismiss = jest.fn();
    const spy = jest.spyOn(BackHandler, "addEventListener");

    await render(
      <OperationsSheet onDismiss={handleDismiss} testID="test-back-handler">
        <Text>Back</Text>
      </OperationsSheet>,
      { wrapper: Wrapper },
    );

    expect(spy).toHaveBeenCalledWith("hardwareBackPress", expect.any(Function));

    // Simulate hardware back press invocation
    const registeredHandler = spy.mock.calls.find((call) => call[0] === "hardwareBackPress")?.[1];
    expect(registeredHandler).toBeDefined();
    const handled = registeredHandler!({} as never);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
    expect(handled).toBe(true);

    spy.mockRestore();
  });
});
