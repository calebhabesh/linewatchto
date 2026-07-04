package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.ingestion.AlertDirectionParser;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import com.calebhabesh.linewatch.alert.ReducedSpeedZoneProjector.Projection;
import com.calebhabesh.linewatch.alert.ReducedSpeedZoneProjector.TravelDirection;
import com.calebhabesh.linewatch.alert.ReducedSpeedZoneProjector.SegmentImpact;
import com.calebhabesh.linewatch.station.TransitLineEntity;

class ReducedSpeedZoneProjectorTest {

    private final ReducedSpeedZoneProjector projector = new ReducedSpeedZoneProjector(
        new AlertSegmentMatcher(),
        new AlertDirectionParser()
    );

    @Test
    void projectsSouthboundEglintonToDavisvilleAsForward() {
        Projection projection = projector.project(
            List.of(alert("ttc-route-synthetic-rsz-line-1", "line-1", "eglinton", "davisville", "southbound")),
            List.of(segment(
                "line-1-eglinton-davisville", "line-1", "eglinton", "davisville",
                "southbound"
            ))
        );

        assertThat(projection.segmentImpacts().get("line-1-eglinton-davisville"))
            .extracting(SegmentImpact::travelDirection)
            .isEqualTo(TravelDirection.FORWARD);
    }

    @Test
    void mergesOppositeDirectionsOnTheSameLink() {
        Projection projection = projector.project(
            List.of(
                alert("ttc-route-north", "line-1", "yorkdale", "wilson", "northbound"),
                alert("ttc-route-south", "line-1", "wilson", "yorkdale", "southbound")
            ),
            List.of(segment(
                "line-1-wilson-yorkdale", "line-1", "wilson", "yorkdale", "southbound"
            ))
        );

        assertThat(projection.zones()).hasSize(1);
        assertThat(projection.zones().getFirst().displayDirection())
            .isEqualTo("Northbound & Southbound");
        assertThat(projection.segmentImpacts().get("line-1-wilson-yorkdale"))
            .satisfies(impact -> {
                assertThat(impact.travelDirection()).isEqualTo(TravelDirection.BIDIRECTIONAL);
                assertThat(impact.sourceAlertIds())
                    .containsExactlyInAnyOrder("ttc-route-north", "ttc-route-south");
            });
    }

    @Test
    void displaysBidirectionalLineTwoZonesAsEastboundAndWestbound() {
        Projection projection = projector.project(
            List.of(alert("ttc-route-both", "line-2", "jane", "runnymede", "bidirectional")),
            List.of(segment(
                "line-2-jane-runnymede", "line-2", "jane", "runnymede", "eastbound"
            ))
        );

        assertThat(projection.zones().getFirst().displayDirection())
            .isEqualTo("Eastbound & Westbound");
    }

    @Test
    void defaultsUnknownDirectionToBidirectionalWithoutInventingCardinalCopy() {
        Projection projection = projector.project(
            List.of(alert("ttc-route-unknown", "line-2", "jane", "runnymede", "unknown")),
            List.of(segment(
                "line-2-jane-runnymede", "line-2", "jane", "runnymede", "eastbound"
            ))
        );

        assertThat(projection.segmentImpacts().get("line-2-jane-runnymede").travelDirection())
            .isEqualTo(TravelDirection.BIDIRECTIONAL);
        assertThat(projection.zones().getFirst().displayDirection())
            .isEqualTo("Direction not specified");
    }

    @Test
    void recoversLegacyUnknownDirectionFromAlertText() {
        Projection projection = projector.project(
            List.of(alert(
                "ttc-route-66708",
                "line-1",
                "museum",
                "st-george",
                "unknown",
                "Subway trains will move slower than usual northbound from Museum to St George stations."
            )),
            List.of(segment(
                "line-1-st-george-museum", "line-1", "st-george", "museum", "southbound"
            ))
        );

        assertThat(projection.segmentImpacts().get("line-1-st-george-museum").travelDirection())
            .isEqualTo(TravelDirection.REVERSE);
        assertThat(projection.zones().getFirst().displayDirection())
            .isEqualTo("Northbound");
    }

