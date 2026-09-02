import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";

import {
  SegmentedControl,
  type SegmentOption,
} from "@/components/segmented-control";
import { ThemeProvider } from "@/theme/theme-provider";

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("SegmentedControl Component Parity (A06)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const defaultOptions: SegmentOption[] = [
    { value: "all", label: "All" },
    { value: "ttc", label: "TTC", badge: 4 },
    { value: "regional", label: "GO & UP", badge: 1 },
  ];

  it("renders with radiogroup accessibility role and equal radio items", async () => {
    const handleChange = jest.fn();
    await render(
      <SegmentedControl
        onChange={handleChange}
        options={defaultOptions}
        testID="test-segmented"
        value="all"
      />,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      const container = screen.getByTestId("test-segmented");
      expect(container.props.accessibilityRole).toBe("radiogroup");
    });

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);

    expect(radios[0]?.props.accessibilityState.selected).toBe(true);
    expect(radios[1]?.props.accessibilityState.selected).toBe(false);
    expect(radios[2]?.props.accessibilityState.selected).toBe(false);
  });

  it("calls onChange when an unselected option is pressed", async () => {
    const handleChange = jest.fn();
    await render(
      <SegmentedControl
        onChange={handleChange}
        options={defaultOptions}
        testID="test-segmented"
        value="all"
      />,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByTestId("test-segmented-ttc")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("test-segmented-ttc"));
    });
    expect(handleChange).toHaveBeenCalledWith("ttc");

    await act(async () => {
      fireEvent.press(screen.getByTestId("test-segmented-regional"));
    });
    expect(handleChange).toHaveBeenCalledWith("regional");
  });

  it("renders TTC option with red tone styling and active badge", async () => {
    await render(
      <SegmentedControl
        onChange={jest.fn()}
        options={defaultOptions}
        testID="test-segmented"
        value="ttc"
      />,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      const ttcOption = screen.getByTestId("test-segmented-ttc");
      expect(ttcOption.props.accessibilityState.selected).toBe(true);
    });

    const ttcText = screen.getByText("TTC");
    expect(ttcText.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          color: "#fb7185",
          fontWeight: "900",
        }),
      ])
    );

    const badge = screen.getByTestId("test-segmented-ttc-badge");
    expect(badge).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(badge.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: "#ef4444",
        }),
      ])
    );
  });

  it("renders Regional option with emerald green tone styling and active badge", async () => {
    await render(
      <SegmentedControl
        onChange={jest.fn()}
        options={defaultOptions}
        testID="test-segmented"
        value="regional"
      />,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      const regOption = screen.getByTestId("test-segmented-regional");
      expect(regOption.props.accessibilityState.selected).toBe(true);
    });

    const regText = screen.getByText("GO & UP");
    expect(regText.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          color: "#34d399",
          fontWeight: "900",
        }),
      ])
    );

    const badge = screen.getByTestId("test-segmented-regional-badge");
    expect(badge).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(badge.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: "#10b981",
        }),
      ])
    );
  });

  it("supports commute leg tones: affected (amber) and clear (green)", async () => {
    const legOptions: SegmentOption[] = [
      { value: "outbound", label: "To Union", tone: "affected" },
      { value: "return", label: "To Finch", tone: "clear" },
    ];

    const { rerender } = await render(
      <SegmentedControl
        onChange={jest.fn()}
        options={legOptions}
        testID="leg-toggle"
        value="outbound"
      />,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText("To Union").props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            color: "#f59e0b",
            fontWeight: "900",
          }),
        ])
      );
    });

    rerender(
      <SegmentedControl
        onChange={jest.fn()}
        options={legOptions}
        testID="leg-toggle"
        value="return"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("To Finch").props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            color: "#34d399",
            fontWeight: "900",
          }),
        ])
      );
    });
  });

  it("renders high-contrast mode with solid borders and high contrast fills", async () => {
    await AsyncStorage.setItem("linewatch.theme-mode", "high-contrast");

    await render(
      <SegmentedControl
        onChange={jest.fn()}
        options={defaultOptions}
        testID="hc-segmented"
        value="ttc"
      />,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      const container = screen.getByTestId("hc-segmented");
      expect(container.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            backgroundColor: "#000000",
            borderColor: "#ffffff",
            borderWidth: 2,
          }),
        ])
      );
    });
  });

  it("renders light mode with light panel background and distinct tone colors", async () => {
    await AsyncStorage.setItem("linewatch.theme-mode", "light");

    await render(
      <SegmentedControl
        onChange={jest.fn()}
        options={defaultOptions}
        testID="light-segmented"
        value="ttc"
      />,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      const ttcText = screen.getByText("TTC");
      expect(ttcText.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            color: "#da291c",
            fontWeight: "900",
          }),
        ])
      );
    });
  });

  it("renders vertical and compact variants without error", async () => {
    const { rerender } = await render(
      <SegmentedControl
        onChange={jest.fn()}
        options={defaultOptions}
        testID="variant-segmented"
        value="all"
        vertical
      />,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByTestId("variant-segmented").props.accessibilityRole).toBe(
        "radiogroup"
      );
    });

    rerender(
      <SegmentedControl
        compact
        onChange={jest.fn()}
        options={defaultOptions}
        testID="variant-segmented"
        value="all"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("variant-segmented").props.accessibilityRole).toBe(
        "radiogroup"
      );
    });
  });
});
