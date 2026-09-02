import { memo, type ReactNode } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/theme/theme-provider";

export type OperationsSheetScrollProps = ScrollViewProps & {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => void;
  refreshing?: boolean;
  testID?: string;
};

export const OperationsSheetScroll = memo(function OperationsSheetScroll({
  children,
  contentContainerStyle,
  onRefresh,
  refreshing = false,
  testID = "operations-sheet-scroll",
  ...rest
}: OperationsSheetScrollProps) {
  const { theme } = useTheme();

  return (
    <ScrollView
      bounces={true}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled={true}
      overScrollMode="always"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            colors={[theme.color.focus]}
            onRefresh={onRefresh}
            refreshing={refreshing}
            tintColor={theme.color.focus}
          />
        ) : undefined
      }
      showsVerticalScrollIndicator={true}
      style={styles.scroll}
      testID={testID}
      {...rest}
    >
      {children}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
});
