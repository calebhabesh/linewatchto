import { describe, expect, it } from "@jest/globals";

import {
  formatSubwayClock,
  getRegionalRailOperatingState,
  getSubwayOperatingState,
  isRegionalRailClosed,
  isSubwayClosed,
} from "@/utils/operating-hours";

describe("Subway and Regional Operating Hours State", () => {
  it("formats minutes after midnight into 12-hour clock time", () => {
    expect(formatSubwayClock(6 * 60)).toBe("6:00 AM");
    expect(formatSubwayClock(14 * 60 + 30)).toBe("2:30 PM");
    expect(formatSubwayClock(2 * 60)).toBe("2:00 AM");
    expect(formatSubwayClock(0)).toBe("12:00 AM");
  });

  it("identifies midday as open subway hours", () => {
    // 2:00 PM on a Wednesday in Toronto
    const midday = new Date("2026-09-02T18:00:00Z"); // 14:00 EDT (UTC-4)
    const state = getSubwayOperatingState(midday);

    expect(state.status).toBe("open");
    expect(isSubwayClosed(midday)).toBe(false);
    expect(state.title).toBe("Subway operating");
  });

  it("identifies 3:30 AM as overnight closed subway hours", () => {
    // 3:30 AM on a Wednesday in Toronto
    const overnight = new Date("2026-09-02T07:30:00Z"); // 03:30 EDT (UTC-4)
    const state = getSubwayOperatingState(overnight);

    expect(state.status).toBe("closed");
    expect(isSubwayClosed(overnight)).toBe(true);
    expect(state.title).toBe("Subway closed overnight");
    expect(state.nextResumeTime).toBe("6:00 AM");
    expect(state.minutesUntilResume).toBe(150); // 3:30 to 6:00 is 150 minutes
  });

  it("uses 8:00 AM opening for Sunday schedule", () => {
    // 4:00 AM on Sunday in Toronto
    const sundayOvernight = new Date("2026-09-06T08:00:00Z"); // 04:00 EDT (Sunday)
    const state = getSubwayOperatingState(sundayOvernight);

    expect(state.status).toBe("closed");
    expect(state.isSundaySchedule).toBe(true);
    expect(state.nextResumeTime).toBe("8:00 AM");
  });

  it("calculates regional rail operating hours correctly", () => {
    // Midday Wednesday
    const midday = new Date("2026-09-02T18:00:00Z");
    const state = getRegionalRailOperatingState(midday);

    expect(state.status).toBe("open");
    expect(isRegionalRailClosed(midday)).toBe(false);

    // 3:00 AM weekday
    const overnight = new Date("2026-09-02T07:00:00Z"); // 03:00 EDT
    const overnightState = getRegionalRailOperatingState(overnight);

    expect(overnightState.status).toBe("closed");
    expect(isRegionalRailClosed(overnight)).toBe(true);
    expect(overnightState.nextResumeTime).toBe("4:55 AM");
  });
});
