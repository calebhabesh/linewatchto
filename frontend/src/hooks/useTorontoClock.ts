"use client";

import { useEffect, useState } from "react";

export function formatTorontoClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZoneName: "short",
    timeZone: "America/Toronto",
  }).formatToParts(date);

  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "";
  
  const ampm = getPart("dayPeriod").replace(/\./g, "").toUpperCase();
  const timeStr = `${getPart("hour")}:${getPart("minute")} ${ampm}`;
  const dateStr = `${getPart("weekday")}, ${getPart("month")} ${getPart("day")}, ${getPart("year")}`;
  const zoneStr = getPart("timeZoneName").toUpperCase();

  return { time: timeStr, date: dateStr, zone: zoneStr };
}

export function useTorontoClock(initialTime: string) {
  const sanitizedInitialTime = (initialTime || "").replace(/\./g, "");
  const [clock, setClock] = useState({ time: sanitizedInitialTime, date: "", zone: "" });

  useEffect(() => {
    const update = () => setClock(formatTorontoClock(new Date()));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return clock;
}
