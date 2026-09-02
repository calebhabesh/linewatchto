import { memo, type ReactNode } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type OperationsSheetScrollProps = ScrollViewProps & {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => void;
  refreshing?: boolean;
};

export const OperationsSheetScroll = memo(function OperationsSheetScroll({
  children,
  contentContainerStyle,
  onRefresh,
  refreshing = false,
  ...rest
}: OperationsSheetScrollProps) {
  return (
    <ScrollView
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} tintColor="#38bdf8" />
        ) : undefined
      }
      showsVerticalScrollIndicator
      style={styles.scroll}
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
    padding: 12,
    gap: 10,
  },
});
