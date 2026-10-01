# Synthetic parser and scenario fixtures

The alert fixtures and their generators use authored example identities and prose. They exercise provider-shaped envelopes, planned/current periods, direction parsing, accessibility, and independent network boundaries without redistributing a captured provider response. Real station and route names identify the network under test; dates and service events are test inputs.

- `ttc-synthetic-alerts.json` covers route, accessibility, site-wide, and general records.
- `ttc-synthetic-continuous-closure.json` covers a current parent period with no child occurrences.
- `ttc-performance-homepage.html` is a minimal authored HTML parser fixture, not a downloaded TTC page; its percentages are example values.
- `ttc-alert-scenarios/` comes from `scripts/alert-scenario-catalog.mjs` and its synthetic templates.
- `metrolinx-alert-scenarios/` comes from `scripts/regional-alert-scenario-catalog.mjs`.

Edit the catalogs and regenerate using the [scenario workflow](../../../../../docs/operations-guide.md#alert-scenarios). Do not add raw downloaded payloads, real account data, or credentials here.
