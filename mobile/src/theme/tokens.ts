export type ThemeMode = "dark" | "high-contrast";

const shared = {
  radius: {
    small: 4,
    medium: 8,
  },
  spacing: {
    xsmall: 4,
    small: 8,
    medium: 12,
    large: 16,
    xlarge: 24,
  },
  line: {
    suspension: "#e53935",
    delay: "#f57c00",
    planned: "#2f80ed",
    normal: "#20b26b",
  },
};

export const themes = {
  dark: {
    ...shared,
    color: {
      background: "#080506",
      surface: "#0d1117",
      surfaceRaised: "#171c24",
      surfaceOverlay: "rgba(10, 13, 18, 0.96)",
      border: "#272e38",
      borderStrong: "#3a444f",
      text: "#f7f8fa",
      textMuted: "#adb5c1",
      textQuiet: "#737d8b",
      focus: "#62b9ee",
      chromeGlow: "rgba(56, 189, 248, 0.16)",
    },
  },
  "high-contrast": {
    ...shared,
    color: {
      background: "#000000",
      surface: "#080808",
      surfaceRaised: "#111111",
      surfaceOverlay: "#000000",
      border: "#ffffff",
      borderStrong: "#ffffff",
      text: "#ffffff",
      textMuted: "#e6e6e6",
      textQuiet: "#ffffff",
      focus: "#8dc7ff",
      chromeGlow: "#262626",
    },
  },
} as const;

export type Theme = (typeof themes)[ThemeMode];
