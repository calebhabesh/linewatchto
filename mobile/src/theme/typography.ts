import { type TextStyle } from "react-native";

export const fontFamilies = {
  sans: {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semiBold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
    extraBold: "Inter_800ExtraBold",
    black: "Inter_900Black",
  },
  mono: {
    regular: "JetBrainsMono_400Regular",
    medium: "JetBrainsMono_500Medium",
    semiBold: "JetBrainsMono_600SemiBold",
    bold: "JetBrainsMono_700Bold",
    extraBold: "JetBrainsMono_800ExtraBold",
  },
} as const;

export const typography = {
  displayStation: {
    fontFamily: fontFamilies.sans.black,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.5,
  } satisfies TextStyle,
  sheetTitle: {
    fontFamily: fontFamilies.sans.extraBold,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.2,
  } satisfies TextStyle,
  sectionTitle: {
    fontFamily: fontFamilies.sans.extraBold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  } satisfies TextStyle,
  cardTitle: {
    fontFamily: fontFamilies.sans.bold,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
  } satisfies TextStyle,
  body: {
    fontFamily: fontFamilies.sans.regular,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  } satisfies TextStyle,
  bodyMedium: {
    fontFamily: fontFamilies.sans.medium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  } satisfies TextStyle,
  bodyBold: {
    fontFamily: fontFamilies.sans.bold,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  } satisfies TextStyle,
  meta: {
    fontFamily: fontFamilies.sans.bold,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  } satisfies TextStyle,
  badge: {
    fontFamily: fontFamilies.sans.extraBold,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
  } satisfies TextStyle,
  metric: {
    fontFamily: fontFamilies.mono.bold,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  } satisfies TextStyle,
  monoSmall: {
    fontFamily: fontFamilies.mono.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  } satisfies TextStyle,
  monoLarge: {
    fontFamily: fontFamilies.mono.bold,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
  } satisfies TextStyle,
} as const;
