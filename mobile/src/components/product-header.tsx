import { StyleSheet, Text, View } from "react-native";

import type { NetworkId } from "@/api/dashboard-schema";
import { NetworkSwitcher } from "@/components/network-switcher";
import { useTheme } from "@/theme/theme-provider";

type Props = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  network?: NetworkId;
  onNetworkChange?: (network: NetworkId) => void;
};

export function ProductHeader({ eyebrow, title, subtitle, network, onNetworkChange }: Props) {
  const { theme } = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: theme.color.focus }]}>{eyebrow}</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.color.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: theme.color.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {network && onNetworkChange ? <NetworkSwitcher value={network} onChange={onNetworkChange} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  copy: { gap: 3 },
  eyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.25 },
  title: { fontSize: 27, fontWeight: "900", letterSpacing: -0.65 },
  subtitle: { fontSize: 12, lineHeight: 17 },
});
