# Traffic Spike Runbook

LineWatchTO is designed to tolerate public traffic spikes first through cheap reads and short-lived edge caching, not Kubernetes. This runbook assumes the current single Oracle Ampere VPS remains the origin.

## Scope

This runbook covers public, anonymous dashboard traffic:

- `linewatchto.ca`
- `www.linewatchto.ca`
- `api.linewatchto.ca`

It must not cache account, auth, push, feedback, or write endpoints.

## Baseline Origin Risk

The dashboard is map-first and mostly public, but visible clients refresh periodically. The production default should be `30s`, with surge builds allowed to use `60s`.

During a spike, total visitors matter less than active visible sessions:

```text
active sessions ~= visits per minute * average visible session minutes
origin read pressure ~= active sessions / dashboard refresh interval
```

## Cloudflare Free Setup

1. Add `linewatchto.ca` to Cloudflare.
2. Change registrar nameservers to the Cloudflare nameservers.
3. DNS records:

```text
Type  Name  Target        Proxy
A     @     <Oracle IP>   Proxied
A     www   <Oracle IP>   Proxied
A     api   <Oracle IP>   Proxied
```

4. SSL/TLS mode: `Full (strict)`.
5. Keep Caddy serving HTTPS on the VPS.
6. Do not use Cloudflare Flexible SSL.

## Cache Rules

Create Cloudflare Cache Rules in this order.

### Rule 1: Bypass Private And Operational APIs

Expression:

```text
(starts_with(http.request.uri.path, "/api/auth/")) or
(starts_with(http.request.uri.path, "/api/account/")) or
(http.request.uri.path eq "/api/feedback") or
(starts_with(http.request.uri.path, "/api/health")) or
(starts_with(http.request.uri.path, "/actuator"))
```

Action:

```text
Cache eligibility: Bypass cache
```

### Rule 2: Cache Static Assets

Expression:

```text
(starts_with(http.request.uri.path, "/_next/static/")) or
(starts_with(http.request.uri.path, "/assets/"))
```

Action:

```text
Cache eligibility: Eligible for cache
Edge TTL: 1 month
Browser TTL: Respect origin
```

### Rule 3: Cache Public Dashboard APIs

Expression:

```text
(http.request.uri.path in {
  "/api/dashboard"
  "/api/status"
  "/api/map"
  "/api/alerts"
  "/api/performance"
  "/api/accessibility-outages"
  "/api/surface-notices"
})
```

Action:

```text
Cache eligibility: Eligible for cache
Edge TTL: 30 seconds
Browser TTL: Respect origin
Cache key: include query string
```

`/api/alerts?type=delay`, `/api/alerts?type=slowdown`, and `/api/alerts?type=planned` share the same path but must remain distinct by query string.

## Surge Mode

Use surge mode before a known advertisement or public post.

Build frontend with:

```bash
NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS=60000 scripts/prod-build-push.sh
```

Deploy normally:

```bash
scripts/prod-deploy.sh <full-git-sha>
```

Recommended surge settings:

```text
Dashboard refresh: 60s
Cloudflare public API edge TTL: 30s
Caddy public API s-maxage: 30s
Redis dashboard TTL: 30s
```

After the spike, rebuild with the default:

```bash
NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS=30000 scripts/prod-build-push.sh
scripts/prod-deploy.sh <full-git-sha>
```

## Verification

Run twice for public API paths. The second request should usually be `HIT` or `REVALIDATED` once Cloudflare is proxying and the rule is active.

```bash
curl -I https://linewatchto.ca/api/dashboard
curl -I https://linewatchto.ca/api/dashboard
curl -I 'https://linewatchto.ca/api/alerts?type=delay'
curl -I 'https://linewatchto.ca/api/alerts?type=delay'
curl -I https://linewatchto.ca/assets/linewatch/ttc-subway-map-edited.svg
curl -I https://linewatchto.ca/assets/linewatch/ttc-subway-map-edited.svg
```

Check headers:

```text
cache-control: public, max-age=15, s-maxage=30, stale-while-revalidate=30
cf-cache-status: HIT
```

Private paths must not cache:

```bash
curl -I https://linewatchto.ca/api/auth/config
curl -I https://linewatchto.ca/api/account/commutes
curl -I https://linewatchto.ca/api/feedback
```

Expected:

```text
cache-control: no-store
cf-cache-status: BYPASS, DYNAMIC, or MISS that does not become HIT
```

## Load Test

Run load tests from a separate machine, not the VPS:

```bash
npx autocannon -c 100 -d 60 https://linewatchto.ca/
npx autocannon -c 300 -d 120 https://linewatchto.ca/
npx autocannon -c 300 -d 120 https://linewatchto.ca/api/dashboard
```

Watch Grafana:

- CPU by container.
- Backend p95 and p99 latency.
- HTTP 5xx rate.
- JVM heap and GC pauses.
- Hikari pool usage.
- Redis latency/errors.
- Postgres CPU and connections.
- Caddy request rate.

Stop increasing load if p95 exceeds 1s, 5xx responses appear, or CPU is pinned for more than a few minutes.

## Rollback

If Cloudflare caching causes stale or incorrect behavior:

1. Disable Rule 3 first.
2. Purge Cloudflare cache for `/api/*`.
3. Keep static asset caching enabled.
4. If private data is ever observed in a cached response, disable all API cache rules immediately and investigate before re-enabling.
