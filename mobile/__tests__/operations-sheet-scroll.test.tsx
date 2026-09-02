import { cleanup, render, screen } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";

import { OperationsSheetScroll } from "@/components/operations-sheet-scroll";
import { ThemeProvider } from "@/theme/theme-provider";

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("OperationsSheetScroll", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders children with keyboard dismissal and nested scroll enabled", async () => {
    await render(
      <OperationsSheetScroll testID="test-scroll">
        <Text>Scroll item 1</Text>
        <Text>Scroll item 2</Text>
      </OperationsSheetScroll>,
      { wrapper: Wrapper },
    );

    const scroll = screen.getByTestId("test-scroll");
    expect(scroll).toBeTruthy();
    expect(scroll.props.keyboardDismissMode).toBe("on-drag");
    expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    expect(scroll.props.showsVerticalScrollIndicator).toBe(true);

    expect(screen.getByText("Scroll item 1")).toBeTruthy();
    expect(screen.getByText("Scroll item 2")).toBeTruthy();
  });

  it("configures pull-to-refresh when onRefresh is supplied", async () => {
    const handleRefresh = jest.fn();

    await render(
      <OperationsSheetScroll
        onRefresh={handleRefresh}
        refreshing={false}
        testID="refreshable-scroll"
      >
        <Text>Refreshable content</Text>
      </OperationsSheetScroll>,
      { wrapper: Wrapper },
    );

    const scroll = screen.getByTestId("refreshable-scroll");
    expect(scroll.props.refreshControl).toBeDefined();
    expect(scroll.props.refreshControl.props.refreshing).toBe(false);
  });

  it("merges custom contentContainerStyle and preserves stickyHeaderIndices", async () => {
    await render(
      <OperationsSheetScroll
        contentContainerStyle={{ paddingHorizontal: 20 }}
        stickyHeaderIndices={[0]}
        testID="sticky-scroll"
      >
        <View><Text>Sticky Header</Text></View>
        <View><Text>Body</Text></View>
      </OperationsSheetScroll>,
      { wrapper: Wrapper },
    );

    const scroll = screen.getByTestId("sticky-scroll");
    expect(scroll.props.stickyHeaderIndices).toEqual([0]);
    expect(scroll.props.contentContainerStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paddingHorizontal: 20 }),
      ]),
    );
  });
});
