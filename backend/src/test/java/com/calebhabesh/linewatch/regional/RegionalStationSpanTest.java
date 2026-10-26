package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Wording below follows published Metrolinx notices. */
class RegionalStationSpanTest {

    @Test
    void namedTripTowardUnionRunsInboundAndNamesItsTerminal() {
        var span = RegionalStationSpan.describe(alert("regional-br", "delay",
            "Update 1 - Train trip reinstated - Allandale Waterfront GO 7:08 AM - Union Station 8:54 AM",
            "The Allandale Waterfront GO 7:08 AM - Union Station 8:54 AM train will be reinstated at Aurora GO "
                + "scheduled to depart at 8:01 AM with an estimated delay of 15 to 20 minutes.",
            List.of("aurora", "allandale-waterfront")));

        assertThat(span.displayLocation()).isEqualTo("Allandale Waterfront → Aurora");
        assertThat(span.displayDirection()).isEqualTo("Towards Union Station");
    }

    @Test
    void namedTripAwayFromUnionRunsOutbound() {
        var span = RegionalStationSpan.describe(alert("regional-br", "suspension",
            "Modified service - Maple GO to Aurora GO",
            "The Union Station 12:54 PM - Aurora GO 1:44 PM train will end at Maple GO. "
                + "Northbound - A GO bus shuttle will be making all stops to Aurora GO.",
            List.of("maple", "king-city", "aurora")));

        assertThat(span.displayLocation()).isEqualTo("Maple → Aurora");
        assertThat(span.displayDirection()).isEqualTo("Towards Aurora");
    }

    @Test
    void singleStationTripKeepsTheStationAndStatesDirection() {
        var span = RegionalStationSpan.describe(alert("regional-ki", "delay",
            "Train delay - Stratford GO 6:16 AM - Union Station 8:47 AM",
            "The Stratford GO 6:16 AM - Union Station 8:47 AM train is estimated to be delayed 30 minutes "
                + "from Stratford GO due to an operational issue.",
            List.of("stratford")));

        assertThat(span.displayLocation()).isEqualTo("Stratford");
        assertThat(span.displayDirection()).isEqualTo("Towards Union Station");
    }

    @Test
    void trackConditionsAffectEveryTrainThroughTheArea() {
        var span = RegionalStationSpan.describe(alert("regional-ki", "delay",
            "Kitchener Line – Track speed reductions",
            "Due to the track conditions between Kitchener GO and Stratford GO, trains will require to operate "
                + "at reduced speeds. As a result, trips may experience delays of up 20 minutes.",
            List.of("kitchener", "stratford")));

        assertThat(span.displayLocation()).isEqualTo("Kitchener ⇄ Stratford");
        assertThat(span.displayDirection()).isNull();
    }

    @Test
    void signalIssueAffectsBothDirections() {
        var span = RegionalStationSpan.describe(alert("regional-mi", "delay",
            "Milton - Signal issue",
            "There is a signal issue between Streetsville GO and Cooksville GO. Repair personnel are working on "
                + "the problem, but there will be delays of up to 30 minutes until the situation is resolved.",
            List.of("cooksville", "erindale", "streetsville")));

        assertThat(span.displayLocation()).isEqualTo("Cooksville ⇄ Streetsville");
    }

    @Test
    void plannedClosureWithEveningTimingStillAffectsBothDirections() {
        var span = RegionalStationSpan.describe(alert("regional-lw", "planned-closure",
            "Oct. 24-25: Lakeshore West service adjustments",
            "After 9:00 PM there will be no GO train service between Aldershot GO and Union Station.",
            List.of("union", "aldershot")));

        assertThat(span.displayLocation()).isEqualTo("Union ⇄ Aldershot");
    }

    @Test
    void oneNamedDirectionWithoutATripStaysUnspecified() {
        var span = RegionalStationSpan.describe(alert("regional-le", "delay",
            "Lakeshore East trains operating with delays",
            "Eastbound trains are delayed between Pickering GO and Whitby GO.",
            List.of("pickering", "ajax", "whitby")));

        assertThat(span.displayLocation()).isEqualTo("Pickering to Whitby");
        assertThat(span.displayDirection()).isNull();
    }

    @Test
    void unresolvedTripTimingStaysUnspecified() {
        var span = RegionalStationSpan.describe(alert("regional-le", "delay",
            "Lakeshore East train delayed",
            "The 5:10 PM train is delayed between Pickering GO and Whitby GO.",
            List.of("pickering", "whitby")));

        assertThat(span.displayLocation()).isEqualTo("Pickering to Whitby");
    }

    @Test
    void tripsInOppositeDirectionsStayUnspecified() {
        var span = RegionalStationSpan.describe(alert("regional-mi", "delay",
            "Milton trains delayed",
            "The Milton GO 7:00 AM - Union Station 8:03 AM train and the Union Station 4:30 PM - Milton GO "
                + "5:31 PM train are delayed between Erindale GO and Cooksville GO.",
            List.of("cooksville", "erindale")));

        assertThat(span.displayLocation()).isEqualTo("Cooksville to Erindale");
        assertThat(span.displayDirection()).isNull();
    }

    @Test
    void noServiceBetweenStationsAffectsBothDirectionsDespiteListedTrips() {
        var span = RegionalStationSpan.describe(alert("regional-lw", "suspension",
            "Starting Tonight, Service Will Be Adjusted On Lakeshore West Due To Planned Construction",
            "The 11:24 PM train departing West Harbour GO to Union Station will not run. If you're travelling "
                + "westbound from Union Station to Port Credit GO, there will be GO bus service. There will be "
                + "no GO train service between Aldershot GO and Union Station.",
            List.of("union", "aldershot")));

        assertThat(span.displayLocation()).isEqualTo("Union ⇄ Aldershot");
        assertThat(span.displayDirection()).isNull();
    }

    @Test
    void cancelledTripsWithoutAServiceGapStayUnspecified() {
        var span = RegionalStationSpan.describe(alert("regional-lw", "suspension",
            "Lakeshore West trips cancelled",
            "The 11:24 PM train departing West Harbour GO to Union Station will not run.",
            List.of("union", "west-harbour")));

        assertThat(span.displayLocation()).endsWith(" to West Harbour");
    }

    private static RegionalNormalizedAlert alert(
        String lineId, String impactKind, String title, String description, List<String> stationIds
    ) {
        return new RegionalNormalizedAlert(
            "alert-" + lineId, MetrolinxSourceSystem.GO_SERVICE_ALERTS, "source", lineId, impactKind,
            title, description, "Operational issue", OffsetDateTime.parse("2026-10-22T10:00:00Z"), null,
            // Span alerts carry the track between their stations, as the normalizer produces them.
            OffsetDateTime.parse("2026-10-22T10:05:00Z"), stationIds,
            "advisory".equals(impactKind) ? List.of() : RegionalNetworkCatalog.segmentIds(lineId, stationIds), ""
        );
    }
}
