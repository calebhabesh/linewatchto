import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import type { Dashboard, LineStatus } from "@/api/dashboard-schema";
import { NetworkSwitcher } from "@/components/network-switcher";
import { useTheme } from "@/theme/theme-provider";

type MapRailProps = {
  lines: LineStatus[];
};

export function MapLineRail({ lines }: MapRailProps) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityLabel="Transit line status legend"
      style={[styles.lineRail, { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border }]}
    >
      {lines.map((line) => (
        <View
          key={line.id}
          accessible
          accessibilityLabel={`${line.number}, ${line.name}: ${line.statusLabel}`}
          style={[
            styles.lineOuter,
            { borderColor: statusColor(line.status, theme.line), backgroundColor: theme.color.surfaceRaised },
          ]}
          testID={`map-line-${line.id}`}
        >
          <View style={[styles.lineInner, { backgroundColor: line.color }]}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.lineNumber}>{line.number}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

type MapTopChromeProps = {
  network: Dashboard["networkId"];
  onNetworkChange: (network: Dashboard["networkId"]) => void;
  onRefresh: () => void;
  refreshing: boolean;
  trainsEnabled?: boolean;
  onToggleTrains?: () => void;
};

export function MapTopChrome({
  network,
  onNetworkChange,
  onRefresh,
  refreshing,
  trainsEnabled = false,
  onToggleTrains,
}: MapTopChromeProps) {
  const { mode, setMode, theme } = useTheme();
  return (
    <>
      <View style={[styles.brandChip, { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border }]} testID="map-brand-chip">
        <View style={[styles.brandMark, { borderColor: theme.color.focus }]}>
          <Text style={[styles.brandMarkText, { color: theme.color.text }]}>LW</Text>
        </View>
        <View style={styles.brandCopy}>
          <Text style={[styles.brandTitle, { color: theme.color.text }]}>LineWatchTO</Text>
          <Text style={[styles.brandMeta, { color: theme.color.textQuiet }]}>UNOFFICIAL · SERVICE MAP</Text>
        </View>
      </View>

      <View style={styles.rightRail}>
        <View style={styles.actionRow}>
          {onToggleTrains ? (
            <MapActionButton
              accessibilityLabel={trainsEnabled ? "Hide estimated train markers" : "Show estimated train markers"}
              active={trainsEnabled}
              label="🚆"
              onPress={onToggleTrains}
              testID="toggle-trains-button"
            />
          ) : null}
          <MapActionButton
            accessibilityLabel={mode === "dark" ? "Enable high contrast" : "Use dark display"}
            label={mode === "dark" ? "☀" : "◐"}
            onPress={() => setMode(mode === "dark" ? "high-contrast" : "dark")}
            testID="toggle-theme-button"
          />
          <MapActionButton
            accessibilityLabel="Refresh dashboard"
            label={refreshing ? "…" : "↻"}
            onPress={onRefresh}
            testID="refresh-dashboard-button"
          />
        </View>
        <NetworkSwitcher value={network} onChange={onNetworkChange} vertical />
      </View>
    </>
  );
}

function MapActionButton({
  accessibilityLabel,
  active = false,
  label,
  onPress,
  testID,
}: {
  accessibilityLabel: string;
  active?: boolean;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: active
            ? `${theme.line.normal}30`
            : pressed
              ? theme.color.surfaceRaised
              : theme.color.surfaceOverlay,
          borderColor: active ? theme.line.normal : theme.color.border,
        },
      ]}
      testID={testID}
    >
      <Text style={[styles.actionButtonText, { color: active ? theme.line.normal : theme.color.text }]}>{label}</Text>
    </Pressable>
  );
}

type StatusPeekProps = {
  dashboard: Dashboard;
  cachedAt: number;
  hasRefreshError: boolean;
  showingCachedData: boolean;
  bottomOffset: number;
  trainsCount?: number;
  trainsEnabled?: boolean;
  trainsOperating?: boolean;
  onOpenStatus: () => void;
  onCenterMap: () => void;
};

