"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentPropsWithRef, type ReactNode, type SyntheticEvent } from "react";
import { observeDesktopControlRail } from "../app/desktop-sidebar-state";
import type { NetworkId } from "../app/regional-data";
import { NetworkSwitchContext } from "./NetworkSelector";

const CAMERA_CONTROLS = ".map-control-recenter-container, .map-control-zoom-group";

type PublishRail = (network: NetworkId, rail: ReactNode | null) => void;
type RailContextValue = { publish: PublishRail; hasRail: (network: NetworkId) => boolean };
const RailContext = createContext<RailContextValue | null>(null);

/**
 * How a System Map ⇄ Map View switch (NetworkMap) treats the System Map's toolbar:
 * "held" on screen but out of use while the System Map waits to be replaced,
 * "hidden" while the System Map is prepared or the Map View fades in over it. A
 * hidden toolbar does not place itself, so it never contends with the Map View's
 * for the right-hand buttons' captions.
 */
export type SharedMapControlRailState = "shown" | "held" | "hidden";

/** Reconcile both maps' controls in one place so hover, focus and the toggle survive a swap. */
export function SharedMapControlRailProvider({ network, railState = "shown", children }: {
  network: NetworkId;
  railState?: SharedMapControlRailState;
  children: ReactNode;
}) {
  const railsRef = useRef<Partial<Record<NetworkId, ReactNode>>>({});
  const [rails, setRails] = useState<Partial<Record<NetworkId, ReactNode>>>({});
  const publish = useCallback<PublishRail>((id, rail) => {
    if (railsRef.current[id] === rail) return;
    const next = { ...railsRef.current, [id]: rail };
    railsRef.current = next;
    setRails(next);
  }, []);
  const hasRail = useCallback((id: NetworkId) => Boolean(railsRef.current[id]), []);
  const context = useMemo(() => ({ publish, hasRail }), [publish, hasRail]);
  // `display: contents` keeps the rail's layout parent while giving placement a handle on it.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const activeRail = rails[network];
  // During a network switch this is still the outgoing map's rail. Its Center
  // and zoom controls would move the map the rider is leaving, so they wait.
  const requestedNetwork = useContext(NetworkSwitchContext);
  const switching = requestedNetwork !== null && requestedNetwork !== network;
  const holdCameraControl = useCallback((event: SyntheticEvent) => {
    if (!switching || !(event.target instanceof Element) || !event.target.closest(CAMERA_CONTROLS)) return;
    event.preventDefault();
    event.stopPropagation();
  }, [switching]);
  // Observe the rail element, not each render's rail: every map render
  // publishes a new rail node, and re-subscribing read layout mid-commit.
  const observedRailRef = useRef<{ element: HTMLElement | null; stop: () => void } | null>(null);
  const placed = railState !== "hidden";
  const placedRail = placed ? activeRail : null;
  // Stops in the cleanup, before the Map View's toolbar places itself in the same commit.
  useLayoutEffect(() => {
    if (!placed) return;
    return () => {
      observedRailRef.current?.stop();
      observedRailRef.current = null;
    };
  }, [placed]);
  useLayoutEffect(() => {
    const element = placedRail ? anchorRef.current?.querySelector<HTMLElement>(".desktop-map-control-rail") ?? null : null;
    if (observedRailRef.current && observedRailRef.current.element === element) return;
    observedRailRef.current?.stop();
    observedRailRef.current = { element, stop: observeDesktopControlRail(element) };
  }, [placedRail]);
  useEffect(() => () => {
    observedRailRef.current?.stop();
    observedRailRef.current = null;
  }, []);
  return (
    <RailContext.Provider value={context}>
      {children}
      <span ref={anchorRef} style={{ display: "contents", visibility: railState === "hidden" ? "hidden" : undefined }}
        inert={railState !== "shown"} onClickCapture={holdCameraControl} onChangeCapture={holdCameraControl}>{activeRail}</span>
    </RailContext.Provider>
  );
}

export function SharedMapControlRail({ network, ...props }: ComponentPropsWithRef<"div"> & { network: NetworkId }) {
  const context = useContext(RailContext);
  const rail = useMemo(() => <div {...props} />, [props]);
  useLayoutEffect(() => {
    if (!context) return;
    context.publish(network, rail);
    return () => context.publish(network, null);
  }, [context, network, rail]);
  return context?.hasRail(network) ? null : rail;
}
