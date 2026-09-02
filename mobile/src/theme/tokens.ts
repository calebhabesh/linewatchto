export type ThemeMode = "dark" | "high-contrast";

const shared = {
  radius: {
    small: 4,
    medium: 8,
    full: 9999,
  },
  spacing: {
    xsmall: 4,
    small: 8,
    medium: 12,
    large: 16,
    xlarge: 24,
  },
};

export const themes = {
  dark: {
    ...shared,
    line: {
      suspension: "#ff4545",
      delay: "#ff9f1c",
      rsz: "#f59e0b",
      planned: "#4aa3ff",
      normal: "#30d175",
    },
    color: {
      background: "#0d0808",
      surface: "#0a0c10",
      surfacePanel: "rgba(10, 12, 16, 0.94)",
      surfaceRaised: "#151821",
      surfaceOverlay: "rgba(10, 12, 16, 0.98)",
      chrome: "#0e1016",
      border: "rgba(255, 255, 255, 0.16)",
      borderStrong: "rgba(255, 255, 255, 0.26)",
      text: "#f7f8fb",
      textMuted: "#aab1bd",
      textQuiet: "#747d8c",
      focus: "#38bdf8",
      chromeGlow: "rgba(56, 189, 248, 0.16)",
    },
  },
  "high-contrast": {
    ...shared,
    line: {
      suspension: "#ff0000",
      delay: "#ffaa00",
      rsz: "#ffaa00",
      planned: "#38bdf8",
      normal: "#00ff66",
    },
    color: {
      background: "#000000",
      surface: "#000000",
      surfacePanel: "#000000",
      surfaceRaised: "#111111",
      surfaceOverlay: "#000000",
      chrome: "#000000",
      border: "#ffffff",
      borderStrong: "#ffffff",
      text: "#ffffff",
      textMuted: "#ffffff",
      textQuiet: "#e6e6e6",
      focus: "#8dc7ff",
      chromeGlow: "#333333",
    },
  },
} as const;

export type Theme = (typeof themes)[ThemeMode];
export type ThemeLineColors = Theme["line"];

