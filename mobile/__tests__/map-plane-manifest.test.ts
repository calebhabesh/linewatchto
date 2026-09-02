import { describe, expect, it } from "@jest/globals";
import {
  getMapPlaneDimensions,
  getMapPlaneSource,
  getNetworkAspectRatio,
  getNetworkViewBox,
  MAP_PLANE_MANIFEST,
  REGIONAL_MAP_PLANES,
  TTC_MAP_PLANES,
  type MapNetworkId,
  type MapPlaneKind,
  type MapPlaneTheme,
} from "@/features/map/map-plane-manifest";

describe("Map Plane Manifest", () => {
  const networks: MapNetworkId[] = ["ttc", "regional"];
  const planes: MapPlaneKind[] = ["background", "foreground", "labels"];
  const themes: MapPlaneTheme[] = ["dark", "light", "high-contrast"];

  it("exports valid plane assets for every network, plane kind, and theme", () => {
    for (const network of networks) {
      for (const plane of planes) {
        for (const theme of themes) {
          const source = getMapPlaneSource(network, plane, theme);
          expect(source).toBeDefined();
          expect(source).not.toBeNull();
        }
      }
    }
  });

  it("contains exact decoded dimensions and byte sizes for TTC planes", () => {
    const ttc = MAP_PLANE_MANIFEST.ttc;
    expect(ttc.viewBox).toBe("0 0 8250 4000");
    expect(ttc.aspectRatio).toBeCloseTo(8250 / 4000, 4);

    expect(ttc.planes.background.width).toBe(3000);
    expect(ttc.planes.background.height).toBe(1455);
    expect(ttc.planes.background.byteSize).toBe(45335);

    expect(ttc.planes.foreground.width).toBe(3000);
    expect(ttc.planes.foreground.height).toBe(1455);
    expect(ttc.planes.foreground.byteSize).toBe(153923);

    expect(ttc.planes.labels.width).toBe(3000);
    expect(ttc.planes.labels.height).toBe(1455);
    expect(ttc.planes.labels.byteSize).toBe(522051);
  });

  it("contains exact decoded dimensions and byte sizes for Regional planes", () => {
    const regional = MAP_PLANE_MANIFEST.regional;
    expect(regional.viewBox).toBe("-200 -200 17036.959 9031.6719");
    expect(regional.aspectRatio).toBeCloseTo(17036.959 / 9031.6719, 4);

    expect(regional.planes.background.width).toBe(3200);
    expect(regional.planes.background.height).toBe(1767);
    expect(regional.planes.background.byteSize).toBe(132798);

    expect(regional.planes.foreground.width).toBe(3200);
    expect(regional.planes.foreground.height).toBe(1767);
    expect(regional.planes.foreground.byteSize).toBe(169932);

    expect(regional.planes.labels.width).toBe(3200);
    expect(regional.planes.labels.height).toBe(1696);
    expect(regional.planes.labels.byteSize).toBe(341095);
  });

  it("returns correct dimensions via getMapPlaneDimensions helper", () => {
    const ttcLabels = getMapPlaneDimensions("ttc", "labels");
    expect(ttcLabels.width).toBe(3000);
    expect(ttcLabels.height).toBe(1455);

    const regionalLabels = getMapPlaneDimensions("regional", "labels");
    expect(regionalLabels.width).toBe(3200);
    expect(regionalLabels.height).toBe(1696);
  });

  it("returns matching viewBox and aspect ratio for networks", () => {
    expect(getNetworkViewBox("ttc")).toBe("0 0 8250 4000");
    expect(getNetworkViewBox("regional")).toBe("-200 -200 17036.959 9031.6719");

    expect(getNetworkAspectRatio("ttc")).toBe(2.0625);
    expect(getNetworkAspectRatio("regional")).toBeCloseTo(1.88636, 4);
  });

  it("maintains distinct asset plane sources between TTC and Regional", () => {
    expect(TTC_MAP_PLANES.dark.background).not.toEqual(REGIONAL_MAP_PLANES.dark.background);
    expect(TTC_MAP_PLANES.dark.foreground).not.toEqual(REGIONAL_MAP_PLANES.dark.foreground);
    expect(TTC_MAP_PLANES.dark.labels).not.toEqual(REGIONAL_MAP_PLANES.dark.labels);
  });

  describe("framing, operational center, and keepouts", () => {
    it("defines TTC authored content bounds matching PWA artwork extent", () => {
      const bounds = MAP_PLANE_MANIFEST.ttc.contentBounds;
      expect(bounds.x).toBe(65);
      expect(bounds.y).toBe(120);
      expect(bounds.width).toBe(7835);
      expect(bounds.height).toBe(3700);
    });

    it("identifies TTC downtown operational core in manifest", () => {
      const core = MAP_PLANE_MANIFEST.ttc.operationalCenter;
      expect(core.x).toBe(4350);
      expect(core.y).toBe(2850);
      expect(core.description).toContain("Bloor-Yonge");
    });

    it("defines TTC default framing with PWA golden vertical ratio 0.435", () => {
      const framing = MAP_PLANE_MANIFEST.ttc.defaultFraming;
      expect(framing.verticalCenterRatio).toBe(0.435);
      expect(framing.horizontalInsetRatio).toBe(0.025);
      expect(framing.minScale).toBe(1.0);
      expect(framing.maxScale).toBe(6.0);
    });

    it("defines safe-area and chrome keepout defaults for TTC and Regional", () => {
      const ttcKeepouts = MAP_PLANE_MANIFEST.ttc.defaultKeepouts;
      expect(ttcKeepouts.top).toBe(96);
      expect(ttcKeepouts.bottom).toBe(220);
      expect(ttcKeepouts.left).toBe(44);
      expect(ttcKeepouts.right).toBe(48);

      const regionalKeepouts = MAP_PLANE_MANIFEST.regional.defaultKeepouts;
      expect(regionalKeepouts.top).toBe(96);
      expect(regionalKeepouts.bottom).toBe(220);
    });
  });
});
