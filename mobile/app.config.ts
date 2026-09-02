import type { ExpoConfig, ConfigContext } from "expo/config";

const APP_NAME = "LineWatchTO";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: "linewatchto",
  scheme: "linewatchto",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  ios: {
    bundleIdentifier: "ca.linewatchto.app",
    supportsTablet: true,
  },
  android: {
    package: "ca.linewatchto.app",
    predictiveBackGestureEnabled: true,
  },
  web: {
    output: "static",
  },
  plugins: ["expo-router", "expo-secure-store", "expo-image"],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
