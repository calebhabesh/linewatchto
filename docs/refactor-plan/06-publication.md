# Public repository readiness

Read the [index](README.md). These are publication preparation tasks, not a
claim that the current repository is unsafe or cleared for release. Code
license selection and source/asset approval evidence remain owner tasks, as
agreed in the interview. This plan neither changes repository visibility nor
authorizes deployment/history rewriting.

## P1 — Inventory materials and publication decisions early

**Evidence:** no root `LICENSE`, contribution guide or security policy was
found in tracked files. [README's license section](../../README.md), line 1172,
contains an unofficial-project disclaimer.
[Existing source gates](../source-licensing-launch-gates.md) record written
approvals required for specified sources/assets/names. They are project policy;
this audit did not establish their current external approval status.

The [TTC scenario catalog](../../scripts/alert-scenario-catalog.mjs) contains
synthetic-template and modeled source origins; the
[regional catalog](../../scripts/regional-alert-scenario-catalog.mjs) includes
reviewed samples and synthetic records. Fonts, authored/derived maps,
screenshots and generated catalogs also ship in the tree. Treat their
provenance separately from application code ownership.

1. Inventory tracked code, fixtures, raw/captured samples, maps, fonts, images,
   catalogs and generated outputs. Record provenance, existing notice, whether
   redistribution evidence is available, and an owner disposition. Inspect
   font families individually; one font's notice does not cover all fonts.
2. Perform a redacted secret scan of the current tree and the history/refs
   intended for publication. Review examples, fixture captures, logs, workflow
   and deployment material. `.gitignore` and a clean worktree do not prove
   history is clean. Record paths/categories, never secret values in this plan.
3. Have the owner choose the code license and provide existing approvals or
   choose permissible replacements/exclusions. Record approval evidence in
   the private location required by the source guide. Obtain current primary
   terms when assessing a specific source; this plan is not a legal conclusion.
4. If a credential is found, privately arrange revocation/rotation before any
   publication. History rewriting requires a concrete reviewed scope and
   separate authorization. Public-source availability is not proof of rights
   to publish a captured raw payload in a repository.

**Done:** the exact intended publication tree/history has an evidence-backed
disposition; owner decisions are resolved or explicitly block publication of
the affected materials. Repository publication and operation of live providers
are separate checks. Keep unrelated refactor work moving while owner tasks
remain open. No secret/history/license scan was completed in this planning pass.

## P2 — Portable setup and useful tooling

**Evidence:** [generate_og_blur.js](../../frontend/generate_og_blur.js), lines
6/76, and [generate_og_glass.js](../../frontend/generate_og_glass.js), lines
6/98, embed personal image paths. Map input paths are addressed by M6.
[next.config.ts](../../frontend/next.config.ts), lines 21–22, includes fixed
private LAN dev origins alongside `LINEWATCH_DEV_ALLOWED_ORIGIN`. Those IPs are
portability details, not evidence of exposed credentials.

**Change:** give retained tools explicit input/output arguments or documented
configuration. Determine whether the two OG variants remain useful before
keeping both; archive/remove only with caller/output evidence. Make local dev
origins configurable. Preserve public localhost/fixture setup and document
optional authoring tools without requiring personal assets for a normal build.

Inventory scripts by entry point, owner, required inputs, output and test.
Retain useful compatibility aliases:
[dev-live-backend.sh](../../scripts/dev-live-backend.sh) forwards to
[dev-backend-live.sh](../../scripts/dev-backend-live.sh) and is used by current
README/guidance/tests. The `.js` mock-server wrapper also needs a caller check
before removal; forwarding alone is not enough reason to delete a script.

**Acceptance:** fresh checkout using the lockfile can install, typecheck/build,
run the fixture dashboard, and start documented local backend infrastructure
without private directories or provider credentials. Optional live providers
stay opt-in. Asset generation has an explicit source-availability statement.
Validate modified CLIs with representative input/error paths; use existing
script tests and [operations routing](../operations-guide.md) when relevant.

**Done:** normal setup is reproducible, optional tools have honest prerequisites,
and wrappers/configuration have an identified purpose.

## P3 — Current documentation and contributor entry points

**Evidence:** [HANDOVER.md](../../HANDOVER.md), dated June 1, says live reads
have not switched to normalized alerts. [REMAINING_TASKS.md](../../REMAINING_TASKS.md),
dated June 2, instructs new sessions to implement work that current code/docs
already describe as implemented. The README spans over 1,100 lines, mixing
setup, product inventory, operations and historical portfolio language.
[CSS progress](../globals-css-refactor-progress.md) is a large historical log
whose metrics do not establish current health.

**Change:** mark historical handoffs as historical with a current entry-point
link, or move them to an archive and repair inbound links. Preserve decisions
that explain unusual code; remove misleading "start here" instructions.
Keep README focused on purpose, current capabilities/limits, screenshot/demo,
quickstart, architecture outline and links to existing runbooks/reference.
Avoid creating another synchronized feature inventory.

Add concise contribution instructions for setup, test tiers, safe fixture use,
and generated assets. Add a security-reporting route chosen by the owner; do
not invent contact details. Incorporate the selected license and required
notices after P1 decisions. Update scoped agent ownership pointers alongside
the chunk that moves the owner, observing their length limits.

**Acceptance:** a reader can find the real map/session/backend owners and run
the demo without historical plans; internal links resolve; documented commands
match scripts; capabilities match current code and tested behavior. Docs-only
edits need diff/link review, not application suites.

**Done:** one obvious current entry path, historical documents clearly labeled,
and no contradictory active handoff instructions.

### P3a — Final agent-guide reconciliation

Run after application/CSS refactoring and T1–T5 test cleanup, before P4/V2
sign-off. Ownership pointers still change with each implementation chunk;
this final review verifies guidance against the settled structure and commands.

Inventory all repository `AGENTS.md` files, including any added during the
refactor. Currently these are the [root](../../AGENTS.md),
[frontend](../../frontend/AGENTS.md), [backend](../../backend/AGENTS.md), and
[mobile](../../mobile/AGENTS.md) guides. For each:

1. Verify owner paths and architecture descriptions against real imports and
   entry points. Replace retired pointers with the smallest useful current
   entry point, rather than listing every extracted module.
2. Verify commands and test-selection guidance against package scripts,
   Maven/Playwright configuration, CI, and T3/T5 results. Distinguish focused
   iteration, final layer checks, integration checks, and release gates.
3. Check inherited and scoped instructions for contradictions, duplicated
   rules, obsolete migration instructions, and broken reference links. Keep
   durable domain/security/compatibility constraints unless evidence supports
   an explicit change; their age alone does not make them obsolete.
4. Keep the root under 100 lines and scoped guides under 80. Link detailed
   procedures and historical context on demand. Preserve `AGENTS.md` as the
   unified guidance; do not recreate retired `GEMINI.md` inventories.
5. Walk representative tasks using only the guides: a local CSS edit, a
   dashboard/session change, a map geometry change, and a backend persistence
   change. Confirm each routes to the current owner, relevant invariant and
   proportional verification without loading unrelated references.

**Done:** every guide has a recorded reviewed/updated disposition, owner paths
and links resolve, commands match the final suite, line limits hold, and task
routing has no contradictory requirements. Record this in the main handoff.
Use diff/link/configuration review and existing test evidence; documentation
edits alone do not require rerunning application suites.

## P4 — Final CI and publication evidence

**Evidence:** [CI](../../.github/workflows/ci.yml) runs backend tests and the
frontend fast/type/lint/build/smoke/geometry/map-fit gates. Shell, account,
offline and geographic lifecycle checks are outside its explicit main
catalog. Infrastructure script tests also live outside this workflow's
current performance-tool test step.

**Change:** reconcile the checks in [verification](01-verification.md) with
the final changed surfaces and the completed [test-suite cleanup](07-test-suite.md).
Use T3/T5's discovery and execution results for final CI decisions rather than
maintaining a second test inventory. Add a small, deliberate CI gate for essential
uncovered flows, or document an explicit release command that runs them.
Keep feature regression out of the small smoke catalog unless failure makes
the dashboard broadly unusable. Include affected operational script tests
when their code changes. Avoid adding every test to every job without purpose.

Audit actual dependency use after code removals across client, server, build,
CSS/plugins and scripts. Remove only confirmed unused dependencies with
lockfile updates and affected build/runtime verification. A transitive tooling
import (for example the CSS metrics parser) needs declared, reproducible
ownership if retained. Review current vulnerability/license information at
implementation time; no package security assessment was performed here.

**Acceptance:** final required checks run against the actual release candidate,
with known environment gaps explicit. Validate a clean fixture setup and
source-honest offline fallback. Confirm private raw-data/admin/management
boundaries remain enforced if related configuration changed. Close P1's owner
decisions and any source-availability gaps before claiming publication ready.

**Done:** the owner has a concrete publication candidate with current setup,
checks, provenance and unresolved decisions plainly recorded. Refactor
completion alone does not change repository visibility or launch a service.
