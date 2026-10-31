/*
 * The drop-in fixture map's definition: its manifest, its prepared geometry
 * and an existing network adapter (TTC's), as a second TTC map such as a
 * streetcar map would be. Nothing else: the overlay plane and artwork come
 * from the manifest.
 */
import type { PreparedMapGeometry } from "../../../src/app/map-geometry-data";
import { defineSystemMap } from "../../../src/components/system-map/system-map-definition";
import { ttcSystemMapAdapter } from "../../../src/components/system-map/ttc-system-map";
import manifest from "./drop-in-map-manifest";
import preparedGeometry from "./drop-in-map.json";

const geometry = preparedGeometry as unknown as PreparedMapGeometry;

export const DROP_IN_SYSTEM_MAP = defineSystemMap({
  manifest,
  geometry,
  ...ttcSystemMapAdapter(geometry),
});
