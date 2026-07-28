package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RegionalNetworkCatalogTest {
    @Test
    void exposesEightRoutesAndSeventyTwoNetworkScopedStations() {
        assertThat(RegionalNetworkCatalog.routes()).hasSize(8);
        assertThat(RegionalNetworkCatalog.stations()).hasSize(72);
        assertThat(RegionalNetworkCatalog.station("union")).get().satisfies(station -> {
            assertThat(station.interchange()).isTrue();
            assertThat(station.lineIds()).contains("regional-br", "regional-up");
        });
        assertThat(RegionalNetworkCatalog.station("finch")).isEmpty();
    }

    @Test
    void resolvesOfficialMetrolinxStopCodesAndAdjacentRouteSegments() {
        assertThat(RegionalNetworkCatalog.stationIdForStopCode("UN")).contains("union");
        assertThat(RegionalNetworkCatalog.stationIdForStopCode("PA")).contains("pearson-airport");
        assertThat(RegionalNetworkCatalog.stationIdForStopCode("00736")).isEmpty();

        assertThat(RegionalNetworkCatalog.segmentIds(
            "regional-le",
            java.util.List.of("pickering", "ajax", "whitby")
        )).containsExactly(
            "segment-le-pickering-ajax",
            "segment-le-ajax-whitby"
        );
        assertThat(RegionalNetworkCatalog.route("regional-ki")).get().satisfies(route ->
            assertThat(route.stationIds().subList(0, 5)).containsExactly(
                "union", "bloor", "mount-dennis", "weston", "etobicoke-north"
            )
        );
        assertThat(RegionalNetworkCatalog.segmentIds(
            "regional-ki",
            java.util.List.of("bloor", "mount-dennis", "weston")
        )).containsExactly(
            "segment-ki-bloor-mount-dennis",
            "segment-ki-mount-dennis-weston"
        );
        assertThat(RegionalNetworkCatalog.segments()).hasSize(74);
    }
}
