import { render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import React from "react";

import { getLineInfo, LineBadge, normalizeLineKey } from "@/components/line-badge";

describe("LineBadge & Line Config", () => {
  it("normalizes TTC and regional line keys correctly", () => {
    expect(normalizeLineKey("line-1")).toBe("line-1");
    expect(normalizeLineKey("1")).toBe("line-1");
    expect(normalizeLineKey("2")).toBe("line-2");
    expect(normalizeLineKey("regional-lw")).toBe("go-lw");
    expect(normalizeLineKey("go-lw")).toBe("go-lw");
    expect(normalizeLineKey("regional-up")).toBe("up-express");
    expect(normalizeLineKey("UP")).toBe("up-express");
  });

  it("resolves TTC subway lines with authored colors and short labels", () => {
    const line1 = getLineInfo("line-1");
    expect(line1.label).toBe("1");
    expect(line1.bg).toBe("#F8C300");
    expect(line1.text).toBe("#000000");

    const line2 = getLineInfo("line-2");
    expect(line2.label).toBe("2");
    expect(line2.bg).toBe("#00923F");
    expect(line2.text).toBe("#ffffff");
  });

  it("resolves GO and UP corridors with two-letter pills and brand colors", () => {
    const lakeshoreWest = getLineInfo("go-lw");
    expect(lakeshoreWest.label).toBe("LW");
    expect(lakeshoreWest.bg).toBe("#8B0A31");

    const upExpress = getLineInfo("up-express");
    expect(upExpress.label).toBe("UP");
    expect(upExpress.bg).toBe("#4084CD");
  });

  it("renders TTC line badge with accessible label", async () => {
    await render(<LineBadge lineId="line-1" />);

    expect(screen.getByTestId("line-badge-1")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("renders GO corridor badge with pill shape and accessible label", async () => {
    await render(<LineBadge lineId="go-lw" />);

    expect(screen.getByTestId("line-badge-lw")).toBeTruthy();
    expect(screen.getByText("LW")).toBeTruthy();
  });
});
