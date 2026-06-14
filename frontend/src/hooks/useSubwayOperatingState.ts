"use client";

import { useEffect, useState } from "react";

import {
  getLocalSubwayPreviewDate,
  getSubwayOperatingState,
  type SubwayOperatingState,
} from "../app/subway-hours";

const SUBWAY_OPERATING_STATE_REFRESH_MS = 30_000;

export function useSubwayOperatingState(): SubwayOperatingState {
  const [state, setState] = useState(() => getSubwayOperatingState(new Date()));

  useEffect(() => {
    const refresh = () => setState(getSubwayOperatingState(getOperatingStateDate()));

    refresh();
    const timer = window.setInterval(refresh, SUBWAY_OPERATING_STATE_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, []);

  return state;
}

function getOperatingStateDate() {
  if (typeof window === "undefined") {
    return new Date();
  }

  return getLocalSubwayPreviewDate(window.location.href) ?? new Date();
}
