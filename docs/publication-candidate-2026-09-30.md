# Publication candidate — September 30, 2026

Status: repository privacy/history and attribution preparation complete.
Dependency fixes and their validation are recorded in the
[security follow-up](dependency-security-review-2026-09-30.md). Publication and
production deployment remain separate owner transitions.

## Candidate and preserved history

The isolated publication copy is the sibling checkout `../linewatchto-publication`.
The original `linewatchto` repository retains its existing private Git history and
refs. Working-file improvements remain available there for review.

- All **1,325 original reachable commits** are preserved, followed by publication
  preparation/evidence commits and the dependency security follow-up. No squashed
  initial snapshot was substituted.
- Author and committer identities and timestamps, encoding fields, and mapped
  parent relationships match for every original commit: **zero mismatches**.
- Three branches (`main`, `feat/mobile-prototype`, `feature/go-up-network-mode`)
  and the `predeploy-official-metrics-redis` tag are retained with sanitized targets.
- Commit and tag IDs change where content or ancestry changes. **41 commit
  messages** have privacy redactions or translated commit references; their
  development narratives remain. Signature hashes, where present, cannot certify
  rewritten objects. Historical checkouts are not individually build-certified.
- The sanitization adjusted **414 distinct text blobs**.
  Personal workstation home paths and the known workstation LAN address are
  absent from the rewritten history. The LAN example uses an RFC 5737 documentation
  address. Generic deployment-account paths, loopback, Android emulator, proxy,
  private-network test values, and Terraform CIDRs retain their functional roles.
- The sanitized preparation commit is `a7049e854b5f4d0ea3b91ef4425e367bea7dbabd`. The following evidence commit
  records the initial verification; the security follow-up extends that candidate.

The private old/new commit map remains under `.git/filter-repo/`; it is not a
tracked publication file. The candidate has no configured remote, no original
backup refs, and no unreachable objects reported by Git's integrity check.

## Source samples and authored assets

Captured TTC route/accessibility records and reviewed regional examples were
replaced with authored synthetic identities and prose. Their envelopes, route and
station matching, time boundaries, accessibility cases, and direction coverage
remain tested. The history rewrite makes the equivalent substitutions in old
fixtures, catalogs, test references, and demo diagnostic records. The unused
archived GTFS-RT response is removed from every reachable revision.

The owner explicitly chose to publish the Inkscape-authored maps with TTC and
Metrolinx reference credits. The SVG maps, raster planes, and four live production
README screenshots are byte-identical to the reviewed source candidate. The
[credits and third-party notices](../THIRD_PARTY_NOTICES.md) distinguish authored
work, source references, open data, fonts, and third-party names/marks. This records
an owner decision, not a claim of agency approval. Live integration agreements
remain private and separate from repository visibility.

## Verification

| Check | Result |
| --- | --- |
| Original commit retention and metadata/topology comparison | 1,325 retained; zero mismatches |
| Git object/ref integrity and original repository preservation | Passed |
| Gitleaks 8.30.1, default rules, all candidate refs, fully redacted | Zero findings |
| Gitleaks working-file export | Zero findings; repeated after the security follow-up |
| Known personal path/address and captured-example identity scan | Zero matches in reachable text blobs |
| Non-example environment files and archived raw-feed path in history | None |
| Fresh candidate frontend fast tests | Passed |
| Fresh candidate frontend typecheck | Passed |
| Fresh candidate frontend lint | Passed; 18 warnings, zero errors with updated Next.js ESLint rules |
| Fresh candidate backend tests | 1,219 passed; zero failures/errors/skips |
| README images, source dates, Mermaid diagrams, and local links | Reviewed; no broken image or local link targets |

The checks cover the candidate's complete locally reachable history; every branch
and tag advertised by the private GitHub remote was represented locally when
checked. No pull-request refs were advertised. Git LFS objects, GitHub-retained
unadvertised PR/cache objects, and deployed accounts are outside the scan. Public
screenshots were manually reviewed; no automated OCR certification is claimed.
The initial fixture/copy preparation did not rerun the browser release tiers.
The subsequent security follow-up verifies the relevant release tiers across
Chromium, Firefox, and container-hosted WebKit; see its verification table.

## Dependency security follow-up

The initial npm audit reported **9 vulnerable packages**, including critical
entries for Next.js and MapLibre. The follow-up updates the frontend lockfile and
backend dependencies: current npm and resolved Maven/OSV checks report **zero
findings**. See the [security review](dependency-security-review-2026-09-30.md)
for versions, scan scope, validation, and remaining platform/deployment work.
Publishing source changes does not deploy those fixes to the running service.

## GitHub publication procedure

Publish the sanitized copy, rather than changing visibility on the old remote
while its original history is still present. Keep the original checkout as the
private backup; after the transition, use a fresh clone of the sanitized history
for ongoing development so old commits are not merged back into the public repo.
The existing GitHub repository becomes the public development home; a second
private GitHub repository is not required. Keep the old local clone or an offline
backup as the private archive. Develop features, fixes, and dependency updates on
branches in the sanitized repository and use its existing pull-request/CI flow.

For the existing private GitHub repository `calebhabesh/linewatchto`, the reviewed
remote refs can be replaced atomically with explicit leases:

```bash
cd ../linewatchto-publication
git remote add origin git@github.com:calebhabesh/linewatchto.git
git push --atomic \
  --force-with-lease=refs/heads/main:941f0c51af50075940831c0d584d78df3b6618da \
  --force-with-lease=refs/heads/feat/mobile-prototype:7fac03d8a689469fcfafcce7b2f27b475dc3b1a4 \
  --force-with-lease=refs/heads/feature/go-up-network-mode:6f6c544f603652c773e16258cdf55b583cd61b54 \
  --force-with-lease=refs/tags/predeploy-official-metrics-redis:598d1ffa548ec2b43ccbf5387dcb3e102a8656d3 \
  origin \
  refs/heads/main:refs/heads/main \
  refs/heads/feat/mobile-prototype:refs/heads/feat/mobile-prototype \
  refs/heads/feature/go-up-network-mode:refs/heads/feature/go-up-network-mode \
  refs/tags/predeploy-official-metrics-redis:refs/tags/predeploy-official-metrics-redis
```

These leases are tied to the remote tips reviewed for this candidate. If the
remote advances, the push must fail; review those changes and refresh the candidate
before continuing. This updates all three branches and the tag together. Do not
use `git push --mirror`, which can publish unintended administrative refs.

After a successful update, verify the advertised remote refs match the candidate
and clone the still-private remote afresh to repeat the history scan. Check GitHub
pull-request/cached views for obsolete original references before changing
visibility. In repository **Settings → General → Danger Zone**, change visibility
to public once that remote verification is complete.

Once public, enable
[private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)
in **Settings → Advanced Security** and verify the **Report a vulnerability**
button described in `SECURITY.md`. This is a GitHub setting in addition to the
tracked policy file; its availability was not confirmed while the repo is private.

A `main` push triggers the existing CI verification/image-publication workflow.
Production deployment uses a separate manual workflow. Existing production
checkout/image pins should be handled as a separate deployment transition; a
publication history rewrite is not a production rollout.

No remote push, history replacement on GitHub, or visibility change has been
performed. The candidate is concrete and locally verified for that final step.
