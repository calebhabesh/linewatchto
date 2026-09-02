import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Dashboard } from "@/api/dashboard-schema";
import { LineBadge } from "@/components/line-badge";
import { SHELL_ELEVATION, SHELL_LAYOUT, SHELL_Z_INDEX } from "@/features/shell/shell-layout";
import type { ImpactKind, ImpactSelection } from "@/state/impact-selection-provider";
import { useTheme } from "@/theme/theme-provider";

export type ResolvedImpact = {
  id: string;
  kind: ImpactKind;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  source: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  shuttle?: boolean;
  nightly?: boolean;
  activeNow?: boolean;
  window?: string;
};

export function resolveImpactFromDashboard(
  selection: ImpactSelection,
  dashboard: Dashboard,
): ResolvedImpact | null {
  const { cardId, kind } = selection;

  // 1. Suspension / Active Alert
  if (kind === "suspension") {
    const alert = dashboard.activeAlerts.find((a) => a.id === cardId);
    if (alert) {
      return {
        id: alert.id,
        kind: "suspension",
        lineId: alert.lineId,
        lineNumber: alert.lineNumber,
        title: alert.title,
        location: alert.location,
        source: alert.source,
        startedAt: alert.startedAt,
        updatedAt: alert.updatedAt,
        shuttle: alert.shuttle,
      };
    }
    const closure = dashboard.plannedClosures.find((c) => c.id === cardId && c.activeNow);
    if (closure) {
      return {
        id: closure.id,
        kind: "suspension",
        lineId: closure.lineId,
        lineNumber: closure.lineNumber,
        title: closure.title,
        location: closure.location,
        source: closure.source,
        startedAt: closure.startedAt,
        updatedAt: closure.updatedAt,
        shuttle: closure.shuttle,
        nightly: closure.nightly,
        activeNow: true,
        window: closure.window,
      };
    }
  }

  // 2. Delay
  if (kind === "delay") {
    const delay = dashboard.delays.find((d) => d.id === cardId);
    if (delay) {
      return {
        id: delay.id,
        kind: "delay",
        lineId: delay.lineId,
        lineNumber: delay.lineNumber,
        title: delay.title,
        location: delay.location,
        source: delay.source,
        startedAt: delay.startedAt,
        updatedAt: delay.updatedAt,
      };
    }
    const alertDelay = dashboard.activeAlerts.find((a) => a.id === cardId && a.severity === "delay");
    if (alertDelay) {
      return {
        id: alertDelay.id,
        kind: "delay",
        lineId: alertDelay.lineId,
        lineNumber: alertDelay.lineNumber,
        title: alertDelay.title,
        location: alertDelay.location,
        source: alertDelay.source,
        startedAt: alertDelay.startedAt,
        updatedAt: alertDelay.updatedAt,
        shuttle: alertDelay.shuttle,
      };
    }
  }

  // 3. Reduced Speed Zone
  if (kind === "reduced-speed-zone") {
    const rsz = dashboard.reducedSpeedZones.find((z) => z.id === cardId);
    if (rsz) {
      return {
        id: rsz.id,
        kind: "reduced-speed-zone",
        lineId: rsz.lineId,
        lineNumber: rsz.lineNumber,
        title: rsz.title,
        location: rsz.location,
        source: rsz.source,
        startedAt: rsz.startedAt,
        updatedAt: rsz.updatedAt,
      };
    }
  }

  // 4. Planned Closure
  if (kind === "planned-closure") {
    const closure = dashboard.plannedClosures.find((c) => c.id === cardId);
    if (closure) {
      return {
        id: closure.id,
        kind: "planned-closure",
        lineId: closure.lineId,
        lineNumber: closure.lineNumber,
        title: closure.title,
        location: closure.location,
        source: closure.source,
        startedAt: closure.startedAt,
        updatedAt: closure.updatedAt,
        shuttle: closure.shuttle,
        nightly: closure.nightly,
        activeNow: closure.activeNow,
        window: closure.window,
      };
    }
  }

  // Fallback search across all collections
  const fallback =
    dashboard.activeAlerts.find((a) => a.id === cardId) ||
    dashboard.delays.find((d) => d.id === cardId) ||
    dashboard.reducedSpeedZones.find((z) => z.id === cardId) ||
    dashboard.plannedClosures.find((c) => c.id === cardId);

  if (fallback) {
    const isClosure = "window" in fallback;
    const isRSZ = "rszLength" in fallback;
    const isDelay = !isClosure && !isRSZ && ("severity" in fallback ? fallback.severity === "delay" : true);
    const resolvedKind: ImpactKind = isClosure
      ? "planned-closure"
      : isRSZ
        ? "reduced-speed-zone"
        : isDelay
          ? "delay"
          : "suspension";

    return {
      id: fallback.id,
      kind: resolvedKind,
      lineId: fallback.lineId,
      lineNumber: fallback.lineNumber,
      title: fallback.title,
      location: fallback.location,
      source: fallback.source,
      startedAt: fallback.startedAt,
      updatedAt: fallback.updatedAt,
      shuttle: "shuttle" in fallback ? Boolean(fallback.shuttle) : false,
      nightly: "nightly" in fallback ? Boolean(fallback.nightly) : false,
      activeNow: "activeNow" in fallback ? Boolean(fallback.activeNow) : false,
      window: "window" in fallback ? String(fallback.window) : undefined,
    };
  }

  return null;
}

