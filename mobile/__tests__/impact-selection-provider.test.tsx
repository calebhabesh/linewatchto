import { act, renderHook } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React, { type PropsWithChildren } from "react";

import {
  ImpactSelectionProvider,
  useImpactSelection,
} from "@/state/impact-selection-provider";
import { NetworkProvider, useNetwork } from "@/state/network-provider";
import { ThemeProvider } from "@/theme/theme-provider";

function Wrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <ImpactSelectionProvider>{children}</ImpactSelectionProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}

describe("ImpactSelectionProvider & useImpactSelection", () => {
  it("initializes with null selection and isSelected returning false", async () => {
    const { result } = await renderHook(() => useImpactSelection(), { wrapper: Wrapper });

    expect(result.current.selection).toBeNull();
    expect(result.current.isSelected("alert-1")).toBe(false);
  });

  it("updates selection with setSelection and reflects in isSelected", async () => {
    const { result } = await renderHook(() => useImpactSelection(), { wrapper: Wrapper });

    await act(async () => {
      result.current.setSelection({
        cardId: "alert-123",
        kind: "suspension",
        label: "Union to King",
        segmentId: "line-1-union-king",
        sourceNetwork: "ttc",
      });
    });

    expect(result.current.selection).toEqual({
      cardId: "alert-123",
      kind: "suspension",
      label: "Union to King",
      segmentId: "line-1-union-king",
      sourceNetwork: "ttc",
    });
    expect(result.current.isSelected("alert-123")).toBe(true);
    expect(result.current.isSelected("alert-456")).toBe(false);
  });

  it("clears selection when clearSelection is called", async () => {
    const { result } = await renderHook(() => useImpactSelection(), { wrapper: Wrapper });

    await act(async () => {
      result.current.setSelection({
        cardId: "delay-456",
        kind: "delay",
        label: "St Clair",
      });
    });
    expect(result.current.selection).not.toBeNull();

    await act(async () => {
      result.current.clearSelection();
    });
    expect(result.current.selection).toBeNull();
    expect(result.current.isSelected("delay-456")).toBe(false);
  });

  it("automatically clears selection when the active network changes", async () => {
    const { result } = await renderHook(
      () => ({
        selection: useImpactSelection(),
        network: useNetwork(),
      }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      result.current.selection.setSelection({
        cardId: "rsz-789",
        kind: "reduced-speed-zone",
        label: "Line 1 Bloor",
      });
    });
    expect(result.current.selection.selection).not.toBeNull();

    await act(async () => {
      result.current.network.setNetwork("regional");
    });

    expect(result.current.selection.selection).toBeNull();
  });

  it("throws an error when useImpactSelection is used outside ImpactSelectionProvider", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(renderHook(() => useImpactSelection())).rejects.toThrow(
      "useImpactSelection must be used within an ImpactSelectionProvider",
    );
    spy.mockRestore();
  });
});
