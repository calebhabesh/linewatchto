import { render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import React from "react";

import { RasterMapPlane } from "@/features/map/raster-map-plane";

describe("RasterMapPlane Component", () => {
  it("renders TTC dark background plane with expo-image Image", async () => {
    await render(
      <RasterMapPlane
        network="ttc"
        plane="background"
        testID="ttc-bg"
        theme="dark"
      />,
    );

    const image = screen.getByTestId("ttc-bg");
    expect(image).toBeTruthy();
    expect(image.props.accessibilityElementsHidden).toBe(undefined);
    expect(image.props.accessible).toBe(false);
  });

  it("renders Regional high-contrast labels plane", async () => {
    await render(
      <RasterMapPlane
        network="regional"
        plane="labels"
        testID="reg-labels"
        theme="high-contrast"
      />,
    );

    const image = screen.getByTestId("reg-labels");
    expect(image).toBeTruthy();
  });

  it("applies default pointerEvents none and contentFit contain", async () => {
    await render(
      <RasterMapPlane
        network="ttc"
        plane="foreground"
        testID="ttc-fg"
        theme="dark"
      />,
    );

    const image = screen.getByTestId("ttc-fg");
    expect(image.props.pointerEvents).toBe("none");
    expect(image.props.contentFit).toBe("contain");
    expect(image.props.priority).toBe("high");
  });
});
