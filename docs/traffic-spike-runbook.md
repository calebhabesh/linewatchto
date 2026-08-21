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
(http.request.method in {"GET" "HEAD"}) and
(
  http.request.uri.path in {
    "/api/dashboard"
    "/api/status"
    "/api/map"
    "/api/trains"
    "/api/alerts"
    "/api/performance"
    "/api/accessibility-outages"
    "/api/surface-notices"
    "/api/announcements"
    "/api/stations"
    "/api/alert-history"
    "/api/reliability/lines"
    "/api/regional/trains"
    "/api/regional/trip-changes"
  }
  or starts_with(http.request.uri.path, "/api/stations/")
  or starts_with(http.request.uri.path, "/api/reliability/stations/")
  or starts_with(http.request.uri.path, "/api/regional/stations/")
)
```

Action:

```text
Cache eligibility: Eligible for cache
Edge TTL: Use Cache-Control header if present (Respect origin)
Browser TTL: Respect origin
Cache key: include query string
```

`/api/alerts?type=delay`, `/api/alerts?type=slowdown`, and `/api/alerts?type=planned` share the same path but must remain distinct by query string.
`/api/announcements` also supports query parameters. Keep the query string in the cache key for direct API consumers; the LineWatchTO panel and menu count share one unfiltered read, and the panel searches that result locally to avoid creating an edge-cache entry for every search term.
The origin gives `/api/trains` and `/api/regional/trains` a separate `max-age=0, s-maxage=4, stale-while-revalidate=4` policy. Keep Rule 3 set to respect origin so a newly enabled marker layer is not held behind the dashboard's 30-second shared-cache cadence.

## WAF And Rate Limiting Rules

Create these Cloudflare rules after the cache rules are active. Cloudflare's dashboard currently places zone-level security rules under `Security > WAF`.

Cloudflare Free may allow only one rate limiting rule in the `http_ratelimit` phase. If the dashboard reports a phase rule limit, use the single rate limiting rule for auth and feedback. Public dashboard APIs are lower risk because they are read-only and cacheable.

### Rule 1: Rate Limit Auth And Feedback

Go to `Security > WAF > Rate limiting rules`, select `Create rule`, and use:

```text
Rule name: LineWatchTO auth and feedback burst limit
Expression:
(starts_with(http.request.uri.path, "/api/auth/")) or
(http.request.uri.path eq "/api/feedback")

With the same characteristics: IP
When rate exceeds: 5 requests / 10 seconds
Action: Block
Duration: 10 seconds, or the shortest available duration shown by the dashboard
```

Cloudflare Free may only offer `Block` for rate limiting rules and may only offer short mitigation durations such as 10 seconds. That is acceptable here: clients that continue bursting will continue tripping the rule, while legitimate users who accidentally retry too quickly are not blocked for long.

### Optional Paid-Plan Rule: Rate Limit Public Dashboard APIs

Create this as a second rate limiting rule only if the Cloudflare plan allows more than one rate limiting rule:

```text
Rule name: LineWatchTO public dashboard API burst limit
Expression:
(
  http.request.uri.path in {
    "/api/dashboard"
    "/api/status"
    "/api/map"
    "/api/trains"
    "/api/alerts"
    "/api/performance"
    "/api/accessibility-outages"
    "/api/surface-notices"
    "/api/announcements"
    "/api/stations"
    "/api/alert-history"
  }
) or (
  starts_with(http.request.uri.path, "/api/stations/")
)

With the same characteristics: IP
When rate exceeds: 30 requests / 10 seconds
Action: Block
Duration: 10 seconds, or the shortest available duration shown by the dashboard
```

Keep this rule separate from auth and feedback if the plan supports it. Do not combine the public dashboard APIs into the auth/feedback rule unless you intentionally accept a weaker auth threshold, because one Cloudflare rate limiting rule can only have one threshold. On Free, skip this rule and rely on Cloudflare cache rules, Caddy cache headers, Redis dashboard caching, and surge mode for public dashboard traffic.

### Optional Supported-Plan Rule: Challenge Suspicious Auth And Feedback Traffic

Cloudflare no longer supports `cf.threat_score` in new rules on some zones. On Cloudflare Free, skip this rule if the dashboard says threat score is unsupported. The built-in Cloudflare security layer still evaluates malicious traffic, and the single Free rate limiting rule above remains the required custom protection for auth and feedback.

If the zone has Enterprise Bot Management, go to `Security > WAF > Custom rules`, select `Create rule`, and use:

```text
Rule name: LineWatchTO suspicious auth and feedback challenge
Expression:
(
  (starts_with(http.request.uri.path, "/api/auth/")) or
  (http.request.uri.path eq "/api/feedback")
)
and
(
  (cf.bot_management.score lt 30 and not cf.bot_management.verified_bot)
)

Action: Managed Challenge
```

Do not challenge all `/api/*` traffic by bot score. Some legitimate API-style requests come from browsers, service workers, push flows, health checks, or future automation; keep bot-sensitive rules scoped to auth and feedback unless Security Events show a wider attack. If neither `cf.threat_score` nor `cf.bot_management.score` is available, do not create a custom WAF rule just to satisfy this runbook.

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
curl -I https://linewatchto.ca/api/trains
curl -I https://linewatchto.ca/api/trains
curl -I 'https://linewatchto.ca/api/alerts?type=delay'
curl -I 'https://linewatchto.ca/api/alerts?type=delay'
curl -I https://linewatchto.ca/api/stations/union
curl -I https://linewatchto.ca/api/stations/union
curl -I https://linewatchto.ca/api/alert-history
curl -I https://linewatchto.ca/api/alert-history
curl -I https://linewatchto.ca/api/announcements
curl -I https://linewatchto.ca/api/announcements
curl -I https://linewatchto.ca/assets/linewatch/ttc-subway-map-custom.svg
curl -I https://linewatchto.ca/assets/linewatch/ttc-subway-map-custom.svg
```

Check headers:

```text
cache-control: public, max-age=15, s-maxage=30, stale-while-revalidate=30
cf-cache-status: HIT
```

The train-marker endpoints should instead report:

```text
cache-control: public, max-age=0, s-maxage=4, stale-while-revalidate=4
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

Check the security rules without hammering production:

```bash
for i in $(seq 1 7); do curl -s -o /dev/null -w "%{http_code}\n" https://linewatchto.ca/api/auth/config; done
```

Expected: normal responses first, then Cloudflare challenge or block behavior after the configured threshold. Use `Security > Events` in Cloudflare to confirm the matching rule names and tune thresholds if legitimate traffic is challenged.

## Load Test

Run load tests from a separate machine, not the VPS:

```bash
npx autocannon -c 100 -d 60 https://linewatchto.ca/
npx autocannon -c 300 -d 120 https://linewatchto.ca/
npx autocannon -c 300 -d 120 https://linewatchto.ca/api/dashboard
npx autocannon -c 300 -d 120 https://linewatchto.ca/api/trains
npx autocannon -c 300 -d 120 https://linewatchto.ca/api/stations/union
npx autocannon -c 300 -d 120 https://linewatchto.ca/api/alert-history
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
