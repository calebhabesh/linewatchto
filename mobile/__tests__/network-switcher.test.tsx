import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";

import { NetworkSwitcher } from "@/components/network-switcher";
import { ThemeProvider } from "@/theme/theme-provider";

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("NetworkSwitcher Component Parity (A06)", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe("Compact Vertical Variant (Map Top Chrome)", () => {
    it("renders vertical tablist with 44dp width and TTC red frame border", async () => {
      await render(
        <NetworkSwitcher
          onChange={jest.fn()}
          testID="top-switcher"
          value="ttc"
          vertical
        />,
        { wrapper: Wrapper }
      );

      await waitFor(() => {
        const tablist = screen.getByTestId("top-switcher");
        expect(tablist.props.accessibilityRole).toBe("tablist");
        const flatStyle = StyleSheet.flatten(tablist.props.style);
        expect(flatStyle.width).toBe(44);
        expect(flatStyle.borderColor).toBe("rgba(239, 68, 68, 0.65)");
        expect(flatStyle.borderWidth).toBe(2);
      });

      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(2);

      const ttcTab = screen.getByTestId("network-ttc");
      const regTab = screen.getByTestId("network-regional");
      expect(ttcTab.props.accessibilityState.selected).toBe(true);
      expect(regTab.props.accessibilityState.selected).toBe(false);

      expect(screen.getByText("TTC")).toBeTruthy();
      expect(screen.getByText("GO/UP")).toBeTruthy();
    });

    it("switches to Regional green frame border and updates selection", async () => {
      const { rerender } = await render(
        <NetworkSwitcher
          onChange={jest.fn()}
          testID="top-switcher"
          value="ttc"
          vertical
        />,
        { wrapper: Wrapper }
      );

      await waitFor(() => {
        expect(screen.getByTestId("top-switcher")).toBeTruthy();
      });

      rerender(
        <NetworkSwitcher
          onChange={jest.fn()}
          testID="top-switcher"
          value="regional"
          vertical
        />
      );

      await waitFor(() => {
        const tablist = screen.getByTestId("top-switcher");
        expect(tablist.props.style).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              borderColor: "rgba(16, 185, 129, 0.65)",
              borderWidth: 2,
            }),
          ])
        );
        const regTab = screen.getByTestId("network-regional");
        expect(regTab.props.accessibilityState.selected).toBe(true);
      });
    });

    it("renders high-contrast mode with solid #ef4444 and #10b981 borders", async () => {
      await AsyncStorage.setItem("linewatch.theme-mode", "high-contrast");

      const { rerender } = await render(
        <NetworkSwitcher
          onChange={jest.fn()}
          testID="top-switcher"
          value="ttc"
          vertical
        />,
        { wrapper: Wrapper }
      );

      await waitFor(() => {
        const tablist = screen.getByTestId("top-switcher");
        expect(tablist.props.style).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              borderColor: "#ef4444",
              borderWidth: 2,
            }),
          ])
        );
      });

      rerender(
        <NetworkSwitcher
          onChange={jest.fn()}
          testID="top-switcher"
          value="regional"
          vertical
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("top-switcher").props.style).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              borderColor: "#10b981",
              borderWidth: 2,
            }),
          ])
        );
      });
    });

    it("calls onChange when an inactive tab is pressed", async () => {
      const handleChange = jest.fn();
      await render(
        <NetworkSwitcher
          onChange={handleChange}
          testID="top-switcher"
          value="ttc"
          vertical
        />,
        { wrapper: Wrapper }
      );

      await act(async () => {
        fireEvent.press(screen.getByTestId("network-regional"));
      });
      expect(handleChange).toHaveBeenCalledWith("regional");
    });
  });

  describe("Horizontal Variant (Header / Sheets)", () => {
    it("renders horizontal tablist with indicator dots and GO & UP label", async () => {
      await render(
        <NetworkSwitcher
          onChange={jest.fn()}
          testID="header-switcher"
          value="ttc"
        />,
        { wrapper: Wrapper }
      );

      await waitFor(() => {
        const tablist = screen.getByTestId("header-switcher");
        expect(tablist.props.accessibilityRole).toBe("tablist");
      });

      expect(screen.getByText("TTC")).toBeTruthy();
      expect(screen.getByText("GO & UP")).toBeTruthy();

      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(2);
      expect(tabs[0]?.props.accessibilityState.selected).toBe(true);
      expect(tabs[1]?.props.accessibilityState.selected).toBe(false);
    });

    it("switches network in horizontal mode on press", async () => {
      const handleChange = jest.fn();
      await render(
        <NetworkSwitcher
          onChange={handleChange}
          testID="header-switcher"
          value="ttc"
        />,
        { wrapper: Wrapper }
      );

      await act(async () => {
        fireEvent.press(screen.getByTestId("network-regional"));
      });
      expect(handleChange).toHaveBeenCalledWith("regional");
    });

    it("renders light mode in horizontal format correctly", async () => {
      await AsyncStorage.setItem("linewatch.theme-mode", "light");

      await render(
        <NetworkSwitcher
          onChange={jest.fn()}
          testID="light-switcher"
          value="regional"
        />,
        { wrapper: Wrapper }
      );

      await waitFor(() => {
        const tablist = screen.getByTestId("light-switcher");
        expect(tablist.props.style).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              backgroundColor: "rgba(241, 245, 249, 0.85)",
              borderColor: "rgba(16, 185, 129, 0.40)",
            }),
          ])
        );
      });
    });
  });
});
