"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import type { NetworkId } from "../app/regional-data";

type PublishRail = (network: NetworkId, rail: ReactNode | null) => void;
type RailContextValue = { publish: PublishRail; hasRail: (network: NetworkId) => boolean };
const RailContext = createContext<RailContextValue | null>(null);

/** Reconcile both maps' controls in one place so hover, focus and the toggle survive a swap. */
export function SharedMapControlRailProvider({ network, children }: { network: NetworkId; children: ReactNode }) {
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
  return <RailContext.Provider value={context}>{children}{rails[network]}</RailContext.Provider>;
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
