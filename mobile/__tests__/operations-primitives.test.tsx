import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";

import { ThemeProvider } from "@/theme/theme-provider";
import {
  CountBadge,
  IconButton,
  ImpactTypeIcon,
  MetricPair,
  OperationsCard,
  OperationsRow,
  OperationsSectionHeading,
  OperationsSheet,
  OperationsSheetHeader,
  SegmentedControl,
  SourceLabel,
  StatusChip,
} from "@/components/operations-primitives";
import { LocateIcon } from "@/components/operations-icons";

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("Operations Primitives", () => {
  it("renders all primitives in an operations surface and verifies interactions", async () => {
    const handleClose = jest.fn();
    const handleBack = jest.fn();
    const handlePress = jest.fn();
    const handleChange = jest.fn();

    await render(
      <OperationsSheet testID="test-sheet" variant="primary">
        <OperationsSheetHeader
          eyebrow="TTC NETWORK"
          title="Line 1"
          subtitle="Current status"
          onBack={handleBack}
          onClose={handleClose}
        />
        <OperationsSectionHeading title="Impacts" count={7} testID="heading-test" />
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
        <StatusChip label="Normal Service" kind="normal" testID="chip-normal" />
        <StatusChip label="Delays" kind="delay" testID="chip-delay" />
        <StatusChip label="RSZ Short" kind="rsz" testID="chip-rsz" />
        <StatusChip label="Reduced Speed Zone" kind="reduced-speed-zone" testID="chip-reduced-speed-zone" />
        <StatusChip label="Planned" kind="planned" testID="chip-planned" />
        <StatusChip label="Planned Closure" kind="planned-closure" testID="chip-planned-closure" />
        <SourceLabel label="Live updated" isLive testID="live-label" />
        <CountBadge count={5} testID="count-badge" />
        <CountBadge count={3} size="small" testID="badge-small" />
        <CountBadge count={12} size="medium" testID="badge-medium" />
        <MetricPair label="Reliability" value="99.4%" subvalue="Normal" testID="metric-test" />
        <View testID="icon-container">
          <ImpactTypeIcon kind="suspension" size={20} />
          <ImpactTypeIcon kind="delay" size={20} />
          <ImpactTypeIcon kind="reduced-speed-zone" size={20} />
          <ImpactTypeIcon kind="planned-closure" size={20} />
        </View>
        <IconButton accessibilityLabel="Center map" icon={<LocateIcon color="#ffffff" />} onPress={handlePress} testID="center-btn" />
      </OperationsSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("test-sheet")).toBeTruthy();
    expect(screen.getByText("Line 1")).toBeTruthy();
    expect(screen.getByText("TTC NETWORK")).toBeTruthy();
    expect(screen.getByText("Current status")).toBeTruthy();
    expect(screen.getByTestId("heading-test")).toBeTruthy();
    expect(screen.getByText("Impacts")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
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
    expect(screen.getByText("Normal Service")).toBeTruthy();
    expect(screen.getByText("Delays")).toBeTruthy();
    expect(screen.getByText("RSZ Short")).toBeTruthy();
    expect(screen.getByText("Reduced Speed Zone")).toBeTruthy();
    expect(screen.getByText("Planned")).toBeTruthy();
    expect(screen.getByText("Planned Closure")).toBeTruthy();
    expect(screen.getByTestId("live-label")).toBeTruthy();
    expect(screen.getByText("Live updated")).toBeTruthy();
    expect(screen.getByTestId("count-badge")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByTestId("metric-test")).toBeTruthy();
    expect(screen.getByText("Reliability")).toBeTruthy();
    expect(screen.getByText("99.4%")).toBeTruthy();
    expect(screen.getByText("Normal")).toBeTruthy();
    expect(screen.getByTestId("icon-container")).toBeTruthy();

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
