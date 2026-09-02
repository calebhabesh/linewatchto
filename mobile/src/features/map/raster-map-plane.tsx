import { memo } from "react";
import {
  Image,
  StyleSheet,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
} from "react-native";

import {
  getMapPlaneSource,
  type MapNetworkId,
  type MapPlaneKind,
  type MapPlaneTheme,
} from "./map-plane-manifest";

export type RasterMapPlaneProps = {
  network: MapNetworkId;
  plane: MapPlaneKind;
  theme: MapPlaneTheme;
  style?: StyleProp<ImageStyle>;
  contentFit?: "contain" | "fill" | "cover" | "none" | "scale-down";
  onLoad?: () => void;
  onError?: (error: unknown) => void;
  testID?: string;
};

export const RasterMapPlane = memo(function RasterMapPlane({
  network,
  plane,
  theme,
  style,
  contentFit = "contain",
  onLoad,
  onError,
  testID,
}: RasterMapPlaneProps) {
  const source = getMapPlaneSource(network, plane, theme);
  const resizeMode =
    contentFit === "fill"
      ? "stretch"
      : contentFit === "cover"
        ? "cover"
        : "contain";

  return (
    <Image
      accessible={false}
      fadeDuration={0}
      onError={onError}
      onLoad={onLoad}
      resizeMode={resizeMode}
      source={source as ImageSourcePropType}
      style={[styles.plane, style]}
      testID={testID ?? `raster-plane-${network}-${plane}-${theme}`}
    />
  );
});

const styles = StyleSheet.create({
  plane: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
});
