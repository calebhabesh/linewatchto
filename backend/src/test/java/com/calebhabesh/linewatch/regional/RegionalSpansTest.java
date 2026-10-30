package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalSpansTest {
    private static final RegionalNetworkCatalog.Route KITCHENER = RegionalNetworkCatalog.route("regional-ki").orElseThrow();

    @Test
    void everyLinesSegmentsFormOneUnbrokenStretchSoSectionsAreNeverInventedFromGaps() {
        for (RegionalNetworkCatalog.Route route : RegionalNetworkCatalog.routes()) {
            List<String> stations = route.stationIds();
            assertThat(RegionalSpans.sections(route.id(), RegionalNetworkCatalog.segmentIds(route.id(), List.of())))
                .as(route.id()).containsExactly(List.of(stations.getFirst(), stations.getLast()));
            for (int index = 0; index + 1 < stations.size(); index++) {
                List<String> pair = List.of(stations.get(index), stations.get(index + 1));
                assertThat(RegionalSpans.sections(route.id(), RegionalNetworkCatalog.segmentIds(route.id(), pair)))
                    .as(route.id() + " " + pair).containsExactly(pair);
            }
        }
    }

    @Test
    void readsSpanPairsAndRejectsPartialOrDegeneratePairs() {
        assertThat(RegionalSpans.pairs(List.of("union", "bloor", "weston", "malton")))
            .containsExactly(List.of("union", "bloor"), List.of("weston", "malton"));
        assertThat(RegionalSpans.pairs(List.of("union", "bloor", "weston"))).isEmpty();
        assertThat(RegionalSpans.pairs(List.of("union", "union"))).isEmpty();
        assertThat(RegionalSpans.valid(List.of())).isFalse();
        assertThat(RegionalSpans.multiple(List.of("union", "bloor"))).isFalse();
    }

    @Test
    void ordersSectionsAlongTheRouteAndMergesOverlappingOrTouchingOnes() {
        List<String> lines = List.of("regional-ki");
        assertThat(RegionalSpans.normalize(lines, List.of(
            List.of("stratford", "mount-pleasant"), List.of("mount-dennis", "union"))))
            .containsExactly("union", "mount-dennis", "mount-pleasant", "stratford");
        assertThat(RegionalSpans.normalize(lines, List.of(
            List.of("union", "weston"), List.of("weston", "malton"))))
            .containsExactly("union", "malton");
        assertThat(RegionalSpans.normalize(lines, List.of(
            List.of("union", "malton"), List.of("bloor", "weston"))))
            .containsExactly("union", "malton");
        // One section keeps the order the notice names it.
        assertThat(RegionalSpans.normalize(lines, List.of(List.of("weston", "union"))))
            .containsExactly("weston", "union");
    }

    @Test
    void closesTheLineOutsideTheSectionWhereTrainsStillRun() {
        assertThat(RegionalSpans.outside(KITCHENER, "mount-pleasant", "mount-dennis"))
            .containsExactly("union", "mount-dennis", "mount-pleasant", "stratford");
        assertThat(RegionalSpans.outside(KITCHENER, "union", "bramalea"))
            .containsExactly("bramalea", "stratford");
        assertThat(RegionalSpans.outside(KITCHENER, "union", "stratford")).isEmpty();
    }

    @Test
    void placesStationsInsideAnyClosedSection() {
        List<String> span = List.of("union", "mount-dennis", "mount-pleasant", "stratford");
        assertThat(RegionalSpans.containsAll(KITCHENER, span, List.of("bloor", "kitchener", "georgetown"))).isTrue();
        assertThat(RegionalSpans.containsAll(KITCHENER, span, List.of("bloor", "malton"))).isFalse();
        assertThat(RegionalSpans.stationsWithin(KITCHENER, span)).containsExactly(
            "union", "bloor", "mount-dennis", "mount-pleasant", "georgetown", "acton", "guelph-central",
            "kitchener", "stratford");
        // Hamilton GO Centre is a spur off Aldershot, not on the main line past West Harbour.
        RegionalNetworkCatalog.Route lakeshoreWest = RegionalNetworkCatalog.route("regional-lw").orElseThrow();
        assertThat(RegionalSpans.containsAll(lakeshoreWest, List.of("west-harbour", "niagara-falls"), List.of("hamilton")))
            .isFalse();
        assertThat(RegionalSpans.containsAll(lakeshoreWest, List.of("burlington", "hamilton"), List.of("aldershot")))
            .isTrue();
        assertThat(RegionalSpans.segmentIds("regional-ki", span)).doesNotContainAnyElementsOf(
            RegionalNetworkCatalog.segmentIds("regional-ki", List.of("mount-dennis", "mount-pleasant")));
    }
}
