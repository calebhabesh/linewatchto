# Current Service on the map screen

Current Service is a compact, always-open readout directly above the retained alert-type badges on desktop and mobile. It has two columns: rail lines with textual conditions, and independently sourced surface/service notices. The heading includes “Active alerts, delays, and upcoming closures”, with no polling subtitle or expand/collapse controls. Long lists scroll within the readout.

Rail rows reuse freshness-gated active alerts and delays. Reduced Speed Zones remain excluded. Planned closures appear only with an explicit published window starting within 24 hours (Toronto time for display). A preview becomes “Closure in Effect” during that window, expires at its end, and yields to a linked active alert to prevent duplicates. Only affected rail lines are listed. When no rail lines have an included impact, one shared “No active alerts, delays, or upcoming closures” message appears; unavailable or demo data cannot produce that reassurance.

Surface/service notices use the existing network-scoped backend endpoint independently of rail status. The preview excludes future and expired periods and orders routes numerically. Selecting an impact or notice opens its existing detail view. GO/UP uses its own corridor identities and service notices.

The readout sits outside the badge containers' measured height, preserving the existing default map viewport and camera. Desktop uses a wider, shorter panel in the bottom-left corner; mobile leaves room beside the readout for map controls.

Verification covers included impact types, planned-closure and RSZ exclusion, unavailable states, active notice periods, first-load rendering, retained category badges, direct detail navigation, and unchanged map fitting.
