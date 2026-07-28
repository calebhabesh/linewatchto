package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RegionalCommutePathServiceTest {
    private final RegionalCommutePathService service = new RegionalCommutePathService();

    @Test
    void computesDirectKitchenerCorridorPathWithoutDetouringThroughUnion() {
        var path = service.path("bloor", "stratford");

        assertThat(path.status()).isEqualTo("available");
        assertThat(path.stationIds()).startsWith("bloor", "mount-dennis", "weston").endsWith("stratford");
        assertThat(path.lineIds()).containsExactly("regional-ki");
        assertThat(path.transferStationIds()).isEmpty();
        assertThat(path.weightSource()).isEqualTo("regional-topology-estimate");
        assertThat(path.summary()).contains("KI", "planning estimate");
    }

    @Test
    void choosesUpExpressForSharedAirportRoute() {
        var path = service.path("bloor", "pearson-airport");

        assertThat(path.stationIds()).containsExactly("bloor", "mount-dennis", "weston", "pearson-airport");
        assertThat(path.lineIds()).containsExactly("regional-up");
        assertThat(path.segmentHops()).allSatisfy(hop -> assertThat(hop.lineId()).isEqualTo("regional-up"));
    }

    @Test
    void routesAcrossCorridorsWithReviewedUnionTransfer() {
        var path = service.path("oakville", "ajax");

        assertThat(path.lineIds()).containsExactly("regional-lw", "regional-le");
        assertThat(path.transferStationIds()).containsExactly("union");
        assertThat(path.stationIds()).containsSubsequence("exhibition", "union", "danforth");
    }
}

