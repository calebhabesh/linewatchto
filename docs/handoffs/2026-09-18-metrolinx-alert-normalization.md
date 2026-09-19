# Metrolinx alert normalization implementation handoff

Status: agreed design; implementation has not started. Intended implementer: Sol 5.6 medium.

## Objective and constraints

Correct misleading GO/UP alert timing, effect classification, and affected station segments. Implement deterministic normalization using existing infrastructure, with no AI dependency, paid API, or new paid service. The user accepted conservative coverage: ambiguous notices remain visible with explicit uncertainty instead of receiving unsupported active map impacts. Ordinary hosting costs remain; this design adds no model service costs.

Read the root and relevant scoped AGENTS.md before editing. For source interpretation, follow [source launch gates](../source-licensing-launch-gates.md) and the affected sections of [domain invariants](../domain-invariants.md). Preserve unrelated working-tree changes. This handoff authorizes implementation work, not production deployment.

## Findings to verify against the current code

Read-only inspection identified the following failure mechanisms; these are not a reproduced diagnosis using the exact production payloads. Files below are under `backend/src/main/java/com/calebhabesh/linewatch/regional/`.

- `RegionalAlertTextDateParser`: requires one extracted date range to contain all other mentioned ranges. A September 19–20 closure plus a September 21 resumption or adjustment can return no text window.
- `MetrolinxAlertNormalizer`: falls back to source periods after text-date failure, potentially treating notice visibility as current disruption. Missing start timing can also fall through to current classification.
- The normalizer selects first/last mentioned stations for some span extraction, mixing disrupted segments with segments explicitly operating normally.
- Multiple structured active periods are aggregated into earliest start/latest end, potentially bridging unaffected gaps.
- `RegionalAlertClassification` represents one window/effect/span per event, limiting faithful interpretation of composite notices.
- `RegionalAlertStore` and `RegionalDashboardService` consume persisted impact kinds; planned/current projection needs reevaluation as time passes independently of notice wording changes.
- Existing `MetrolinxAlertNormalizerTest` UP examples omit the separate Monday adjustment that triggers the multi-date weakness. Verify and extend coverage rather than assuming the similar fixture reproduces the report.

Useful existing fields include REST line/stop codes, trip numbers, subject/body, category/subcategory and publication time; GTFS informed entities, cause/effect and active periods; and cross-source IDs and provenance. Establish each field's semantics before treating it as authoritative service timing or geographic scope.

## Agreed behavior

1. One source notice may produce several linked impacts. Each impact can carry its own effect, scope, direction, windows, evidence and uncertainty. Preserve the relationship to the original notice and existing source deduplication.
2. Separate publication/update/visibility timestamps from effective service windows. Preserve disjoint windows. Model planned/current/ended as time-dependent state, separately from closure, replacement service, delay or timetable effect.
3. Interpret relevant clauses using structured fields and known route/station topology as anchors. Bind dates and station pairs to the statement they describe. Continuing service, resumption, negation and restoration must not become disrupted segments.
4. Derive current state from validated windows in America/Toronto and independently reevaluate it without requiring a new notice or changed text. Freshness, withdrawal and validity still govern whether a retained event can support current claims. Expiry alone is not proof of restoration.
5. Preserve uncertain notices as advisories with timing/scope uncertainty. Unsupported interpretations cannot generate definite closure overlays, definite closure notifications or verified disruption time. Relevant unknown status must not turn into an unjustified all-clear. Known timing and unknown scope, or the reverse, should retain the independently supported facts.
6. Resolve relative wording against trustworthy publication context, never the time a parser reruns. If context is missing or contradictory, preserve uncertainty. Do not invent an hour for “late evening.” Define and test date-only boundaries, overnight windows and DST behavior explicitly.
7. Keep frontend presentation conventional: planned closures, active impacts and advisories. There is no AI overview or model-generated presentation. Maintain consistent classifications across map, list, counts and detail views.
8. Keep ordinary timetable adjustments in the existing Service Notice category where domain invariants require it; a separate Monday adjustment does not extend a weekend closure.

## Reported examples and acceptance cases

Use synthetic minimal fixtures representing the wording; keep retained provider payloads and credentials out of Git. If authorized retained records are available, inspect them server-side to verify production behavior.

| Case | Required outcome |
| --- | --- |
| UP notice titled September 19–20, also mentioning Monday September 21 schedule changes | Weekend replacement/closure window stays separate from Monday timetable adjustments. Before its window, the weekend impact is planned, not current. |
| Same UP notice says “starting late-evening tonight” | Preserve an additional advisory for the imprecise earlier start; do not invent a start hour or silently ignore the clause. |
| Barrie closure October 3–4 | Planned before the effective dates; current during supported windows with fresh valid source data. The exact October payload was not supplied in this conversation. |
| Barrie says no service Union–Downsview Park, but trains run Aurora/Allandale–Downsview Park | Only the explicitly disrupted segment is eligible for a closure overlay; continuing service is not a closed segment. |
| Two service windows with a gap | No current closure during the gap. |
| Notice unchanged as a boundary passes | Planned/current/ended projection updates without republication. |
| Unknown timing or conflicting evidence | Visible uncertainty; no default-to-current closure and no false all-clear. |
| Source becomes stale, revises the notice, withdraws it, or a supplemental collection fails | Preserve existing independent freshness/failure rules; obsolete interpretations cannot assert fresh service impacts. |

Screenshot caveat: the initial Barrie screenshot visibly said September 19–20, although the user separately reported an October 3–4 example. Do not claim the screenshot proves the October dates. The UP screenshot also displayed BR and Union–Oakville overlap badges: inspect whether overlap matching introduces an independent scope bug, and cover it if reproduced.

## Implementation and validation sequence

1. Reproduce the date and station-binding weaknesses with focused regression tests. Trace normalized records through persistence and affected consumers. Completion: each confirmed failure has a minimal failing case and an identified downstream path.
2. Implement the multi-impact/window representation, evidence-aware deterministic parsing and explicit uncertainty. Choose schema/API details from current repository patterns; include migration/backward compatibility handling if persistence changes. Completion: the acceptance cases have supported representations without collapsing windows or effects.
3. Implement time projection and consistent dashboard/map/advisory behavior. Audit commute matching, push, history and reliability consumers for changes in identity, deduplication and temporal semantics. Completion: uncertain impacts cannot leak into definite downstream claims, and supported impacts transition without new provider text.
4. Compare old/new interpretations without changing production rider behavior, using a reproducible local or staging evaluation. Report incorrect active claims and unresolved notices separately; unresolved notices are an accepted outcome, not automatically a parser failure. Completion: reviewed examples and remaining limitations are recorded, with a controlled enable/rollback mechanism appropriate to existing patterns.
5. Run affected-layer final checks once stable, using [testing guidance](../testing.md). Include clock-controlled boundary tests and meaningful regressions for revisions, freshness and downstream effects. Enable notification/reliability behavior only after their relevant checks pass. Completion: report checks, gaps and enablement state honestly; do not present untested or disabled paths as complete.

## Handoff prompt

Implement `docs/handoffs/2026-09-18-metrolinx-alert-normalization.md`. The user has approved the deterministic approach and conservative uncertainty behavior. Start with reproducing the documented failure patterns, then implement and validate the required normalization, temporal projection and consumer changes. Use no AI dependency or paid service. Preserve unrelated edits and follow repository guidance. Finish with changed behavior, verification results, remaining limitations and rollout state; do not deploy to production as part of this task.
