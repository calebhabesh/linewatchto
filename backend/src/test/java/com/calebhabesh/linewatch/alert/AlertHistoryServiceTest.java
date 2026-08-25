package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.Test;

class AlertHistoryServiceTest {
    private final AlertHistoryRepository repository = mock(AlertHistoryRepository.class);
    private final Clock clock = Clock.fixed(
        Instant.parse("2026-06-23T16:30:00Z"),
        ZoneId.of("UTC")
    );
    private final AlertHistoryService service = new AlertHistoryService(repository, clock);

    @Test
    void todayStartsAtTorontoMidnightAndIncludesLifecycleDetailsFromBeforeToday() {
        when(repository.findLifecycleRows(
            OffsetDateTime.parse("2026-06-23T00:00:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            300
        )).thenReturn(List.of(
            row(2L, "ttc-route-1", false, "cleared", "2026-06-23T12:20:00-04:00"),
            row(1L, "ttc-route-1", true, "opened", "2026-06-22T12:05:00-04:00")
        ));

        AlertHistoryResponses.AlertHistoryResponse response = service.history("today", 300);

        assertThat(response.period()).isEqualTo("today");
        assertThat(response.since()).isEqualTo(OffsetDateTime.parse("2026-06-23T00:00:00-04:00"));
        assertThat(response.until()).isEqualTo(OffsetDateTime.parse("2026-06-23T12:30:00-04:00"));
        assertThat(response.incidents()).singleElement().satisfies(incident -> {
            assertThat(incident.alertId()).isEqualTo("ttc-route-1");
            assertThat(incident.lineNumber()).isEqualTo("2");
            assertThat(incident.lineName()).isEqualTo("Bloor-Danforth");
            assertThat(incident.eventType()).isEqualTo("suspension");
            assertThat(incident.location()).isEqualTo("Warden");
            assertThat(incident.displayDirection()).isEqualTo("Westbound");
            assertThat(incident.cause()).isEqualTo("Mechanical Problem");
            assertThat(incident.source()).isEqualTo("TTC Live Alerts");
            assertThat(incident.status()).isEqualTo("cleared");
            assertThat(incident.latestState()).isEqualTo("cleared");
            assertThat(incident.latestEventAt()).isEqualTo(
                OffsetDateTime.parse("2026-06-23T12:20:00-04:00")
            );
            assertThat(incident.firstSeenAt()).isEqualTo(OffsetDateTime.parse("2026-06-22T12:05:00-04:00"));
            assertThat(incident.clearedAt()).isEqualTo(OffsetDateTime.parse("2026-06-23T12:20:00-04:00"));
            assertThat(incident.durationMinutes()).isEqualTo(1_455L);
            assertThat(incident.events()).extracting(AlertHistoryResponses.AlertHistoryEventDto::state)
                .containsExactly("cleared", "opened");
        });
    }

    @Test
    void separatesRepeatedOccurrencesThatReuseTheSameAlertId() {
        when(repository.findLifecycleRows(
            OffsetDateTime.parse("2026-06-23T00:00:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            300
        )).thenReturn(List.of(
            row(4L, "ttc-route-1", true, "updated", "2026-06-23T12:20:00-04:00", 2L),
            row(3L, "ttc-route-1", true, "opened", "2026-06-23T12:05:00-04:00", 2L),
            row(2L, "ttc-route-1", false, "cleared", "2026-06-23T11:30:00-04:00", 1L),
            row(1L, "ttc-route-1", true, "opened", "2026-06-23T11:00:00-04:00", 1L)
        ));

        AlertHistoryResponses.AlertHistoryResponse response = service.history("today", 300);

        assertThat(response.incidents()).hasSize(2);
        assertThat(response.incidents()).extracting(AlertHistoryResponses.AlertHistoryIncidentDto::incidentId)
            .containsExactly("ttc-route-1:occurrence:3", "ttc-route-1:occurrence:1");
        assertThat(response.incidents().get(0).status()).isEqualTo("active");
        assertThat(response.incidents().get(0).latestState()).isEqualTo("updated");
        assertThat(response.incidents().get(0).events())
            .extracting(AlertHistoryResponses.AlertHistoryEventDto::state)
            .containsExactly("updated", "opened");
        assertThat(response.incidents().get(1).status()).isEqualTo("cleared");
        assertThat(response.incidents().get(1).latestState()).isEqualTo("cleared");
        assertThat(response.incidents().get(1).events())
            .extracting(AlertHistoryResponses.AlertHistoryEventDto::state)
            .containsExactly("cleared", "opened");
    }

    @Test
    void supportsSevenAndThirtyDayPeriods() {
        when(repository.findLifecycleRows(
            OffsetDateTime.parse("2026-06-16T12:30:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            300
        )).thenReturn(List.of());
        when(repository.findLifecycleRows(
            OffsetDateTime.parse("2026-05-24T12:30:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            300
        )).thenReturn(List.of());

        assertThat(service.history("7d", 300).period()).isEqualTo("7d");
        assertThat(service.history("30d", 300).period()).isEqualTo("30d");
    }

    @Test
    void readsRegionalSnapshotsAndAddsGoCorridorIdentity() {
        when(repository.findRegionalLifecycleRows(
            OffsetDateTime.parse("2026-06-23T00:00:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            300
        )).thenReturn(List.of(
            new AlertHistoryRepository.AlertHistoryRow(
                1L, "regional-alert-1", "source-1", "regional-le", null, null,
                "Lakeshore East service adjustment", "Trains are delayed between stations.",
                OffsetDateTime.parse("2026-06-23T12:05:00-04:00"), true,
                OffsetDateTime.parse("2026-06-23T12:05:00-04:00"), "delay", "metrolinx-go-service-alerts",
                "delay", "union", "pickering", null, "operational issue", null, "opened", 1L
            )
        ));

        AlertHistoryResponses.AlertHistoryResponse response = service.history("regional", "today", 300);

        assertThat(response.incidents()).singleElement().satisfies(incident -> {
            assertThat(incident.lineNumber()).isEqualTo("LE");
            assertThat(incident.lineName()).isEqualTo("Lakeshore East");
            assertThat(incident.location()).isEqualTo("Union to Pickering");
            assertThat(incident.source()).isEqualTo("Metrolinx Open API");
        });
        verify(repository).findRegionalLifecycleRows(
            OffsetDateTime.parse("2026-06-23T00:00:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            300
        );
    }

    @Test
    void defaultsToFiveThousandRowsForNoisyThirtyDayHistory() {
        when(repository.findLifecycleRows(
            OffsetDateTime.parse("2026-05-24T12:30:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            5_000
        )).thenReturn(List.of());

        AlertHistoryResponses.AlertHistoryResponse response = service.history("30d", null);

        assertThat(response.period()).isEqualTo("30d");
    }

    @Test
    void capsRequestedLimitAtFiveThousandRows() {
        when(repository.findLifecycleRows(
            OffsetDateTime.parse("2026-05-24T12:30:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            5_000
        )).thenReturn(List.of());

        AlertHistoryResponses.AlertHistoryResponse response = service.history("30d", 10_000);

        assertThat(response.period()).isEqualTo("30d");
    }

    @Test
    void mapsBidirectionalToBothWays() {
        when(repository.findLifecycleRows(
            OffsetDateTime.parse("2026-06-23T00:00:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            300
        )).thenReturn(List.of(
            rowWithDirection(1L, "ttc-route-1", true, "opened", "2026-06-23T12:05:00-04:00", "bidirectional")
        ));

        AlertHistoryResponses.AlertHistoryResponse response = service.history("today", 300);

        assertThat(response.incidents()).singleElement().satisfies(incident -> {
            assertThat(incident.displayDirection()).isEqualTo("Both Ways");
        });
    }

    private AlertHistoryRepository.AlertHistoryRow rowWithDirection(
        long id,
        String alertId,
        boolean active,
        String lifecycleState,
        String snapshotTime,
        String direction
    ) {
        return new AlertHistoryRepository.AlertHistoryRow(
            id,
            alertId,
            "source-1",
            "line-2",
            "2",
            "Bloor-Danforth",
            "Line 2 Bloor-Danforth: Delays westbound at Warden station while we fix a mechanical problem.",
            "Delays westbound at Warden station while we fix a mechanical problem.",
            OffsetDateTime.parse(snapshotTime),
            active,
            OffsetDateTime.parse(snapshotTime),
            "suspension",
            "Live",
            "suspension",
            "warden",
            "warden",
            direction,
            "MECHANICAL_PROBLEM",
            "Mechanical Problem",
            lifecycleState,
            1L
        );
    }

    @Test
    void historyCasingHandlesTmuCorrectly() {
        when(repository.findLifecycleRows(
            OffsetDateTime.parse("2026-06-23T00:00:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            300
        )).thenReturn(List.of(
            rowWithStation(1L, "ttc-route-1", true, "opened", "2026-06-23T12:05:00-04:00", "tmu")
        ));

        AlertHistoryResponses.AlertHistoryResponse response = service.history("today", 300);

        assertThat(response.incidents()).singleElement().satisfies(incident -> {
            assertThat(incident.location()).isEqualTo("TMU");
        });
    }

    private AlertHistoryRepository.AlertHistoryRow rowWithStation(
        long id,
        String alertId,
        boolean active,
        String lifecycleState,
        String snapshotTime,
        String stationId
    ) {
        return new AlertHistoryRepository.AlertHistoryRow(
            id,
            alertId,
            "source-1",
            "line-1",
            "1",
            "Yonge-University",
            "Line 1 Yonge-University: Delays at TMU.",
            "Delays at TMU.",
            OffsetDateTime.parse(snapshotTime),
            active,
            OffsetDateTime.parse(snapshotTime),
            "suspension",
            "Live",
            "suspension",
            stationId,
            stationId,
            "northbound",
            "MECHANICAL_PROBLEM",
            "Mechanical Problem",
            lifecycleState,
            1L
        );
    }

    private AlertHistoryRepository.AlertHistoryRow row(
        long id,
        String alertId,
        boolean active,
        String lifecycleState,
        String snapshotTime
    ) {
        return row(id, alertId, active, lifecycleState, snapshotTime, 1L);
    }

    private AlertHistoryRepository.AlertHistoryRow row(
        long id,
        String alertId,
        boolean active,
        String lifecycleState,
        String snapshotTime,
        long occurrenceNumber
    ) {
        return new AlertHistoryRepository.AlertHistoryRow(
            id,
            alertId,
            "source-1",
            "line-2",
            "2",
            "Bloor-Danforth",
            "Line 2 Bloor-Danforth: Delays westbound at Warden station while we fix a mechanical problem.",
            "Delays westbound at Warden station while we fix a mechanical problem.",
            OffsetDateTime.parse(snapshotTime),
            active,
            OffsetDateTime.parse(snapshotTime),
            "suspension",
            "Live",
            "suspension",
            "warden",
            "warden",
            "westbound",
            "MECHANICAL_PROBLEM",
            "Mechanical Problem",
            lifecycleState,
            occurrenceNumber
        );
    }
}
