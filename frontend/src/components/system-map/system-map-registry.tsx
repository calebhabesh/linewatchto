"use client";
/*
 * Every System Map, by id: its definition (bundled, or loaded on demand) and
 * its artwork, so a map can be prepared before it shows. A new map is one
 * line here plus its definition module; the map a network shows is
 * `NETWORK_MAPS` (app/map-manifests.ts).
 *
 * TTC's definition is in the main bundle, as the default map; GO/UP's (its
 * prepared geometry and content adapter) loads on demand.
 */
import dynamic from "next/dynamic";
import { memo, type ComponentType } from "react";
import type { MapId } from "../../app/map-manifests";
import { preloadMapArtwork, type MapArtworkSource } from "../../app/map-artwork";
import { REGIONAL_MAP_ARTWORK } from "../../app/regional-map-asset";
import { SystemMap, type SystemMapProps } from "./SystemMap";
import type { SystemMapDefinition } from "./system-map-definition";
import { TTC_SYSTEM_MAP } from "./ttc-system-map";

/** What a registered map takes: `SystemMap`'s props without its definition. */
export type RegisteredSystemMapProps = Omit<SystemMapProps, "map">;

type SystemMapEntry =
  | { bundled: SystemMapDefinition }
  | { artwork: MapArtworkSource; load: () => Promise<SystemMapDefinition> };

const SYSTEM_MAPS: Record<MapId, SystemMapEntry> = {
  ttc: { bundled: TTC_SYSTEM_MAP },
  regional: {
    artwork: REGIONAL_MAP_ARTWORK,
    load: () => import("./regional-system-map").then((module) => module.REGIONAL_SYSTEM_MAP),
  },
};

/** Loads a map's definition and artwork before it shows. */
export async function prepareSystemMap(id: MapId): Promise<void> {
  const entry = SYSTEM_MAPS[id];
  if ("bundled" in entry) {
    await preloadMapArtwork(entry.bundled.artwork);
    return;
  }
  await Promise.all([entry.load(), preloadMapArtwork(entry.artwork)]);
}

function withDefinition(definition: SystemMapDefinition): ComponentType<RegisteredSystemMapProps> {
  const Map = memo(function RegisteredMap(props: RegisteredSystemMapProps) {
    return <SystemMap map={definition} {...props} />;
  });
  Map.displayName = `SystemMap(${definition.manifest.id})`;
  return Map;
}

// One component per map, made once: a bundled map renders at once (and on
// the server), the others once their definition loads, on the client only.
const SYSTEM_MAP_COMPONENTS = Object.fromEntries(
  Object.entries(SYSTEM_MAPS).map(([id, entry]) => [
    id,
    "bundled" in entry
      ? withDefinition(entry.bundled)
      : dynamic(() => entry.load().then(withDefinition), { ssr: false }),
  ]),
) as Record<MapId, ComponentType<RegisteredSystemMapProps>>;

/** The System Map with this id. */
export function RegisteredSystemMap({ mapId, ...props }: RegisteredSystemMapProps & { mapId: MapId }) {
  const Map = SYSTEM_MAP_COMPONENTS[mapId];
  return <Map {...props} />;
}
