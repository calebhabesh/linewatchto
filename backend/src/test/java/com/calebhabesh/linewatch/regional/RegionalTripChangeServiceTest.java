package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RegionalTripChangeServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-31T16:00:00Z"), ZoneOffset.UTC);
    private RegionalTripChangeOperationalRepository operationalRepository;
    private RegionalAlertStore alertStore;
    private RegionalGtfsScheduleRepository scheduleRepository;
    private RegionalIngestionFreshness freshness;
    private RegionalTripChangeService service;

    @BeforeEach
    void setUp() {
        operationalRepository = mock(RegionalTripChangeOperationalRepository.class);
        alertStore = mock(RegionalAlertStore.class);
        scheduleRepository = mock(RegionalGtfsScheduleRepository.class);
        freshness = mock(RegionalIngestionFreshness.class);
        when(freshness.isFresh()).thenReturn(true);
        when(alertStore.findActiveClassifications(eq("trip-cancellation"), any())).thenReturn(List.of());
        service = new RegionalTripChangeService(
            operationalRepository,
            alertStore,
            scheduleRepository,
            freshness,
            new ObjectMapper().findAndRegisterModules(),
            CLOCK,
            new MetrolinxProperties()
        );
    }

    @Test
    void combinesDuplicateExceptionAndTripUpdateCancellationsAfterConfidentScheduleMatch() {
        OffsetDateTime observedAt = OffsetDateTime.parse("2026-07-31T15:58:00Z");
        when(operationalRepository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, "681", observedAt, """
                {"TripNumber":"681","ServiceDate":"2026-07-31","IsCancelled":true}
                """),
            record(MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, "MI100", observedAt, """
                {"id":"MI100","trip_update":{"trip":{"trip_id":"MI100","start_date":"20260731","schedule_relationship":"CANCELED"}}}
                """)
        ));
        when(scheduleRepository.findActiveTrip(eq("681"), eq(LocalDate.parse("2026-07-31"))))
            .thenReturn(schedule("MI100", "681"));
        when(scheduleRepository.findActiveTrip(eq("MI100"), eq(LocalDate.parse("2026-07-31"))))
            .thenReturn(schedule("MI100", "681"));

        RegionalTripChangeResponses.Response response = service.get(null, null, null);

        assertThat(response.fresh()).isTrue();
        assertThat(response.changes()).hasSize(1);
        assertThat(response.totalCount()).isEqualTo(1);
        assertThat(response.changes().getFirst().kind()).isEqualTo("cancellation");
        assertThat(response.changes().getFirst().tripNumber()).isEqualTo("681");
        assertThat(response.changes().getFirst().sourceSystems())
            .containsExactlyInAnyOrder(
                MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS,
                MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES
            );
        assertThat(response.changes().getFirst().affectedStops())
            .extracting(RegionalTripChangeResponses.AffectedStop::stationId)
            .containsExactly("milton", "kipling", "union");
    }

    @Test
    void mergesAClassifiedRiderCancellationIntoTheScheduleBackedTripChange() {
        OffsetDateTime observedAt = OffsetDateTime.parse("2026-07-31T15:58:00Z");
        when(alertStore.findActiveClassifications(eq("trip-cancellation"), any())).thenReturn(List.of(
            new RegionalAlertStore.StoredClassification(cancellationClassification("681"), observedAt)
        ));
        when(scheduleRepository.findActiveTrip("681", LocalDate.parse("2026-07-31")))
            .thenReturn(schedule("MI100", "681"));

        RegionalTripChangeResponses.Response response = service.get(null, null, null);

        assertThat(response.changes()).singleElement().satisfies(change -> {
            assertThat(change.kind()).isEqualTo("cancellation");
            assertThat(change.scheduleMatched()).isTrue();
            assertThat(change.tripId()).isEqualTo("MI100");
            assertThat(change.tripNumber()).isEqualTo("681");
            assertThat(change.title()).isEqualTo("Train cancelled - Milton 11:00 AM - Union 12:10 PM");
            assertThat(change.description()).contains("crew constraints");
            assertThat(change.cause()).isEqualTo("crew constraints");
            assertThat(change.sourceSystems()).containsExactly(MetrolinxSourceSystem.GO_SERVICE_ALERTS);
            assertThat(change.affectedStops())
                .extracting(RegionalTripChangeResponses.AffectedStop::stationId)
                .containsExactly("milton", "kipling", "union");
        });
    }

    @Test
    void exposesAnUnmatchedRiderCancellationWithoutInventingScheduledTimes() {
        OffsetDateTime observedAt = OffsetDateTime.parse("2026-07-31T15:58:00Z");
        when(alertStore.findActiveClassifications(eq("trip-cancellation"), any())).thenReturn(List.of(
            new RegionalAlertStore.StoredClassification(cancellationClassification("UNKNOWN"), observedAt)
        ));
        when(scheduleRepository.findActiveTrip("UNKNOWN", LocalDate.parse("2026-07-31"))).thenReturn(List.of());

        RegionalTripChangeResponses.Response response = service.get(null, null, null);

        assertThat(response.changes()).singleElement().satisfies(change -> {
            assertThat(change.scheduleMatched()).isFalse();
            assertThat(change.scheduledStartAt()).isNull();
            assertThat(change.tripNumber()).isEqualTo("UNKNOWN");
            assertThat(change.affectedStops())
                .extracting(RegionalTripChangeResponses.AffectedStop::stationId)
                .containsExactly("milton", "kipling", "union");
        });
    }

    @Test
    void exposesOnlyTheConfidentlyMatchedSkippedStopToThatStation() {
        OffsetDateTime observedAt = OffsetDateTime.parse("2026-07-31T15:58:00Z");
        when(operationalRepository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, "MI100", observedAt, """
                {"id":"MI100","trip_update":{"trip":{"trip_id":"MI100","start_date":"20260731"},
                 "stop_time_update":[{"stop_sequence":2,"stop_id":"KP","schedule_relationship":"SKIPPED"}]}}
                """)
        ));
        when(scheduleRepository.findActiveTrip("MI100", LocalDate.parse("2026-07-31")))
            .thenReturn(schedule("MI100", "681"));

        RegionalTripChangeResponses.Response response = service.get("kipling", null, 20);

        assertThat(response.changes()).singleElement().satisfies(change -> {
            assertThat(change.kind()).isEqualTo("skipped-stop");
            assertThat(change.affectedStops()).singleElement().satisfies(stop -> {
                assertThat(stop.stationId()).isEqualTo("kipling");
                assertThat(stop.kind()).isEqualTo("skipped-stop");
            });
        });
        assertThat(service.get("milton", null, 20).changes()).isEmpty();
    }

    @Test
    void keepsAmbiguousOrUnmatchedOperationalRowsInternal() {
        when(operationalRepository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, "UNKNOWN", OffsetDateTime.now(CLOCK), """
                {"TripNumber":"UNKNOWN","IsCancelled":true}
                """)
        ));
        when(scheduleRepository.findActiveTrip(eq("UNKNOWN"), any())).thenReturn(List.of());

        assertThat(service.get(null, null, null).changes()).isEmpty();
    }

    @Test
    void exposesAnExplicitCatalogMappedAdditionalStopThatIsAbsentFromThePublishedSequence() {
        OffsetDateTime observedAt = OffsetDateTime.parse("2026-07-31T15:58:00Z");
        when(operationalRepository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, "681", observedAt, """
                {"TripNumber":"681","ServiceDate":"2026-07-31",
                 "Stop":[{"StopCode":"MI","IsAdditional":true}]}
                """)
        ));
        when(scheduleRepository.findActiveTrip("681", LocalDate.parse("2026-07-31")))
            .thenReturn(schedule("MI100", "681"));

        RegionalTripChangeResponses.Response response = service.get("mimico", null, 20);

        assertThat(response.changes()).singleElement().satisfies(change -> {
            assertThat(change.kind()).isEqualTo("added-stop");
            assertThat(change.affectedStops()).singleElement().satisfies(stop -> {
                assertThat(stop.stationId()).isEqualTo("mimico");
                assertThat(stop.scheduledAt()).isNull();
            });
        });
    }

    @Test
    void suppressesOperationalChangesWhenRegionalIngestionIsStale() {
        when(freshness.isFresh()).thenReturn(false);

        RegionalTripChangeResponses.Response response = service.get(null, null, null);

        assertThat(response.fresh()).isFalse();
        assertThat(response.changes()).isEmpty();
    }

    private RegionalTripChangeOperationalRepository.OperationalRecord record(
        String sourceSystem,
        String sourceId,
        OffsetDateTime observedAt,
        String payload
    ) {
        return new RegionalTripChangeOperationalRepository.OperationalRecord(
            sourceSystem, sourceId, payload, observedAt
        );
    }

    private List<RegionalGtfsScheduleRepository.MatchedDeparture> schedule(String tripId, String tripNumber) {
        LocalDate date = LocalDate.parse("2026-07-31");
        return List.of(
            new RegionalGtfsScheduleRepository.MatchedDeparture(
                "regional-mi", "Union Station", tripId, tripNumber, "milton", 1, 15 * 3600, "1", date
            ),
            new RegionalGtfsScheduleRepository.MatchedDeparture(
                "regional-mi", "Union Station", tripId, tripNumber, "kipling", 2, 15 * 3600 + 3000, "2", date
            ),
            new RegionalGtfsScheduleRepository.MatchedDeparture(
                "regional-mi", "Union Station", tripId, tripNumber, "union", 3, 16 * 3600 + 600, "4", date
            )
        );
    }

    private RegionalAlertClassification cancellationClassification(String tripNumber) {
        OffsetDateTime publishedAt = OffsetDateTime.parse("2026-07-31T11:00:00-04:00");
        return new RegionalAlertClassification(
            "go-cancel-681",
            List.of(new RegionalAlertClassification.SourceReference(
                MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M-CANCEL-681"
            )),
            List.of("regional-mi"),
            List.of(tripNumber),
            "current",
            "trip-cancellation",
            "cancelled-trip",
            "scheduled-trip",
            "crew constraints",
            null,
            null,
            "Train cancelled - Milton 11:00 AM - Union 12:10 PM",
            "The Milton 11:00 AM train has been cancelled due to crew constraints.",
            publishedAt,
            null,
            "source-active-period",
            publishedAt,
            null,
            publishedAt,
            List.of("milton", "kipling", "union"),
            List.of(),
            Map.of(),
            Map.of(),
            "{}"
        );
    }
}
