package com.calebhabesh.linewatch.surface;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SurfaceRouteLabelerTest {
    // TTC Live Alerts 80226 (Nov 13, 2026): route "24B" with routeBranch "B" read as "24BB".
    @Test
    void aRouteThatAlreadyNamesItsBranchIsNotSuffixedAgain() {
        assertThat(SurfaceRouteLabeler.routeIdsFor("24B", "B",
            "Detour via Yorkland Rd and Sheppard Ave E due to a blocked road.",
            "24B Victoria Park: Detour via Yorkland Rd and Sheppard Ave E due to a blocked road."))
            .containsExactly("24B");
        assertThat(SurfaceRouteLabeler.routeIdsFor("52a", "A", "")).containsExactly("52A");
    }

    @Test
    void aBareRouteStillTakesItsBranch() {
        assertThat(SurfaceRouteLabeler.routeIdsFor("24", "B", "")).containsExactly("24B");
        assertThat(SurfaceRouteLabeler.routeIdsFor("52", "52F", "")).containsExactly("52F");
        assertThat(SurfaceRouteLabeler.routeIdsFor("24B", "", "")).containsExactly("24B");
    }

    @Test
    void aDifferentBranchOnABranchedRouteIsKeptAsSent() {
        // Not the same letter, so not a repeat: keep the existing combination rule.
        assertThat(SurfaceRouteLabeler.routeIdsFor("24B", "C", "")).doesNotContain("24BB");
    }
}