function toneLabel(kind: ImpactKind, activeNow?: boolean): string {
  switch (kind) {
    case "suspension":
      return "ACTIVE ALERT";
    case "delay":
      return "SERVICE DELAY";
    case "reduced-speed-zone":
      return "REDUCED SPEED ZONE";
    case "planned-closure":
      return activeNow ? "ACTIVE CLOSURE" : "PLANNED CLOSURE";
  }
}

function toneColor(kind: ImpactKind, colors: import("@/theme/tokens").ThemeLineColors): string {
  switch (kind) {
    case "suspension":
      return colors.suspension;
    case "delay":
      return colors.delay;
    case "reduced-speed-zone":
      return colors.rsz ?? "#f59e0b";
    case "planned-closure":
      return colors.planned;
  }
}

type Props = {
  selection: ImpactSelection;
  dashboard: Dashboard;
  bottomOffset: number;
  onDismiss: () => void;
  onOpenDetails: (selection: ImpactSelection) => void;
};

export const SelectedImpactPreview = memo(function SelectedImpactPreview({
  selection,
  dashboard,
  bottomOffset,
  onDismiss,
  onOpenDetails,
}: Props) {
  const { theme } = useTheme();
  const impact = resolveImpactFromDashboard(selection, dashboard);

  if (!impact) return null;

  const color = toneColor(impact.kind, theme.line);
  const category = toneLabel(impact.kind, impact.activeNow);

  const timestamp = impact.startedAt
    ? `Started ${impact.startedAt}`
    : impact.updatedAt
      ? `Updated ${impact.updatedAt}`
      : null;

  return (
    <View
      accessibilityLabel={`Selected ${category}: ${impact.title}, ${impact.location}`}
      accessibilityRole="summary"
      style={[
        styles.container,
        {
          bottom: bottomOffset,
          backgroundColor: theme.color.surfaceOverlay,
          borderColor: color,
        },
      ]}
      testID="selected-impact-preview"
    >
      {/* Header Row: Line Badge + Tone Label + Dismiss Button */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <LineBadge lineId={impact.lineId} lineNumber={impact.lineNumber} size={24} />
          <Text style={[styles.categoryLabel, { color }]}>{category}</Text>
          {impact.shuttle ? (
            <View style={[styles.miniBadge, { backgroundColor: "rgba(59, 130, 246, 0.2)", borderColor: "rgba(59, 130, 246, 0.5)" }]}>
              <Text style={[styles.miniBadgeText, { color: "#60a5fa" }]}>Shuttle</Text>
            </View>
          ) : null}
          {impact.nightly ? (
            <View style={[styles.miniBadge, { backgroundColor: "rgba(168, 85, 247, 0.2)", borderColor: "rgba(168, 85, 247, 0.5)" }]}>
              <Text style={[styles.miniBadgeText, { color: "#c084fc" }]}>Nightly</Text>
            </View>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="Dismiss impact preview"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.dismissButton,
            { backgroundColor: pressed ? theme.color.surfaceRaised : "transparent" },
          ]}
          testID="dismiss-impact-preview"
        >
          <Text style={[styles.dismissIcon, { color: theme.color.textMuted }]}>✕</Text>
        </Pressable>
      </View>

      {/* Title and Location */}
      <View style={styles.body}>
        <Text numberOfLines={2} style={[styles.title, { color: theme.color.text }]}>
          {impact.title}
        </Text>
        <Text numberOfLines={1} style={[styles.location, { color: theme.color.textMuted }]}>
          {impact.location}
        </Text>
      </View>

      {/* Footer Row: Source Metadata + View Details CTA */}
      <View style={styles.footerRow}>
        <View style={styles.metaBlock}>
          <Text numberOfLines={1} style={[styles.sourceText, { color: theme.color.textQuiet }]}>
            {impact.source}
            {timestamp ? ` · ${timestamp}` : ""}
          </Text>
        </View>
        <Pressable
          accessibilityHint="Opens complete details for this service impact"
          accessibilityLabel="View details"
          accessibilityRole="button"
          onPress={() => onOpenDetails(selection)}
          style={({ pressed }) => [
            styles.detailsButton,
            {
              backgroundColor: pressed ? `${color}30` : `${color}18`,
              borderColor: color,
            },
          ]}
          testID="view-impact-details"
        >
          <Text style={[styles.detailsText, { color }]}>View Details ›</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: SHELL_Z_INDEX.statusPeek + 1,
    elevation: SHELL_ELEVATION.statusPeek + 1,
    borderWidth: 1.5,
    borderRadius: SHELL_LAYOUT.sheetCornerRadius,
    padding: 12,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 1,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  miniBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  miniBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  dismissButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissIcon: {
    fontSize: 14,
    fontWeight: "700",
  },
  body: {
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19,
  },
  location: {
    fontSize: 12,
    fontWeight: "600",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
    gap: 8,
  },
  metaBlock: {
    flex: 1,
  },
  sourceText: {
    fontSize: 9.5,
    fontWeight: "700",
  },
  detailsButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
    minWidth: 90,
  },
  detailsText: {
    fontSize: 11,
    fontWeight: "800",
  },
});