    @Test
    void groupsPartialOverlapsButKeepsNonOverlappingLinksDirectional() {
        Projection projection = projector.project(
            List.of(
                alert("ttc-route-east", "line-2", "jane", "dufferin", "eastbound"),
                alert("ttc-route-west", "line-2", "ossington", "jane", "westbound")
            ),
            List.of(
                segment("line-2-jane-runnymede", "line-2", "jane", "runnymede", "eastbound"),
                segment("line-2-runnymede-dufferin", "line-2", "runnymede", "dufferin", "eastbound"),
                segment("line-2-dufferin-ossington", "line-2", "dufferin", "ossington", "eastbound")
            )
        );

        assertThat(projection.zones()).hasSize(1);
        assertThat(projection.segmentImpacts().get("line-2-jane-runnymede").travelDirection())
            .isEqualTo(TravelDirection.BIDIRECTIONAL);
        assertThat(projection.segmentImpacts().get("line-2-runnymede-dufferin").travelDirection())
            .isEqualTo(TravelDirection.BIDIRECTIONAL);
        assertThat(projection.segmentImpacts().get("line-2-dufferin-ossington").travelDirection())
            .isEqualTo(TravelDirection.REVERSE);
    }

    @Test
    void projectsLongLineOneReducedSpeedZonesAcrossLinearAndGuideBackedLinks() {
        Projection projection = projector.project(
            List.of(alert("ttc-route-dupont-museum", "line-1", "dupont", "museum", "southbound")),
            List.of(
                segment("line-1-dupont-spadina", "line-1", "dupont", "spadina", 113, "southbound"),
                segment("line-1-spadina-st-george", "line-1", "spadina", "st-george", 114, "southbound"),
                segment("line-1-st-george-museum", "line-1", "st-george", "museum", 115, "southbound"),
                segment("line-1-museum-queens-park", "line-1", "museum", "queens-park", 116, "southbound")
            )
        );

        assertThat(projection.zones()).singleElement().satisfies(zone ->
            assertThat(zone.affectedSegmentIds()).containsExactlyInAnyOrder(
                "line-1-dupont-spadina",
                "line-1-spadina-st-george",
                "line-1-st-george-museum"
            )
        );
        assertThat(projection.segmentImpacts().keySet()).containsExactlyInAnyOrder(
            "line-1-dupont-spadina",
            "line-1-spadina-st-george",
            "line-1-st-george-museum"
        );
        assertThat(projection.segmentImpacts().values())
            .extracting(SegmentImpact::travelDirection)
            .containsOnly(TravelDirection.FORWARD);
    }

    @Test
    void projectsLongLineOneReducedSpeedZonesThroughUnionLoopToTmu() {
        Projection projection = projector.project(
            List.of(alert("ttc-route-queens-park-tmu", "line-1", "queens-park", "tmu", "bidirectional")),
            List.of(
                segment("line-1-museum-queens-park", "line-1", "museum", "queens-park", 117, "southbound"),
                segment("line-1-queens-park-st-patrick", "line-1", "queens-park", "st-patrick", 118, "southbound"),
                segment("line-1-st-patrick-osgoode", "line-1", "st-patrick", "osgoode", 119, "southbound"),
                segment("line-1-osgoode-st-andrew", "line-1", "osgoode", "st-andrew", 120, "southbound"),
                segment("line-1-st-andrew-union", "line-1", "st-andrew", "union", 121, "southbound"),
                segment("line-1-tmu-queen", "line-1", "tmu", "queen", 214, "southbound"),
                segment("line-1-queen-king", "line-1", "queen", "king", 215, "southbound"),
                segment("line-1-king-union", "line-1", "king", "union", 216, "southbound")
            )
        );

        assertThat(projection.zones()).singleElement().satisfies(zone -> {
            assertThat(zone.displayDirection()).isEqualTo("Northbound & Southbound");
            assertThat(zone.affectedSegmentIds()).containsExactlyInAnyOrder(
                "line-1-queens-park-st-patrick",
                "line-1-st-patrick-osgoode",
                "line-1-osgoode-st-andrew",
                "line-1-st-andrew-union",
                "line-1-king-union",
                "line-1-queen-king",
                "line-1-tmu-queen"
            );
        });
        assertThat(projection.segmentImpacts().keySet()).containsExactlyInAnyOrder(
            "line-1-queens-park-st-patrick",
            "line-1-st-patrick-osgoode",
            "line-1-osgoode-st-andrew",
            "line-1-st-andrew-union",
            "line-1-king-union",
            "line-1-queen-king",
            "line-1-tmu-queen"
        );
        assertThat(projection.segmentImpacts().values())
            .extracting(SegmentImpact::travelDirection)
            .containsOnly(TravelDirection.BIDIRECTIONAL);
    }

