"use client";

import { useEffect, useState } from "react";

import {
  getLocalRegionalRailPreviewDate,
  getRegionalRailOperatingState,
  type RegionalRailOperatingState,
} from "../app/regional-rail-hours";

const REGIONAL_RAIL_OPERATING_STATE_REFRESH_MS = 30_000;

export function useRegionalRailOperatingState(): RegionalRailOperatingState {
  const [state, setState] = useState(() => getRegionalRailOperatingState(new Date()));

  useEffect(() => {
    const refresh = () => setState(getRegionalRailOperatingState(getOperatingStateDate()));

    refresh();
    const timer = window.setInterval(refresh, REGIONAL_RAIL_OPERATING_STATE_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, []);

  return state;
}

function getOperatingStateDate() {
  if (typeof window === "undefined") {
    return new Date();
  }

  return getLocalRegionalRailPreviewDate(window.location.href) ?? new Date();
}
