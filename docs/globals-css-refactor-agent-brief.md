# Global CSS Refactor: Short Agent Brief

Use this file to start every new Gemini session. The detailed roadmap is in
`docs/globals-css-refactor-playbook.md`; read only the section for the current
session unless more context is required.

## Objective

Refactor `frontend/src/app/globals.css` into owned stylesheets, then safely
reduce cascade conflicts and dead CSS without redesigning LineWatchTO.

Starting measurements from 2026-09-03:

- 30,011 lines / 753,859 bytes;
- 4,221 rules and 14,093 declarations;
- 2,356 `!important` declarations;
- 158 media-query blocks and 99 keyframe blocks;
- 32 class-substring selectors;
- 51 tests directly referring to `globals.css`.

Re-measure before editing. The repository may have changed.

## Session contract

1. Read `AGENTS.md`, `frontend/AGENTS.md`, this brief, and
   `docs/globals-css-refactor-progress.md`.
2. Find the next session in the progress file. Read that session's section in
   `docs/globals-css-refactor-playbook.md`. Do not load unrelated session
   sections unless needed to resolve a conflict.
3. Inspect `git status --short`, the current branch, the last five commits, and
   the existing diff. Preserve unrelated work.
4. State the session boundary, expected files, excluded work, and verification
   before editing.
5. Complete only one bounded session. Do not redesign UI or continue into the
   next session.
6. Inspect the diff and run every required check. Read the complete results.
7. If successful, make one atomic commit containing only the session's work.
8. Update the progress log with the commit, metrics, checks, visual comparisons,
   risks, and exact next session. Then stop.

## Safety rules

- Work in the dedicated refactor worktree/branch, never directly on `main`.
- Treat CSS source order as application behavior.
- During the initial split, do not rename selectors, consolidate declarations,
  remove `!important`, reorder rules, or add cascade layers.
- Repeated selectors are not proof of duplicate rules.
- A selector absent from a text search is not proof that it is unused. Inspect
  runtime SVG classes, dynamic state modifiers, tests, and browser coverage.
- Do not migrate interactive map styles to CSS Modules during the structural
  split.
- Do not weaken CSS contract tests to make a move pass.
- A short `globals.css` is not success if the total stylesheet graph remains
  disorganized or behavior changes.
- If a check fails and cannot be resolved within scope, record the exact failure
  and stop without claiming completion.

## Required completion checks

Unless the detailed session explicitly defines a smaller intermediate gate:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Before testing:

```bash
git diff --stat
git diff --check
```

## Prompt to paste into a fresh Gemini chat

```text
Continue the LineWatchTO global CSS refactor as one short implementation
session.

Read AGENTS.md, frontend/AGENTS.md,
docs/globals-css-refactor-agent-brief.md, and
docs/globals-css-refactor-progress.md. From the progress log, identify the exact
next session. Read only that session's section of
docs/globals-css-refactor-playbook.md, expanding to adjacent reference material
only when necessary.

Inspect git status, the current branch, the last five commits, and the current
diff. State the session boundary, expected files, exclusions, and checks before
editing. Preserve unrelated work. Perform only the recorded session; do not
redesign the UI or continue into the next session.

Run and read all required verification. If successful, create one atomic commit
containing only this session and update the progress file with the commit SHA,
files, before/after metrics, check results, visual comparisons, risks, and exact
next session. Then stop and summarize.

If repository state disagrees with the progress log, or a prior session left
uncommitted work, investigate and reconcile that state before editing. Never
discard potentially valuable changes without understanding them.
```

For a failed-session retry, append:

```text
The previous attempt stopped during SESSION_ID. Diagnose and complete only that
session. Do not advance to the next session.
```
