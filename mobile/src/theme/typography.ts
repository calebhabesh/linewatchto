import { type TextStyle } from "react-native";

export const typography = {
  displayStation: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.5,
  } satisfies TextStyle,
  sheetTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.2,
  } satisfies TextStyle,
  sectionTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  } satisfies TextStyle,
  cardTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
  } satisfies TextStyle,
  body: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  } satisfies TextStyle,
  bodyMedium: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  } satisfies TextStyle,
  bodyBold: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  } satisfies TextStyle,
  meta: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  } satisfies TextStyle,
  badge: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
  } satisfies TextStyle,
  metric: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  } satisfies TextStyle,
} as const;
