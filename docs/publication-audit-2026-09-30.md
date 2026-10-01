# Repository publication audit — September 30, 2026

Baseline: `941f0c51`, with the accompanying README, license, screenshot, ignore-rule, and documentation privacy edits. This records a repository-content audit, not a new application release verification or permission to publish third-party material.

## Credential scan

- Gitleaks **8.30.1**, obtained from its official release and checked against the published SHA-256 checksum, scanned a tracked working-file export and all locally reachable Git history with the default rules. Both scans exited **0** with **zero findings**. The initial README/image scan included all **1,803 then-current publication-candidate files**, covering intended new documentation, images, and the license as well as uncommitted edits; it likewise returned zero findings. The linked candidate report records the final scan after fixture replacements and history sanitization.
- Scanner output was fully redacted. No fingerprint baseline, repository-specific allowlist, or inline `gitleaks:allow` suppression was used.
- An independent credential/path review covered **1,795 tracked files**, **1,325 reachable commits**, and **10,672 distinct Git blobs** (approximately 576 MB). Candidate credential matches were empty fields or clearly documented placeholders; no actual private keys, passwords, API keys, or tokens were identified.
- Only the five sanitized root `.env.*example` templates were tracked. Local environment files remain ignored and untracked. No non-example environment file, private-key filename, or Terraform-state file was found in reachable history.
- Git author metadata used a GitHub noreply identity; no personal author email was identified.

The scan found no credentials to rotate. Environment variable names, localhost addresses, public data-provider URLs, standard proxy ranges, and documented example values are retained so setup and networking rules remain usable.

## Current-file privacy cleanup

- Replaced **158 personal absolute-path references across 24 documentation files** with repository-relative links, portable paths, or asset-directory placeholders.
- Removed the old workstation LAN-address reference from the current refactor-plan narrative.
- Protected `*.tfvars` and `*.tfvars.json`, since the AWS lab instructions create a local Terraform variable file containing operator configuration. No such file was found committed or locally present during the audit.
- Added ignore rules for local PEM/key and PKCS#12 material. Existing environment, Terraform state, signing-file, and backup exclusions remain in place.
- README images were refreshed from signed-out public production views on September 30 at 19:23 EDT. TTC and regional freshness were checked independently; station details include source-labeled TTC GTFS-RT predictions. Images were visually reviewed for personal account details and operational identifiers; no account session or raw provider response was stored with them.

## Historical privacy findings and sanitization

Current-file edits do not remove historical content:

- Older `frontend/next.config.ts` versions contain **two workstation LAN-address literals**. Relevant history boundaries are `32994d80` and `7af0790c`.
- Earlier documentation retains a workstation-address reference and personal paths. Personal `/home` or `/Users` paths appear in **33 historical filenames**.

These are privacy/portability disclosures, not credential findings. The owner chose to retain and sanitize the development history in an isolated publication copy. The original repository retains its private history. See the [publication candidate report](publication-candidate-2026-09-30.md) for the rewritten history, verification, and publication procedure. Repository visibility has not changed.

## Source and asset disposition

Captured alert examples were replaced with authored synthetic parser fixtures and scenarios; the unused archived GTFS-RT response was removed. The publication copy also sanitizes these records in history. The owner chose to retain the Inkscape-authored maps with [reference credits](../THIRD_PARTY_NOTICES.md); this is an owner decision, not a claim of transit-agency permission. Live integration terms remain separate from repository publication.

The project's code and original documentation now have a root [MIT license](../LICENSE). Third-party transit data, adapted artwork, names/marks, and font notices retain separate terms.

## Scope and verification limits

The content audit covers the local working-file publication candidate and local reachable refs. It does not certify remote-only refs, Git LFS contents, unreachable Git objects, deployed secrets, provider accounts, or screenshot text through automated OCR. Screenshots were manually inspected. Pattern-based scans cannot prove the absence of every possible secret.

For these documentation/ignore-rule changes, verification consists of diff and local-link review, image inspection, Mermaid rendering, ignore-rule checks, and a final working-file credential scan. After replacing parser/scenario fixtures, the fresh publication copy passed frontend fast tests, typecheck, lint (17 existing warnings), and all 1,219 backend tests. The earlier [P4 release results](refactor-plan/p4-publication-evidence.md) remain historical evidence for their original candidate; no new deployment or complete browser release suite was performed.

## Repeating the credential checks

Use Gitleaks with full redaction and keep reports outside the repository. Include all refs when scanning history:

```bash
gitleaks git . --log-opts="--all" --ignore-gitleaks-allow --redact=100
```

For working files, scan an export containing tracked files and intended new publication files, including current uncommitted edits. Avoid scanning generated dependency/build trees or treating intentionally ignored local credentials as publishable files. Review findings privately and rotate any genuine exposed credential before handling its history.
