import { StyleSheet, View } from "react-native";

import { useShellOptional } from "@/features/shell/shell-provider";
import { OperationsShell } from "@/features/shell/operations-shell";

export function DashboardScreen() {
  const shell = useShellOptional();

  // When mounted within the persistent tabs shell, the map layer is already permanently
  // mounted at the root of TabsLayout.
  if (shell?.isShellMounted) {
    return (
      <View
        pointerEvents="box-none"
        style={styles.container}
        testID="dashboard-tab-scene"
      />
    );
  }

  // Standalone mode: fallback for isolated unit tests and previews
  return <OperationsShell />;
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
