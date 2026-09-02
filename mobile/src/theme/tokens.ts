export type ThemeMode = "dark" | "light" | "high-contrast";

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
  light: {
    ...shared,
    line: {
      suspension: "#dc2626",
      delay: "#d97706",
      rsz: "#d97706",
      planned: "#2563eb",
      normal: "#16a34a",
    },
    color: {
      background: "#f8fafc",
      surface: "#ffffff",
      surfacePanel: "rgba(255, 255, 255, 0.94)",
      surfaceRaised: "#f1f5f9",
      surfaceOverlay: "rgba(255, 255, 255, 0.98)",
      chrome: "#ffffff",
      border: "rgba(15, 23, 42, 0.12)",
      borderStrong: "rgba(15, 23, 42, 0.22)",
      text: "#0f172a",
      textMuted: "#475569",
      textQuiet: "#64748b",
      focus: "#0284c7",
      chromeGlow: "rgba(15, 23, 42, 0.08)",
    },
  },
  "high-contrast": {
    ...shared,
    line: {
      suspension: "#ff2a2a",
      delay: "#ffd400",
      rsz: "#ffd400",
      planned: "#4ab5ff",
      normal: "#28ff80",
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
      textQuiet: "#f0f0f0",
      focus: "#8dc7ff",
      chromeGlow: "#333333",
    },
  },
} as const;

export type Theme = (typeof themes)[ThemeMode];
export type ThemeLineColors = Theme["line"];

