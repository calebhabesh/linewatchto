import type { GeographicCatalog } from "./geographic-catalog.ts";
import { getCatalogUrl } from "./geographic-config.ts";
import type { NetworkId } from "./regional-data.ts";

const catalogs = new Map<NetworkId, GeographicCatalog>();
const requests = new Map<NetworkId, Promise<GeographicCatalog>>();

export function cachedGeographicCatalog(network: NetworkId) {
  return catalogs.get(network) ?? null;
}

export function loadGeographicCatalog(network: NetworkId): Promise<GeographicCatalog> {
  const cached = catalogs.get(network);
  if (cached) return Promise.resolve(cached);
  const pending = requests.get(network);
  if (pending) return pending;
  const request = fetch(getCatalogUrl(network)).then(async response => {
    if (!response.ok) throw new Error(`Unable to load map routes (${response.status}).`);
    const catalog: GeographicCatalog = await response.json();
    if (catalog.network !== network || !Array.isArray(catalog.features)) {
      throw new Error("Invalid geographic map routes.");
    }
    catalogs.set(network, catalog);
    return catalog;
  }).finally(() => requests.delete(network));
  requests.set(network, request);
  return request;
}
