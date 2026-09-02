import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import type { PropsWithChildren } from "react";

import { AlertCard } from "@/components/alert-card";
import { AlertFilterBar } from "@/features/alerts/alert-filter-bar";
import type { FilterOption } from "@/features/alerts/impact-types";
import { ThemeProvider } from "@/theme/theme-provider";

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("AlertFilterBar", () => {
  const mockFilters: FilterOption[] = [
    { key: "all", label: "All", count: 5 },
    { key: "suspension", label: "Suspensions", count: 2 },
    { key: "delay", label: "Delays", count: 3 },
  ];

  it("renders all filter options with counts and handles selection", async () => {
    const handleSelect = jest.fn();

    await render(
      <AlertFilterBar
        filters={mockFilters}
        activeFilter="all"
        onSelectFilter={handleSelect}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("Suspensions")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Delays")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();

    fireEvent.press(screen.getByText("Suspensions"));
    expect(handleSelect).toHaveBeenCalledWith("suspension");
  });
});

describe("AlertCard", () => {
  it("renders card content and handles press callback", async () => {
    const handlePress = jest.fn();

    await render(
      <AlertCard
        lineColor="#f8c300"
        lineNumber="1"
        location="Bloor-Yonge to Eglinton"
        source="TTC Live Alerts"
        title="No service between Bloor and Eglinton"
        tone="suspension"
        onPress={handlePress}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("No service between Bloor and Eglinton")).toBeTruthy();
    expect(screen.getByText("Bloor-Yonge to Eglinton")).toBeTruthy();
    expect(screen.getByText("Source: TTC Live Alerts")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();

    fireEvent.press(screen.getByRole("button"));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });
});
