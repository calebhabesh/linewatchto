import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";

import { OperationsSheetHeader } from "@/components/operations-sheet-header";
import { ThemeProvider } from "@/theme/theme-provider";

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("OperationsSheetHeader", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders drag handle, title, eyebrow, and subtitle with truncation", async () => {
    await render(
      <OperationsSheetHeader
        eyebrow="NETWORK OPERATIONS"
        subtitle="Live service disruptions and planned maintenance"
        title="Service Impacts"
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("operations-sheet-header-drag-handle")).toBeTruthy();
    expect(screen.getByText("NETWORK OPERATIONS")).toBeTruthy();
    expect(screen.getByText("Service Impacts")).toBeTruthy();
    expect(screen.getByText("Live service disruptions and planned maintenance")).toBeTruthy();

    const titleNode = screen.getByTestId("operations-sheet-header-title");
    expect(titleNode.props.numberOfLines).toBe(1);

    const subtitleNode = screen.getByTestId("operations-sheet-header-subtitle");
    expect(subtitleNode.props.numberOfLines).toBe(1);
  });

  it("can hide the drag handle when showDragHandle is false", async () => {
    await render(
      <OperationsSheetHeader
        showDragHandle={false}
        title="No Drag Handle"
      />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByTestId("operations-sheet-header-drag-handle")).toBeNull();
    expect(screen.getByText("No Drag Handle")).toBeTruthy();
  });

  it("calls onBack when back button is pressed", async () => {
    const handleBack = jest.fn();
    await render(
      <OperationsSheetHeader onBack={handleBack} title="Back Header" />,
      { wrapper: Wrapper },
    );

    fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close button is pressed", async () => {
    const handleClose = jest.fn();
    await render(
      <OperationsSheetHeader onClose={handleClose} title="Close Header" />,
      { wrapper: Wrapper },
    );

    fireEvent.press(screen.getByRole("button", { name: "Close sheet" }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("renders icon and rightAction slots alongside custom children", async () => {
    await render(
      <OperationsSheetHeader
        icon={<View testID="custom-icon"><Text>Icon</Text></View>}
        rightAction={<View testID="custom-badge"><Text>Live</Text></View>}
        title="Custom Slots Header"
      >
        <Text testID="custom-child">Filter Controls</Text>
      </OperationsSheetHeader>,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("custom-icon")).toBeTruthy();
    expect(screen.getByTestId("custom-badge")).toBeTruthy();
    expect(screen.getByTestId("custom-child")).toBeTruthy();
  });
});