    @Test
    void keepsUnmatchedZoneCardWithoutClearingMatchedOverlays() {
        Projection projection = projector.project(
            List.of(
                alert("ttc-route-matched", "line-1", "eglinton", "davisville", "southbound"),
                alert("ttc-route-unmatched", "line-1", "imaginary", "nowhere", "southbound")
            ),
            List.of(segment(
                "line-1-eglinton-davisville", "line-1", "eglinton", "davisville",
                "southbound"
            ))
        );

        assertThat(projection.zones()).hasSize(2);
        assertThat(projection.zones())
            .filteredOn(zone -> zone.sourceAlertIds().contains("ttc-route-unmatched"))
            .singleElement()
            .satisfies(zone -> assertThat(zone.affectedSegmentIds()).isEmpty());
        assertThat(projection.segmentImpacts()).containsKey("line-1-eglinton-davisville");
    }

    @Test
    void formatsTmuStationCapitalized() {
        Projection projection = projector.project(
            List.of(alert("rsz-tmu", "line-1", "tmu", "wellesley", "northbound")),
            List.of(segment("line-1-tmu-wellesley", "line-1", "tmu", "wellesley", "northbound"))
        );

        assertThat(projection.zones()).singleElement().satisfies(zone -> {
            assertThat(zone.directionalDetails()).singleElement().satisfies(detail -> {
                assertThat(detail.location()).isEqualTo("TMU to Wellesley");
            });
        });
    }

    private AlertEntity alert(String id, String lineId, String start, String end, String direction) {
        return alert(id, lineId, start, end, direction, "Reduced speed");
    }

    private AlertEntity alert(
        String id,
        String lineId,
        String start,
        String end,
        String direction,
        String title
    ) {
        AlertEntity alert = new AlertEntity();
        ReflectionTestUtils.setField(alert, "id", id);
        ReflectionTestUtils.setField(alert, "title", title);
        ReflectionTestUtils.setField(alert, "description", "");
        ReflectionTestUtils.setField(alert, "startStationId", start);
        ReflectionTestUtils.setField(alert, "endStationId", end);
        ReflectionTestUtils.setField(alert, "direction", direction);

        TransitLineEntity line = new TransitLineEntity(lineId, "1", lineId, "#000", 1);
        ReflectionTestUtils.setField(alert, "line", line);

        return alert;
    }

    private LineSegmentEntity segment(String id, String lineId, String stationA, String stationB, String forwardDirection) {
        return segment(id, lineId, stationA, stationB, 10, forwardDirection);
    }

    private LineSegmentEntity segment(
        String id,
        String lineId,
        String stationA,
        String stationB,
        int sortOrder,
        String forwardDirection
    ) {
        return new LineSegmentEntity(id, lineId, stationA, stationB, null, null, sortOrder, forwardDirection, null, false, null, null);
    }
}
