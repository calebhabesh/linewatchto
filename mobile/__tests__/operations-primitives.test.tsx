import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";
import { Text } from "react-native";

import { ThemeProvider } from "@/theme/theme-provider";
import { OperationsSheet } from "@/components/operations-sheet";
import { OperationsSheetHeader } from "@/components/operations-sheet-header";
import { OperationsSectionHeading } from "@/components/operations-section-heading";
import { OperationsCard } from "@/components/operations-card";
import { OperationsRow } from "@/components/operations-row";
import { SegmentedControl } from "@/components/segmented-control";
import { CountBadge } from "@/components/count-badge";
import { StatusChip } from "@/components/status-chip";
import { SourceLabel } from "@/components/source-label";
import { MetricPair } from "@/components/metric-pair";
import { IconButton } from "@/components/icon-button";
import { LocateIcon } from "@/components/operations-icons";

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("Operations Primitives", () => {
  afterEach(cleanup);

  it("renders all primitives in an operations surface", async () => {
    const handleClose = jest.fn();
    const handleBack = jest.fn();
    const handlePress = jest.fn();
    const handleChange = jest.fn();

    await render(
      <Wrapper>
        <OperationsSheet testID="test-sheet" variant="primary">
          <OperationsSheetHeader
            eyebrow="TTC NETWORK"
            title="Line 1"
            subtitle="Current status"
            onBack={handleBack}
            onClose={handleClose}
          />
          <OperationsSectionHeading title="Impacts" count={3} testID="heading-test" />
          <OperationsCard accentRailColor="#ff4545" onPress={handlePress} testID="test-card">
            <Text>Disruption</Text>
          </OperationsCard>
          <OperationsRow title="Settings" subtitle="Manage rules" onPress={handlePress} showChevron testID="test-row" />
          <SegmentedControl
            options={[
              { value: "ttc", label: "TTC" },
              { value: "regional", label: "GO & UP", badge: 2 },
            ]}
            value="ttc"
            onChange={handleChange}
            testID="network-seg"
          />
          <StatusChip label="SUSPENDED" kind="suspension" testID="susp-chip" />
          <SourceLabel label="Live updated" isLive testID="live-label" />
          <CountBadge count={5} testID="count-badge" />
          <MetricPair label="Reliability" value="99.4%" subvalue="Normal" testID="metric-test" />
          <IconButton accessibilityLabel="Center map" icon={<LocateIcon color="#ffffff" />} onPress={handlePress} testID="center-btn" />
        </OperationsSheet>
      </Wrapper>
    );

    expect(screen.getByTestId("test-sheet")).toBeTruthy();
    expect(screen.getByText("Line 1")).toBeTruthy();
    expect(screen.getByText("TTC NETWORK")).toBeTruthy();
    expect(screen.getByText("Current status")).toBeTruthy();
    expect(screen.getByTestId("heading-test")).toBeTruthy();
    expect(screen.getByText("Impacts")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByTestId("test-card")).toBeTruthy();
    expect(screen.getByText("Disruption")).toBeTruthy();
    expect(screen.getByTestId("test-row")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Manage rules")).toBeTruthy();
    expect(screen.getByTestId("network-seg")).toBeTruthy();
    expect(screen.getByText("TTC")).toBeTruthy();
    expect(screen.getByText("GO & UP")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByTestId("susp-chip")).toBeTruthy();
    expect(screen.getByText("SUSPENDED")).toBeTruthy();
    expect(screen.getByTestId("live-label")).toBeTruthy();
    expect(screen.getByText("Live updated")).toBeTruthy();
    expect(screen.getByTestId("count-badge")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByTestId("metric-test")).toBeTruthy();
    expect(screen.getByText("Reliability")).toBeTruthy();
    expect(screen.getByText("99.4%")).toBeTruthy();
    expect(screen.getByText("Normal")).toBeTruthy();

    fireEvent.press(screen.getByTestId("sheet-header-close"));
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId("sheet-header-back"));
    expect(handleBack).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId("network-seg-regional"));
    expect(handleChange).toHaveBeenCalledWith("regional");

    fireEvent.press(screen.getByTestId("center-btn"));
    expect(handlePress).toHaveBeenCalled();
  });
});
