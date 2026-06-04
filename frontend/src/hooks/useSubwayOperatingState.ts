"use client";

import { useEffect, useState } from "react";

import { getSubwayOperatingState, type SubwayOperatingState } from "../app/subway-hours";

const SUBWAY_OPERATING_STATE_REFRESH_MS = 30_000;

export function useSubwayOperatingState(): SubwayOperatingState {
  const [state, setState] = useState(() => getSubwayOperatingState());

  useEffect(() => {
    const refresh = () => setState(getSubwayOperatingState());

    refresh();
    const timer = window.setInterval(refresh, SUBWAY_OPERATING_STATE_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, []);

  return state;
}
