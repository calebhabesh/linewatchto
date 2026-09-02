import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";
import { typography } from "@/theme/typography";

export type MetricPairProps = {
  label: string;
  value: string | number;
  subvalue?: string;
  testID?: string;
};

export const MetricPair = memo(function MetricPair({
  label,
  value,
  subvalue,
  testID = "metric-pair",
}: MetricPairProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.color.surfaceRaised,
          borderColor: theme.color.border,
        },
      ]}
      testID={testID}
    >
      <Text style={[styles.label, { color: theme.color.textQuiet }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.color.text }]}>{value}</Text>
      {subvalue ? (
        <Text style={[styles.subvalue, { color: theme.color.textMuted }]}>{subvalue}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    flex: 1,
  },
  label: {
    ...typography.meta,
  },
  value: {
    ...typography.metric,
    fontSize: 16,
    lineHeight: 20,
  },
  subvalue: {
    ...typography.meta,
  },
});
