/**
 * One routes.txt record per route_short_name.
 *
 * A GTFS feed spanning two schedule periods can list a route once per period
 * under different route_ids: GO 20261117113605 had 09261126-11 (to Nov. 27)
 * and 11260127-11 (from Nov. 28) for route 11. The generators count trips by
 * short name, and the catalogs and search index list each route once, so a
 * route's summary comes from one record: the first with trips in the sampled
 * service, else the first listed.
 *
 * @template {{ route_id: string, route_short_name: string }} Route
 * @param {Iterable<Route>} routes
 * @param {Set<string>} sampledRouteIds route_ids with trips in the sampled service
 * @returns {Route[]} in first-listed order of each short name
 */
export function routesByShortName(routes, sampledRouteIds) {
  const kept = new Map();
  for (const route of routes) {
    const current = kept.get(route.route_short_name);
    if (!current || (!sampledRouteIds.has(current.route_id) && sampledRouteIds.has(route.route_id))) {
      kept.set(route.route_short_name, route);
    }
  }
  return [...kept.values()];
}
