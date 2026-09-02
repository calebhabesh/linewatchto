import { Pressable, StyleSheet, Text, View } from "react-native";

import { LineBadge } from "@/components/line-badge";
import { useTheme } from "@/theme/theme-provider";

export type AlertCardTone = "suspension" | "delay" | "planned" | "reduced-speed-zone";

type Props = {
  lineId?: string;
  lineNumber: string;
  lineColor?: string;
  title: string;
  location: string;
  source: string;
  tone: AlertCardTone;
  selected?: boolean;
  onPress?: () => void;
  onSelect?: () => void;
  testID?: string;
};

export function AlertCard({
  lineId,
  lineNumber,
  lineColor: _lineColor,
  title,
  location,
  source,
  tone,
  selected = false,
  onPress,
  onSelect,
  testID,
}: Props) {
  const { theme } = useTheme();

  const toneColor =
    tone === "reduced-speed-zone"
      ? "#f59e0b"
      : theme.line[tone] ?? theme.line.delay;

  const content = (
    <>
      <View style={styles.heading}>
        <LineBadge lineId={lineId} lineNumber={lineNumber} size={28} />
        <View style={styles.titleBlock}>
          <Text style={[styles.kindLabel, { color: toneColor }]}>{toneLabel(tone)}</Text>
          <Text style={[styles.title, { color: theme.color.text }]}>{title}</Text>
        </View>
        {selected ? (
          <View style={[styles.selectedBadge, { backgroundColor: theme.color.focus }]}>
            <Text style={styles.selectedBadgeText}>SELECTED</Text>
          </View>
        ) : null}
        {onPress ? <Text style={[styles.chevron, { color: theme.color.textMuted }]}>›</Text> : null}
      </View>
      <View style={styles.locationRow}>
        <View style={[styles.routeRule, { backgroundColor: toneColor }]} />
        <Text style={[styles.location, { color: theme.color.textMuted }]}>{location}</Text>
      </View>
      <Text style={[styles.source, { color: theme.color.textQuiet }]}>SOURCE · {source}</Text>
    </>
  );

  const baseBackgroundColor = selected ? theme.color.surfaceRaised : theme.color.surface;
  const cardStyle = [
    styles.card,
    {
      backgroundColor: baseBackgroundColor,
      borderColor: selected ? theme.color.focus : theme.color.border,
      borderWidth: selected ? 2 : 1,
      borderLeftColor: toneColor,
      borderLeftWidth: 3,
    },
  ];

  const handlePress = () => {
    onSelect?.();
    onPress?.();
  };

  if (onPress || onSelect) {
    return (
      <Pressable
        accessibilityLabel={`${title}, Line ${lineNumber}, ${location}${selected ? ", selected on map" : ""}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={handlePress}
        style={({ pressed }) => [
          cardStyle,
          {
            backgroundColor: pressed ? theme.color.surfaceRaised : baseBackgroundColor,
          },
        ]}
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={cardStyle} testID={testID}>
      {content}
    </View>
  );
}

function toneLabel(tone: AlertCardTone) {
  if (tone === "suspension") return "ACTIVE ALERT";
  if (tone === "planned") return "PLANNED CLOSURE";
  if (tone === "reduced-speed-zone") return "REDUCED SPEED ZONE";
  return "SERVICE DELAY";
}

const styles = StyleSheet.create({
  card: { borderRadius: 6, padding: 13, gap: 9 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  lineBadge: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  lineBadgeText: { color: "#090909", fontSize: 12, fontWeight: "900" },
  titleBlock: { flex: 1, gap: 2 },
  kindLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  selectedBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  selectedBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#000000",
    letterSpacing: 0.5,
  },
  chevron: { fontSize: 18, fontWeight: "600", paddingLeft: 4 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  routeRule: { width: 18, height: 3, borderRadius: 2 },
  location: { flex: 1, fontSize: 13, lineHeight: 18 },
  source: { fontSize: 9, fontWeight: "800", letterSpacing: 0.45 },
});
