import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LineBadge } from "@/components/line-badge";
import { ChevronRightIcon } from "@/components/operations-icons";
import { useTheme } from "@/theme/theme-provider";

export type AlertCardTone = "suspension" | "delay" | "planned" | "reduced-speed-zone";

type Props = {
  lineId?: string;
  lineNumber: string;
  lineColor?: string;
  title: string;
  location: string;
  source: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  shuttle?: boolean;
  tone: AlertCardTone;
  selected?: boolean;
  onPress?: () => void;
  onSelect?: () => void;
  testID?: string;
};

export const AlertCard = memo(function AlertCard({
  lineId,
  lineNumber,
  lineColor: _lineColor,
  title,
  location,
  source,
  startedAt,
  updatedAt,
  shuttle = false,
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
          <View style={styles.badgeRow}>
            <Text style={[styles.kindLabel, { color: toneColor }]}>{toneLabel(tone)}</Text>
            {shuttle ? (
              <View style={[styles.shuttleChip, { backgroundColor: `${theme.line.delay}25`, borderColor: theme.line.delay }]}>
                <Text style={[styles.shuttleText, { color: theme.line.delay }]}>SHUTTLE BUSES</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.title, { color: theme.color.text }]}>{title}</Text>
        </View>
        {selected ? (
          <View style={[styles.selectedBadge, { backgroundColor: theme.color.focus }]}>
            <Text style={styles.selectedBadgeText}>SELECTED</Text>
          </View>
        ) : null}
        {onPress ? <ChevronRightIcon color={theme.color.textMuted} size={16} /> : null}
      </View>

      <View style={styles.locationRow}>
        <View style={[styles.routeRule, { backgroundColor: toneColor }]} />
        <Text style={[styles.location, { color: theme.color.textMuted }]}>{location}</Text>
      </View>

      <View style={styles.footerRow}>
        <Text style={[styles.source, { color: theme.color.textQuiet }]}>SOURCE · {source}</Text>
        {startedAt || updatedAt ? (
          <Text style={[styles.timeMeta, { color: theme.color.textQuiet }]}>
            {updatedAt ? `Updated ${updatedAt}` : startedAt ? `Started ${startedAt}` : ""}
          </Text>
        ) : null}
      </View>
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
});

function toneLabel(tone: AlertCardTone) {
  if (tone === "suspension") return "ACTIVE ALERT";
  if (tone === "planned") return "PLANNED CLOSURE";
  if (tone === "reduced-speed-zone") return "REDUCED SPEED ZONE";
  return "SERVICE DELAY";
}

const styles = StyleSheet.create({
  card: { borderRadius: 8, padding: 13, gap: 9 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  titleBlock: { flex: 1, gap: 2 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  kindLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  shuttleChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  shuttleText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  title: { fontSize: 14, lineHeight: 19, fontWeight: "800" },
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
  locationRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  routeRule: { width: 14, height: 3, borderRadius: 2 },
  location: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  source: { fontSize: 9, fontWeight: "800", letterSpacing: 0.45 },
  timeMeta: { fontSize: 9, fontWeight: "700" },
});
