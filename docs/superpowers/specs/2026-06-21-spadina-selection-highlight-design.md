# Spadina Selection Highlight Design

Date: 2026-06-21

## Scope

Adjust only the frontend map interaction for Spadina. Spadina remains one station with one station-detail submenu and one backend identity.

## Interaction

- The Line 1 and Line 2 Spadina dots each receive a circular pointer hit area.
- Both hit areas belong to one logical keyboard-accessible Spadina control, avoiding duplicate tab stops for the same station.
- Hovering either hit area or focusing the logical control highlights both dots.
- Selecting either hit area or activating the focused control opens the same Spadina station submenu.
- While Spadina is selected, both dots remain highlighted.
- Clearing the station selection clears both highlights.

## Visual Treatment

Render one circular blue highlight over each Spadina dot, using the existing standard-station highlight styling and animation. Do not render one large circle around the complete pill-shaped interchange.

The existing white connector remains visible and communicates that the two dots belong to one station. No additional connector highlight is required.

## Data and Backend

Do not change Spadina's station ID, `interchange` value, API shape, fixture metadata, or backend logic. The two visual targets both dispatch the existing `spadina` station ID.

## Implementation Boundary

Add a small frontend helper that resolves one station to one or more visual map anchors. Most stations resolve to their existing station center. Spadina resolves to the SVG anchors `station-spadina-1` and `station-spadina-2`.

Use those anchors for Spadina's hover, focus, click, selection-flash, selected-indicator, and commute-endpoint highlights. Other stations retain their current behavior.

Station-level alert rings remain centered on the logical station unless a separate product requirement later defines line-specific Spadina impacts.

## Verification

- Add a focused frontend test proving both Spadina anchors map to the same station selection.
- Verify ordinary and large station highlights retain their existing behavior.
- Run fixture tests, typecheck, and lint.