export function MapStatusPeek({
  dashboard,
  cachedAt,
  hasRefreshError,
  showingCachedData,
  bottomOffset,
  trainsCount,
  trainsEnabled = false,
  trainsOperating = true,
  onOpenStatus,
  onCenterMap,
}: StatusPeekProps) {
  const { theme } = useTheme();
  const activeCount = dashboard.activeAlerts.length;
  const delayCount = dashboard.delays.length;
  const rszCount = dashboard.reducedSpeedZones.length;
  const closureCount = dashboard.plannedClosures.length;
  const currentCount = activeCount + delayCount + rszCount;
  const live = dashboard.status.generatedAt.live;
  const stateColor = showingCachedData ? theme.line.delay : live ? theme.line.normal : theme.line.planned;
  const stateTitle = showingCachedData ? "Showing cached data" : live ? "Fresh source data" : "Source is not live";
  const sourceLine = showingCachedData
    ? `${hasRefreshError ? "Refresh failed" : "Refresh pending"} · ${new Date(cachedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : live
      ? `Updated ${dashboard.status.generatedAt.lastPoll}`
      : dashboard.status.generatedAt.lastPoll;

  return (
    <View
      style={[
        styles.statusPeek,
        { bottom: bottomOffset, backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.borderStrong },
      ]}
      testID="map-status-peek"
    >
      <Pressable accessibilityLabel="Open service impacts" accessibilityRole="button" onPress={onOpenStatus} style={styles.statusMain} testID="open-status-button">
        <View style={styles.statusTitleRow}>
          <BellIcon color={currentCount > 0 ? "#F8C300" : theme.color.textQuiet} />
          <Text style={[styles.statusTitle, { color: theme.color.text }]}>
            {currentCount} Current Impact{currentCount === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={styles.sourceStateRow}>
          <View style={[styles.liveDot, { backgroundColor: stateColor }]} />
          <Text style={[styles.sourceState, { color: stateColor }]}>{sourceLine}</Text>
        </View>
        <Text style={[styles.sourceStateTitle, { color: theme.color.textQuiet }]}>{stateTitle}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countRow}>
          {activeCount > 0 ? <CountChip count={activeCount} label="Active" tone="suspension" /> : null}
          {delayCount > 0 ? <CountChip count={delayCount} label="Delays" tone="delay" /> : null}
          {rszCount > 0 ? <CountChip count={rszCount} label="RSZ" tone="delay" /> : null}
          {closureCount > 0 ? <CountChip count={closureCount} label="Closures" tone="planned" /> : null}
          {trainsEnabled && !trainsOperating ? (
            <CountChip count={0} label="Overnight" tone="planned" />
          ) : trainsEnabled && trainsCount !== undefined && trainsCount > 0 ? (
            <CountChip count={trainsCount} label="Est. Trains" tone="normal" />
          ) : null}
          {currentCount === 0 && closureCount === 0 && (!trainsEnabled || trainsCount === 0) ? (
            <Text style={[styles.noImpactText, { color: theme.color.textMuted }]}>No dashboard-visible disruptions</Text>
          ) : null}
        </ScrollView>
      </Pressable>
      <Pressable
        accessibilityLabel="Center map"
        accessibilityRole="button"
        onPress={onCenterMap}
        style={({ pressed }) => [
          styles.centerButton,
          {
            backgroundColor: pressed ? theme.color.surfaceRaised : "rgba(255,255,255,0.06)",
            borderColor: theme.color.borderStrong,
          },
        ]}
        testID="center-map-button"
      >
        <TargetIcon color={theme.color.text} />
        <Text style={[styles.centerLabel, { color: theme.color.text }]}>CENTER{`\n`}MAP</Text>
      </Pressable>
    </View>
  );
}

function CountChip({ count, label, tone }: { count: number; label: string; tone: "suspension" | "delay" | "planned" | "normal" }) {
  const { theme } = useTheme();
  const color = tone === "normal" ? theme.line.normal : theme.line[tone];
  return (
    <View style={[styles.countChip, { backgroundColor: `${color}20`, borderColor: `${color}70` }]}>
      <Text style={[styles.countText, { color }]}>{count > 0 ? `${count} ` : ""}{label}</Text>
      <Text style={[styles.countArrow, { color }]}>›</Text>
    </View>
  );
}

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill={color}>
      <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TargetIcon({ color }: { color: string }) {
  return (
    <Svg width={27} height={27} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={7} stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={2} fill={color} />
      <Path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function statusColor(status: LineStatus["status"], colors: typeof import("@/theme/tokens").themes.dark.line) {
  if (status === "suspension") return colors.suspension;
  if (status === "delay") return colors.delay;
  if (status === "planned") return colors.planned;
  return colors.normal;
}

const styles = StyleSheet.create({
  lineRail: {
    position: "absolute",
    left: 10,
    top: 12,
    zIndex: 20,
    borderWidth: 1,
    borderRadius: 24,
    padding: 6,
    gap: 5,
  },
  lineOuter: { width: 44, height: 44, borderWidth: 3, borderRadius: 22, padding: 2 },
  lineInner: { flex: 1, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  lineNumber: { color: "#08090b", fontSize: 13, fontWeight: "900", paddingHorizontal: 2 },
  brandChip: {
    position: "absolute",
    left: 68,
    top: 13,
    maxWidth: 160,
    zIndex: 18,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  brandMark: { width: 30, height: 30, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  brandMarkText: { fontSize: 9, fontWeight: "900", letterSpacing: -0.2 },
  brandCopy: { gap: 1, flexShrink: 1 },
  brandTitle: { fontSize: 12, fontWeight: "900" },
  brandMeta: { fontSize: 6.5, fontWeight: "800", letterSpacing: 0.65 },
  rightRail: { position: "absolute", right: 10, top: 12, zIndex: 22, alignItems: "flex-end", gap: 8 },
  actionRow: { flexDirection: "row", gap: 7 },
  actionButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionButtonText: { fontSize: 20, fontWeight: "700" },
  statusPeek: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 25,
    borderWidth: 1,
    borderRadius: 8,
    padding: 11,
    flexDirection: "row",
    gap: 10,
  },
  statusMain: { flex: 1, minWidth: 0, gap: 3 },
  statusTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusTitle: { fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  sourceStateRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  sourceState: { fontSize: 10, fontWeight: "800" },
  sourceStateTitle: { fontSize: 8, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  countRow: { gap: 6, paddingTop: 4, paddingRight: 8 },
  countChip: { minHeight: 28, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  countText: { fontSize: 11, fontWeight: "800" },
  countArrow: { fontSize: 16, fontWeight: "800", lineHeight: 16 },
  noImpactText: { fontSize: 11, paddingVertical: 4 },
  centerButton: { width: 62, minHeight: 72, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", gap: 3 },
  centerLabel: { fontSize: 9, lineHeight: 11, fontWeight: "900", textAlign: "center" },
});
