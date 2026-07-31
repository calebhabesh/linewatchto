package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

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
    void recordsEachCorridorsMetrolinxUnionBoundDirectionId() {
        assertThat(RegionalNetworkCatalog.routes())
            .extracting(RegionalNetworkCatalog.Route::number, RegionalNetworkCatalog.Route::inboundDirectionId)
            .containsExactly(
                tuple("BR", 1),
                tuple("KI", 0),
                tuple("LE", 1),
                tuple("LW", 0),
                tuple("MI", 0),
                tuple("RH", 1),
                tuple("ST", 1),
                tuple("UP", 0)
            );
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
        assertThat(RegionalNetworkCatalog.segmentBetween(
            "regional-lw", "west-harbour", "confederation"
        )).isPresent();
        assertThat(RegionalNetworkCatalog.segmentBetween(
            "regional-lw", "aldershot", "hamilton"
        )).isPresent();
        assertThat(RegionalNetworkCatalog.segmentBetween(
            "regional-lw", "west-harbour", "hamilton"
        )).isEmpty();
        assertThat(RegionalNetworkCatalog.segmentBetween(
            "regional-lw", "confederation", "hamilton"
        )).isEmpty();
        assertThat(RegionalNetworkCatalog.approachingFromStation(
            "regional-lw", "west-harbour", true
        )).contains("confederation");
        assertThat(RegionalNetworkCatalog.approachingFromStation(
            "regional-lw", "west-harbour", false
        )).contains("aldershot");
        assertThat(RegionalNetworkCatalog.approachingFromStation(
            "regional-lw", "aldershot", true
        )).isEmpty();
        assertThat(RegionalNetworkCatalog.segmentIds(
            "regional-lw",
            java.util.List.of("aldershot", "hamilton")
        )).containsExactly(
            "segment-lw-aldershot-hamilton"
        );
        assertThat(RegionalNetworkCatalog.segments()).hasSize(74);
    }
}
