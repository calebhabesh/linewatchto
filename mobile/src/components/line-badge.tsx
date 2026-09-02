import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

export const LINE_CONFIG: Record<string, { label: string; bg: string; text: string; name: string }> = {
  "line-1": { label: "1", bg: "#F8C300", text: "#000000", name: "Yonge-University" },
  "line-2": { label: "2", bg: "#00923F", text: "#ffffff", name: "Bloor-Danforth" },
  "line-4": { label: "4", bg: "#A21A68", text: "#ffffff", name: "Sheppard" },
  "line-5": { label: "5", bg: "#EB8738", text: "#ffffff", name: "Eglinton" },
  "line-6": { label: "6", bg: "#969594", text: "#ffffff", name: "Finch West" },
  "go-br": { label: "BR", bg: "#155BA0", text: "#ffffff", name: "Barrie" },
  "go-ki": { label: "KI", bg: "#138336", text: "#ffffff", name: "Kitchener" },
  "go-le": { label: "LE", bg: "#EE2722", text: "#ffffff", name: "Lakeshore East" },
  "go-lw": { label: "LW", bg: "#8B0A31", text: "#ffffff", name: "Lakeshore West" },
  "go-mi": { label: "MI", bg: "#F47216", text: "#ffffff", name: "Milton" },
  "go-rh": { label: "RH", bg: "#27ADEA", text: "#ffffff", name: "Richmond Hill" },
  "go-st": { label: "ST", bg: "#774111", text: "#ffffff", name: "Stouffville" },
  "up-express": { label: "UP", bg: "#4084CD", text: "#ffffff", name: "UP Express" },
};

export function normalizeLineKey(lineId?: string): string {
  if (!lineId) return "";
  const lower = lineId.toLowerCase().trim();
  if (lower === "up" || lower === "up-express" || lower === "regional-up") return "up-express";
  if (lower.startsWith("regional-")) {
    const suffix = lower.replace("regional-", "");
    return `go-${suffix}`;
  }
  if (lower.startsWith("line-")) return lower;
  if (/^[1-6]$/.test(lower)) return `line-${lower}`;
  if (lower.startsWith("go-")) return lower;
  return lower;
}

export function getLineInfo(lineId?: string, fallbackNumber?: string, fallbackColor?: string) {
  const key = normalizeLineKey(lineId);
  const matched = LINE_CONFIG[key];
  if (matched) {
    return matched;
  }

  const label = fallbackNumber ?? (lineId ? lineId.replace(/^(line-|go-|regional-)/i, "").toUpperCase() : "?");
  return {
    label,
    bg: fallbackColor ?? "#64748b",
    text: "#ffffff",
    name: lineId ?? "",
  };
}

type Props = {
  lineId?: string;
  lineNumber?: string;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function LineBadge({ lineId, lineNumber, color, size = 26, style, testID }: Props) {
  const info = getLineInfo(lineId, lineNumber, color);
  const isPill = info.label.length > 1;

  const minWidth = isPill ? Math.max(size + 6, 32) : size;
  const borderRadius = size / 2;
  const fontSize = isPill ? Math.max(10, Math.floor(size * 0.42)) : Math.max(11, Math.floor(size * 0.5));

  return (
    <View
      accessibilityLabel={`Line ${info.label} ${info.name}`.trim()}
      style={[
        styles.badge,
        {
          backgroundColor: color ?? info.bg,
          minWidth,
          height: size,
          borderRadius,
          paddingHorizontal: isPill ? 5 : 2,
        },
        style,
      ]}
      testID={testID ?? `line-badge-${info.label.toLowerCase()}`}
    >
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.label, { color: info.text, fontSize }]}
      >
        {info.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontWeight: "900",
    letterSpacing: -0.3,
  },
});
