import { memo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Dashboard, LineStatus } from "@/api/dashboard-schema";
import { NetworkSwitcher } from "@/components/network-switcher";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BellFilledIcon,
  BellIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  ConstructionIcon,
  DelayIcon,
  InfoIcon,
  LocateIcon,
  MoonIcon,
  PlannedClosureIcon,
  RefreshIcon,
  SunIcon,
  TrainIcon,
} from "@/components/operations-icons";
import { SHELL_ELEVATION, SHELL_Z_INDEX } from "@/features/shell/shell-layout";
import { useTheme } from "@/theme/theme-provider";
import type { ThemeLineColors } from "@/theme/tokens";

type MapRailProps = {
  lines: LineStatus[];
  onSelectLine?: (lineId: string) => void;
};

export const MapLineRail = memo(function MapLineRail({ lines, onSelectLine }: MapRailProps) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      accessibilityLabel="Transit line status legend"
      style={[
        styles.lineRail,
        expanded ? styles.lineRailExpanded : styles.lineRailCollapsed,
        { backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border },
      ]}
      testID="map-line-rail"
    >
      <Pressable
        accessibilityLabel={expanded ? "Collapse line legend" : "Expand line legend"}
        accessibilityRole="button"
        onPress={() => setExpanded(!expanded)}
        style={styles.railToggle}
        testID="toggle-legend-button"
      >
        <Text style={[styles.railToggleText, { color: theme.color.textMuted }]}>
          {expanded ? "LINES" : "LINE"}
        </Text>
        <View style={expanded ? styles.arrowUp : undefined}>
          <ChevronDownIcon color={theme.color.textMuted} size={12} />
        </View>
      </Pressable>

      {lines.map((line) => {
        const ringColor = statusColor(line.status, theme.line);
        return (
          <Pressable
            key={line.id}
            accessibilityLabel={`${line.number}, ${line.name}: ${line.statusLabel}`}
            accessibilityRole="button"
            onPress={() => onSelectLine?.(line.id)}
            style={({ pressed }) => [
              styles.lineRow,
              expanded && styles.lineRowExpanded,
              pressed && { opacity: 0.8 },
            ]}
            testID={`map-line-${line.id}`}
          >
            <View
              style={[
                styles.lineBadgeOuter,
                { borderColor: ringColor, backgroundColor: theme.color.surfaceRaised },
              ]}
            >
              <View style={[styles.lineBadgeInner, { backgroundColor: line.color }]}>
                <Text
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  style={[
                    styles.lineBadgeText,
                    { color: line.number.length > 2 ? "#ffffff" : "#08090b" },
                  ]}
                >
                  {line.number}
                </Text>
              </View>
            </View>

            {expanded ? (
              <View style={styles.lineInfo}>
                <Text numberOfLines={1} style={[styles.lineName, { color: theme.color.text }]}>
                  {line.name}
                </Text>
                <Text numberOfLines={1} style={[styles.lineStatus, { color: ringColor }]}>
                  {line.statusLabel}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
});

type MapTopChromeProps = {
  network: Dashboard["networkId"];
  onNetworkChange: (network: Dashboard["networkId"]) => void;
  onRefresh: () => void;
  refreshing: boolean;
  trainsEnabled?: boolean;
  onToggleTrains?: () => void;
};

export const MapTopChrome = memo(function MapTopChrome({
  network,
  onNetworkChange,
  onRefresh,
  refreshing,
  trainsEnabled = false,
  onToggleTrains,
}: MapTopChromeProps) {
  const { mode, setMode, theme } = useTheme();

  return (
    <View style={styles.rightRail} testID="map-top-chrome">
      <View style={styles.actionRow}>
        {onToggleTrains ? (
          <MapActionButton
            accessibilityLabel={trainsEnabled ? "Hide estimated train markers" : "Show estimated train markers"}
            active={trainsEnabled}
            icon={<TrainIcon color={trainsEnabled ? theme.line.normal : theme.color.text} size={18} />}
            onPress={onToggleTrains}
            testID="toggle-trains-button"
          />
        ) : null}
        <MapActionButton
          accessibilityLabel={mode === "light" ? "Use dark display" : "Use light display"}
          icon={
            mode === "light" ? (
              <MoonIcon color="#a855f7" size={18} />
            ) : (
              <SunIcon color="#eab308" size={18} />
            )
          }
          onPress={() => setMode(mode === "light" ? "dark" : "light")}
          testID="toggle-theme-button"
        />
        <MapActionButton
          accessibilityLabel="Refresh dashboard"
          icon={<RefreshIcon color={theme.color.text} size={18} />}
          onPress={onRefresh}
          testID="refresh-dashboard-button"
        />
      </View>
      <NetworkSwitcher value={network} onChange={onNetworkChange} vertical />
    </View>
  );
});

function MapActionButton({
  accessibilityLabel,
  active = false,
  icon,
  onPress,
  testID,
}: {
  accessibilityLabel: string;
  active?: boolean;
  icon: React.ReactNode;
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
            ? `${theme.line.normal}26`
            : pressed
              ? theme.color.surfaceRaised
              : theme.color.surfaceOverlay,
          borderColor: active ? theme.line.normal : theme.color.border,
        },
      ]}
      testID={testID}
    >
      {icon}
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

export const MapStatusPeek = memo(function MapStatusPeek({
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
        { bottom: bottomOffset, backgroundColor: theme.color.surfaceOverlay, borderColor: theme.color.border },
      ]}
      testID="map-status-peek"
    >
      <Pressable
        accessibilityLabel="Open service impacts"
        accessibilityRole="button"
        onPress={onOpenStatus}
        style={styles.statusMain}
        testID="open-status-button"
      >
        <View style={styles.statusTitleRow}>
          <BellFilledIcon color={currentCount > 0 ? theme.line.delay : theme.color.textQuiet} size={16} />
          <Text style={[styles.statusTitle, { color: theme.color.text }]}>
            {currentCount > 0
              ? `${currentCount} Current Impact${currentCount === 1 ? "" : "s"}`
              : "No Current Impacts"}
          </Text>
        </View>

        <View style={styles.sourceStateRow}>
          <View style={[styles.liveDot, { backgroundColor: stateColor }]} />
          <Text style={[styles.sourceState, { color: stateColor }]}>{sourceLine}</Text>
        </View>
        <Text style={[styles.sourceStateTitle, { color: theme.color.textQuiet }]}>{stateTitle}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.countRow}
        >
          {activeCount > 0 ? (
            <CountChip
              count={activeCount}
              icon={<AlertTriangleIcon color={theme.line.suspension} size={12} />}
              label={activeCount === 1 ? "Active Alert" : "Active Alerts"}
              tone="suspension"
            />
          ) : null}
          {delayCount > 0 ? (
            <CountChip
              count={delayCount}
              icon={<DelayIcon color={theme.line.delay} size={12} />}
              label={delayCount === 1 ? "Delay" : "Delays"}
              tone="delay"
            />
          ) : null}
          {rszCount > 0 ? (
            <CountChip
              count={rszCount}
              icon={<ConstructionIcon color={theme.line.rsz} size={12} />}
              label={rszCount === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}
              tone="rsz"
            />
          ) : null}
          {closureCount > 0 ? (
            <CountChip
              count={closureCount}
              icon={<PlannedClosureIcon color={theme.line.planned} size={12} />}
              label={closureCount === 1 ? "Planned Closure" : "Planned Closures"}
              tone="planned"
            />
          ) : null}
          {trainsEnabled && !trainsOperating ? (
            <CountChip count={0} label="Overnight" tone="planned" />
          ) : trainsEnabled && trainsCount !== undefined && trainsCount > 0 ? (
            <CountChip
              count={trainsCount}
              icon={<TrainIcon color={theme.line.normal} size={12} />}
              label="Est. Trains"
              tone="normal"
            />
          ) : null}
          {currentCount === 0 && closureCount === 0 && (!trainsEnabled || trainsCount === 0) ? (
            <Text style={[styles.noImpactText, { color: theme.color.textMuted }]}>
              No dashboard-visible disruptions
            </Text>
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
            borderColor: theme.color.border,
          },
        ]}
        testID="center-map-button"
      >
        <LocateIcon color={theme.color.text} size={22} />
        <Text style={[styles.centerLabel, { color: theme.color.text }]}>CENTER{`\n`}MAP</Text>
      </Pressable>
    </View>
  );
});

