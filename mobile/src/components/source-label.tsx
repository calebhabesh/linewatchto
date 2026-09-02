import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";
import { typography } from "@/theme/typography";

export type SourceLabelProps = {
  label: string;
  isLive?: boolean;
  testID?: string;
};

export const SourceLabel = memo(function SourceLabel({
  label,
  isLive = false,
  testID = "source-label",
}: SourceLabelProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container} testID={testID}>
      {isLive ? (
        <View style={[styles.liveDot, { backgroundColor: theme.line.normal }]} />
      ) : null}
      <Text style={[styles.text, { color: isLive ? theme.color.text : theme.color.textQuiet }]}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    ...typography.meta,
  },
});
