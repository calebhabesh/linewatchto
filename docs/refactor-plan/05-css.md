# CSS verification and cleanup

Read the [index](README.md), [frontend guide](../../frontend/AGENTS.md), and
[verification](01-verification.md). Preserve the successful import manifest
and feature-owned stylesheet structure. The previous refactor documents are
historical context; their measurements and passing results are not a baseline
for the current source.

## C1 — Measure the actual stylesheet graph

**Evidence:** [measure-css.mjs](../../frontend/scripts/measure-css.mjs), lines
137–174, analyzes only `globalsRaw` for rules/declarations/keyframes while
summing bytes and lines across authored CSS. The manifest intentionally has
no rules. Its Markdown output can therefore report zero structural debt while
the imported graph contains the application's styles. It also reads `.next`
without verifying the build matches the source.

**Change:** report these as distinct populations:

- Entry manifest: imports and manifest-only properties.
- Resolved application import graph: authored rules, declarations,
  `!important`, media blocks, duplicate keyframes and selector statistics.
- Other authored component/module styles: separate inventory or clearly
  accounted totals, with no double counting.
- Built CSS: files and raw/gzip sizes tied to a known build commit/configuration.

Reuse the resolution logic in
[stylesheet-graph.mjs](../../frontend/tests/helpers/stylesheet-graph.mjs),
extracting a shared tooling helper if needed. Account for local imports,
repeated imports, missing paths and cycles; distinguish vendor/Tailwind output
from authored rules. Use an AST for structure; selector regex counts are
approximate and cannot prove unused classes.

**Acceptance:** a small imported fixture graph produces nonzero, known counts,
and its entry-only metrics stay distinct. Component styles are accounted for.
An absent/unverified build is labeled unknown, never attributed to current
HEAD. Preserve existing metric consumers or update them together. Test only
the meaningful graph/count behavior and affected architecture helpers.

**Done:** future cleanup has truthful before/after values. No application
build is needed merely to prove the metrics algorithm; obtain a matching build
only when measuring production CSS.

## C2 — Prove retired styles, then delete them

Depends on the relevant M2/F7 producer cleanup. **Evidence:** old map-specific
selectors in [impact-overlays.css](../../frontend/src/styles/map/impact-overlays.css),
lines 1–39, and `.asset-map-stage` in
[dashboard-shell.css](../../frontend/src/styles/shell/dashboard-shell.css),
lines 103/279/305, point toward the disconnected map. Older capsule/menu
selectors also need current shell-producer checks. Neither naming nor a failed
literal-class search proves that a selector is unused.

Create a short candidate ledger for the family being edited:

| Selector/rule | Owning file | Producer/import/asset evidence | States checked | Decision |
| --- | --- | --- | --- | --- |
| Candidate under review | Actual stylesheet | JSX, composed class, DOM mutation, SVG, generator or none | Theme/layout/interaction | Retain / remove / unresolved |

Inspect dynamic class composition, `classList`/SVG mutations, data attributes,
authored SVG IDs/classes, generated markup, CSS Modules, animation-name uses,
custom-property consumers, pseudo-elements and conditional UI. Browser CSS
coverage is supporting evidence for exercised states, not a global dead-code
oracle. An unexercised account/error/offline state is not permission to purge it.

Start with styles exclusive to M2's retired renderer. Remove the dead producer,
exclusive rules, obsolete test and active documentation pointer together.
Then examine one shell/control family. Keep live `FloatingPanelShell`, count
badges, and `asset-alert-path` variants despite historical names.

**Acceptance:** reference review plus affected rendered states; no missing
focus/hover/selected/loading/error/exit behavior. For shared rules inspect both
networks, relevant themes, high contrast and reduced motion, 360px and 1440px,
and both sides of a changed breakpoint. Confirm intentional map panning and
internal scroll remain distinct from page overflow.

**Done:** each deletion has positive retirement evidence; unresolved candidates
are retained with the missing evidence noted. Local deletions use focused
inspection; global/shared visual changes receive the final visual gate.

## C3 — Simplify one cascade family at a time

After C1/C2, select a family with demonstrated duplicate/conflicting rules.
Read all its theme, responsive and later-import overrides before editing.
Current [CSS architecture guardrails](../../frontend/tests/css-architecture-guardrails.test.mjs)
freeze intentional import order and debt ceilings. Keep those protections;
update a ceiling downward only after measuring the actual change.

**Change:** consolidate redundant declarations under the owning stylesheet
without changing cascade order or specificity unintentionally. Replace an
implementation-string assertion only when a computed-style, layout, or
interaction check preserves its purpose. An existing test that demands a
literal declaration is not evidence that the cascade needs that declaration.

**Acceptance:** compare computed styles/layout for the changed family in all
applicable states, including animation exit pointer behavior. Review visual
diffs before accepting snapshots; do not blanket-update baselines. Re-measure
the graph and matching built output when making byte/debt claims. Reuse
unchanged passing results under the verification policy.

**Done:** fewer competing rules and a clear owner, with unchanged appearance
and behavior. Leave necessary overrides intact. This is not a blanket
`!important` removal, CSS Modules migration, utility rewrite, or purge pass.
Stop when remaining rules have a purpose rather than chasing an arbitrary
line-count target.