function CountChip({
  count,
  icon,
  label,
  tone,
}: {
  count: number;
  icon?: React.ReactNode;
  label: string;
  tone: "suspension" | "delay" | "rsz" | "planned" | "normal";
}) {
  const { theme } = useTheme();
  const color = tone === "normal" ? theme.line.normal : theme.line[tone];
  return (
    <View style={[styles.countChip, { backgroundColor: `${color}18`, borderColor: `${color}60` }]}>
      {icon}
      <Text style={[styles.countText, { color }]}>
        {count > 0 ? `${count} ` : ""}
        {label}
      </Text>
      <ArrowRightIcon color={color} size={11} strokeWidth={2.75} />
    </View>
  );
}

function statusColor(status: LineStatus["status"], colors: ThemeLineColors) {
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
    padding: 5,
    gap: 4,
  },
  lineRailCollapsed: {
    width: 36,
    borderRadius: 18,
    alignItems: "center",
  },
  lineRailExpanded: {
    width: 170,
    borderRadius: 12,
  },
  railToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    gap: 2,
  },
  railToggleText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  arrowUp: {
    transform: [{ rotate: "180deg" }],
  },
  lineRow: {
    alignItems: "center",
  },
  lineRowExpanded: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  lineBadgeOuter: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: 12,
    padding: 1,
  },
  lineBadgeInner: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  lineBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },
  lineInfo: {
    flex: 1,
    minWidth: 0,
  },
  lineName: {
    fontSize: 11,
    fontWeight: "700",
  },
  lineStatus: {
    fontSize: 9,
    fontWeight: "800",
  },
  rightRail: {
    position: "absolute",
    right: 10,
    top: 12,
    zIndex: SHELL_Z_INDEX.chrome,
    elevation: SHELL_ELEVATION.chrome,
    alignItems: "flex-end",
    gap: 8,
  },
  actionRow: {
    flexDirection: "row",
    gap: 6,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPeek: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: SHELL_Z_INDEX.statusPeek,
    elevation: SHELL_ELEVATION.statusPeek,
    borderWidth: 1,
    borderRadius: 8,
    padding: 11,
    flexDirection: "row",
    gap: 10,
  },
  statusMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  statusTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  sourceStateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sourceState: {
    fontSize: 10,
    fontWeight: "800",
  },
  sourceStateTitle: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  countRow: {
    gap: 5,
    paddingTop: 4,
    paddingRight: 8,
  },
  countChip: {
    minHeight: 26,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  countText: {
    fontSize: 11,
    fontWeight: "800",
  },
  noImpactText: {
    fontSize: 11,
    paddingVertical: 4,
  },
  centerButton: {
    width: 60,
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  centerLabel: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
    textAlign: "center",
  },
});
