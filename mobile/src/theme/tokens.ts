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
      background: "#090b0e",
      surface: "#12161b",
      surfaceRaised: "#181e25",
      border: "#2b333d",
      text: "#f5f7fa",
      textMuted: "#aab3bd",
      focus: "#7cb8ff",
    },
  },
  "high-contrast": {
    ...shared,
    color: {
      background: "#000000",
      surface: "#080808",
      surfaceRaised: "#111111",
      border: "#ffffff",
      text: "#ffffff",
      textMuted: "#e6e6e6",
      focus: "#8dc7ff",
    },
  },
} as const;

export type Theme = (typeof themes)[ThemeMode];
