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
        assertThat(projection.segmentImpacts().get("line-1-wilson-yorkdale"))
            .satisfies(impact -> {
                assertThat(impact.travelDirection()).isEqualTo(TravelDirection.BIDIRECTIONAL);
                assertThat(impact.sourceAlertIds())
                    .containsExactlyInAnyOrder("ttc-route-north", "ttc-route-south");
            });
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
        return new LineSegmentEntity(id, lineId, stationA, stationB, null, null, 10, forwardDirection, null, false, null, null);
    }
}
