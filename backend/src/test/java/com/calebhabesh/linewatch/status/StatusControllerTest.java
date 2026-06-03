package com.calebhabesh.linewatch.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.AlertEntity;
import com.calebhabesh.linewatch.alert.AlertRepository;
import com.calebhabesh.linewatch.ingestion.AlertIngestionProperties;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import java.util.List;
import java.util.Optional;

import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.station.TransitLineRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class StatusControllerTest {
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-06-01T12:00:00Z"),
            ZoneOffset.UTC
    );

    private final TransitLineRepository repository = mock(TransitLineRepository.class);
    private final AlertRepository alertRepository = mock(AlertRepository.class);
    private final IngestionRunStore ingestionRunStore = mock(IngestionRunStore.class);
    private final IngestionFreshness freshness = new IngestionFreshness(
            ingestionRunStore,
            new AlertIngestionProperties(),
            CLOCK
    );
    private final StatusController controller = new StatusController(
            repository,
            alertRepository,
            ingestionRunStore,
            freshness,
            CLOCK
    );

    @Test
    void doesNotClaimLiveModeBeforeFirstSuccessfulIngestionRun() {
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
                new TransitLineEntity("line-1", "1", "Yonge-University", "#F8C300", 1)
        ));
        when(alertRepository.findByActiveTrueAndType("active-alert")).thenReturn(List.of());
        when(ingestionRunStore.findLatest()).thenReturn(Optional.empty());

        StatusController.StatusResponse response = controller.getStatus();

        assertThat(response.generatedAt().live()).isFalse();
        assertThat(response.generatedAt().lastPoll()).isEqualTo("not run");
        assertThat(response.lines()).hasSize(1);
        assertThat(response.lines().getFirst().status()).isEqualTo("normal");
    }

    @Test
    void marksLineSuspendedFromNormalizedActiveAlertsAfterSuccessfulIngestion() {
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
                new TransitLineEntity("line-2", "2", "Bloor-Danforth", "#00923F", 2)
        ));
        when(alertRepository.findByActiveTrueAndType("active-alert")).thenReturn(List.of(
                alert("line-2", "suspension", "No service", "2026-06-01T11:50:00Z")
        ));
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:59:00Z");
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
                12L, "success", completedAt.minusSeconds(5), completedAt,
                8, 8, 2, 0, completedAt.minusMinutes(1), null
        )));

        StatusController.StatusResponse response = controller.getStatus();

        assertThat(response.generatedAt().live()).isTrue();
        assertThat(response.generatedAt().lastPoll()).isEqualTo("succeeded 1 min ago");
        assertThat(response.lines()).singleElement().satisfies(line -> {
            assertThat(line.status()).isEqualTo("suspension");
            assertThat(line.statusLabel()).isEqualTo("Suspended");
            assertThat(line.summary()).isEqualTo("No service");
            assertThat(line.updatedAgo()).isEqualTo("Updated 10 min ago");
        });
    }

    @Test
    void doesNotUseOldActiveAlertsWhenLatestSuccessfulPollIsStale() {
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
                new TransitLineEntity("line-2", "2", "Bloor-Danforth", "#00923F", 2)
        ));
        when(alertRepository.findByActiveTrueAndType("active-alert")).thenReturn(List.of(
                alert("line-2", "delay", "Old delay", "2026-06-01T11:00:00Z")
        ));
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:45:00Z");
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
                12L, "success", completedAt.minusSeconds(5), completedAt,
                8, 8, 2, 0, completedAt.minusMinutes(1), null
        )));

        StatusController.StatusResponse response = controller.getStatus();

        assertThat(response.generatedAt().live()).isFalse();
        assertThat(response.generatedAt().lastPoll()).isEqualTo("succeeded 15 min ago");
        assertThat(response.lines()).singleElement().satisfies(line -> {
            assertThat(line.status()).isEqualTo("normal");
            assertThat(line.statusLabel()).isEqualTo("Normal");
            assertThat(line.summary()).isEqualTo("No active service impacts reported.");
        });
    }

    @Test
    void formatsPollLabelsConcisely() {
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of());
        when(alertRepository.findByActiveTrueAndType("active-alert")).thenReturn(List.of());

        // Failed
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
                1L, "failed", null, null, 0, 0, 0, 0, null, null
        )));
        assertThat(controller.getStatus().generatedAt().lastPoll()).isEqualTo("failed");

        // Running
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
                2L, "running", null, null, 0, 0, 0, 0, null, null
        )));
        assertThat(controller.getStatus().generatedAt().lastPoll()).isEqualTo("running");

        // Succeeded just now
        OffsetDateTime now = OffsetDateTime.now(CLOCK);
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
                3L, "success", now, now, 0, 0, 0, 0, null, null
        )));
        assertThat(controller.getStatus().generatedAt().lastPoll()).isEqualTo("succeeded just now");

        // Succeeded 2 hr ago
        OffsetDateTime twoHrAgo = now.minusHours(2);
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
                4L, "success", twoHrAgo, twoHrAgo, 0, 0, 0, 0, null, null
        )));
        assertThat(controller.getStatus().generatedAt().lastPoll()).isEqualTo("succeeded 2 hr ago");

        // Succeeded 3 days ago
        OffsetDateTime threeDaysAgo = now.minusDays(3);
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
                5L, "success", threeDaysAgo, threeDaysAgo, 0, 0, 0, 0, null, null
        )));
        assertThat(controller.getStatus().generatedAt().lastPoll()).isEqualTo("succeeded 3 days ago");
    }

    private AlertEntity alert(
            String lineId,
            String severity,
            String title,
            String sourceUpdatedAt
    ) {
        AlertEntity alert = newAlertEntity();
        ReflectionTestUtils.setField(alert, "id", "ttc-route-test");
        ReflectionTestUtils.setField(alert, "line", new TransitLineEntity(
                lineId,
                lineId.replace("line-", ""),
                "Test Line",
                "#fff",
                1
        ));
        ReflectionTestUtils.setField(alert, "severity", severity);
        ReflectionTestUtils.setField(alert, "title", title);
        ReflectionTestUtils.setField(alert, "sourceUpdatedAt", OffsetDateTime.parse(sourceUpdatedAt));
        return alert;
    }

    private AlertEntity newAlertEntity() {
        try {
            var constructor = AlertEntity.class.getDeclaredConstructor();
            constructor.setAccessible(true);
            return constructor.newInstance();
        } catch (ReflectiveOperationException exception) {
            throw new AssertionError("Unable to construct AlertEntity for test", exception);
        }
    }
}
