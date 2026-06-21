# Staging Production Env Parity Design

Date: 2026-06-21

## Goal

Make staging function like production for owner testing. Staging should exercise the same application behavior as production without copying production-only infrastructure identity or observability settings.

The immediate target is environment parity, not a new feature flag system. The app should behave the same in staging and production for auth, password reset, alert ingestion, scheduled arrivals, performance reads, dashboard cache behavior, and Web Push behavior.

## Scope

Update the tracked environment examples and staging documentation so future staging setup starts with production-functional values. Update the ignored local `.env.staging` on the development server to match production-functional behavior while keeping staging secrets and isolation values separate.

No real secrets should be added to Git. Production credentials, staging credentials, Cloudflare tunnel tokens, SMTP passwords, VAPID private keys, Grafana tokens, and analytics tokens remain untracked local values.

## Parity Boundary

These values should match production because they affect application behavior:

- Auth secure-cookie mode.
- Auth rate-limit enablement, window, and request caps.
- Password-reset dev-link behavior.
- Password-reset email enablement and SMTP wiring shape.
- Alert ingestion enablement, source URL, polling interval, freshness window, and HTTP timeouts.
- Scheduled-arrival provider, horizon, arrival count, GTFS import mode, GTFS refresh mode, refresh URL, refresh delays, and service-day threshold.
- TTC performance enablement, source URL, HTTP timeouts, refresh interval, and max age.
- Dashboard cache enablement and TTLs.
- Web Push enablement, evaluation delay, and VAPID configuration shape.
- Runtime heap setting where it affects production-like GTFS refresh behavior.

These values may differ because they identify or isolate the environment:

- `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`.
- Staging hostname, public origin, local HTTP port, Compose project, build label, smoke origin, and Cloudflare tunnel values.
- `LINEWATCH_ENVIRONMENT`, observability host, and observability Compose project.
- Public URLs such as allowed origins and password-reset frontend base URL.
- Secret values for SMTP, VAPID, databases, tunnels, Grafana, and analytics.
- Optional Grafana/Alloy and Cloudflare Web Analytics values. These are not required for owner-only functional staging unless observability or visitor analytics are explicitly under test.

## Implementation Shape

Keep `.env.production.example` and `.env.staging.example` as separate files because staging needs extra staging-only variables and different URLs. Align the functional defaults between them instead of introducing shared env-file layering.

Update `.env.staging.example` so its functional values mirror production:

- Production rate-limit caps instead of looser staging caps.
- `LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false`.
- Password-reset email enabled by default in the example, with empty or clearly fake SMTP secret values.
- Production alert freshness and polling values.
- Production performance refresh and cache TTLs.
- Production Web Push enablement and evaluation delay, with empty or clearly fake staging VAPID secret values.
- `JAVA_TOOL_OPTIONS=-Xmx4g` for production-like GTFS refresh headroom.

Update the ignored `.env.staging` on the local development server with the same functional values, replacing only staging-specific credentials with staging-owned secrets or intentionally blank values as needed.

Update `docs/staging.md` to describe staging as production-functional by default and to document the allowed differences. Remove guidance that encourages disabling push or using password-reset dev links for normal staging parity.

Add a small parity check script if it can stay simple and secret-safe. The script should compare selected functional keys across env files and ignore environment identity, URLs, secrets, and observability-only keys. It should print mismatches without printing secret values.

## Verification

Run formatting-free checks suitable for environment and docs changes:

- `scripts/staging-compose.sh config` after local `.env.staging` is updated, if Docker Compose is available.
- The parity check script, if added.
- A shell syntax check for any new or edited script.

Frontend and backend test suites are not required for env-template and documentation-only changes unless code behavior changes.

## Risks

Enabling production-like email and push in staging means staging can send real emails or notifications when configured with working credentials. This is intentional for functional parity but should use staging-owned credentials and the staging hostname.

If staging runs from the current checkout while production runs published images, environment parity alone does not prove binary parity. Release validation should still test the intended commit or image tag before production deployment.
