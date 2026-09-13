# Gemini 3.8 Flash handoff: compact mobile map controls

Implement a small responsive polish pass in the **web/PWA frontend**, not the Expo prototype. Read `AGENTS.md` and preserve the current working-tree edits. This handoff authorizes implementation; no additional design confirmation is needed.

## Problem and chosen direction

On short phones such as iPhone SE, the default Current Service sheet grows when it contains subway closing/closed or cached/disconnected notices. The bottom-anchored Center/zoom controls can then collide with the top-anchored TTC/GO/UP switcher. The limiting dimension is primarily vertical height.

For compact portrait screens:

1. Move the existing Info/site-guide trigger into the horizontally scrollable shortcut row below search, beside the theme toggle. Use the existing icon and accessible name. Move the same functionality; avoid duplicate active triggers or competing dropdown state. Keep its dropdown outside the scrolling row's clipping boundary, with working focus, dismissal and viewport containment.
2. Move the network switcher upward into the space vacated by Info. Merely hiding Info without changing the switcher's top offset will not fix the collision.
3. Slightly reduce the visual size and excess padding/gaps of the floating map controls and line/corridor legends. Preserve legibility and practical touch targets (aim for 44 CSS px for primary controls). Do not shrink everything proportionally or create overlapping invisible hit areas. Regional's eight legend entries are the tighter case.
4. Change the visible shortcut label to **Rotate Map** on mobile. Keep accessible naming consistent; update affected exact-name tests as needed.

Use the existing compact-screen tokens/breakpoints where appropriate, but account for available height rather than width alone. Test 375×667 (SE), 320×568, and a short available viewport such as 375×568. Keep normal portrait phones and desktop presentation stable. Preserve rotated-map behavior.

## Implementation entry points

- `frontend/src/components/LineWatchShell.tsx`: `.mobile-app-chip-scroll`, Rotate Map text, `.mobile-app-info` / `SiteGuideDropdown`, `.mobile-map-network-switch`.
- `frontend/src/components/MobileStatusPeek.tsx`: floating Center/zoom buttons and Current Service sheet states.
- `frontend/src/components/SiteGuideDropdown.tsx`: existing guide trigger/panel behavior.
- `frontend/src/styles/shell/current-service.css`: final mobile chrome overrides, Info/switcher top placement, Center/zoom bottom placement, sheet notice sizing.
- `frontend/src/styles/shell/mobile-chrome.css`: control sizes, compact vertical network selector and legend styling. Inspect shared token definitions before adding overrides.
- `frontend/tests/smoke/compact-mobile.spec.ts`, `mobile-service-sheet.spec.ts`, and `mobile-default-frame.spec.ts`: relevant regression coverage.

The bottom controls currently use `--mobile-status-peek-actual-height` plus bottom-navigation height. Keep notice-aware anchoring. Do not hide notices, shorten their content, or force the sheet back to a smaller height to make room.

Preserve the current mobile camera work: TTC's adaptive 1.65× opening zoom, GO/UP's 15% increase, Union horizontally centered in both, and vertical framing based on the default overview sheet (not a user's expanded/resized sheet). Do not reset a user's pan/zoom when rearranging controls.

## Acceptance and verification

- In both networks, verify the normal overview and every applicable closing, closed, cached/disconnected and reconnecting state. Include realistically wrapped notice text and supported combinations.
- On compact phones, Center and the network switcher must have non-overlapping visible and clickable bounds with a small clear gap (target at least 8px). Check zoom, train toggle and all legend entries as well.
- Info is accessible from the shortcut row; the guide opens unclipped and closes correctly. The row still scrolls, including to Rotate Map and Reliability.
- Check default, expanded and custom sheet heights, browser-toolbar viewport changes, safe-area insets, light/dark and high contrast. For expanded sheets, follow existing control visibility rules rather than forcing all controls into insufficient space.
- Inspect screenshots at compact sizes and a normal phone (393×851 or similar). Add focused browser assertions for actual bounds/clickability, not only CSS-source matching. Use seeded scenarios; never label test fixtures as actual live service.
- During iteration use focused checks. Once stable, run frontend fast tests, typecheck, lint and affected Playwright scenarios per `AGENTS.md`. Report unrelated failures honestly; do not modify unrelated work just to silence them. Avoid baseline refreshes without reviewing differences.

Deliver the scoped implementation, a concise explanation of the compact breakpoint/size choices, screenshots of both networks with the sheet notices present, and verification results. No deployment or commit is requested.
