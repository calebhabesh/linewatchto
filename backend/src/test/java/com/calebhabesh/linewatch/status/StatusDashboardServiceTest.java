package com.calebhabesh.linewatch.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.alert.AlertEntity;
import com.calebhabesh.linewatch.alert.AlertRepository;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.AlertIngestionProperties;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.station.TransitLineRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class StatusDashboardServiceTest {
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
    private final AlertDashboardService alertDashboardService = mock(AlertDashboardService.class);
    private final DashboardCacheService cache = mock(DashboardCacheService.class);
    private final DashboardCacheProperties cacheProperties = new DashboardCacheProperties();

    private final StatusDashboardService service = new StatusDashboardService(
            repository,
            alertRepository,
            ingestionRunStore,
            freshness,
            alertDashboardService,
            CLOCK,
            cache,
            cacheProperties
    );

    @BeforeEach
    void setUp() {
        when(cache.getOrCompute(any(), any(), any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(3);
            return supplier.get();
        });
    }

    @Test
    void doesNotClaimLiveModeBeforeFirstSuccessfulIngestionRun() {
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
                new TransitLineEntity("line-1", "1", "Yonge-University", "#F8C300", 1)
        ));
        when(alertRepository.findByActiveTrueAndType("active-alert")).thenReturn(List.of());
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.empty());

        StatusController.StatusResponse response = service.getStatus();

        assertThat(response.generatedAt().live()).isFalse();
        assertThat(response.generatedAt().lastPoll()).isEqualTo("not run");
        assertThat(response.lines()).hasSize(1);
        assertThat(response.lines().getFirst().status()).isEqualTo("normal");
    }

    @Test
    void marksLineSuspendedFromNormalizedActiveAlertsAfterSuccessfulIngestion() {
        TransitLineEntity line2 = new TransitLineEntity("line-2", "2", "Bloor-Danforth", "#00923F", 2);
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(line2));
        AlertEntity alert = alert("line-2", "suspension", "No service", "2026-06-01T11:50:00Z");
        when(alertRepository.findByActiveTrueAndType("active-alert")).thenReturn(List.of(alert));

        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:59:00Z");
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.of(new IngestionRunSnapshot(
                12L, "success", completedAt.minusSeconds(5), completedAt,
                8, 8, 2, 0, completedAt.minusMinutes(1), null
        )));

        StatusController.StatusResponse response = service.getStatus();

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
    void cachesStatusPayloadWithFreshnessBoundedTtl() {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:50:20Z");
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.of(new IngestionRunSnapshot(
            15L, "success", completedAt.minusSeconds(1), completedAt, 5, 5, 0, 0, completedAt, null
        )));
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of());
        when(alertRepository.findByActiveTrueAndType("active-alert")).thenReturn(List.of());

        service.getStatus();

        verify(cache).getOrCompute(
            eq("status"),
            any(),
            eq(Duration.ofSeconds(20)),
            any()
        );
    }

    @Test
    void constructorRejectsNullArguments() {
        assertThatThrownBy(() -> new StatusDashboardService(
            null, alertRepository, ingestionRunStore, freshness, alertDashboardService, CLOCK, cache, cacheProperties
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new StatusDashboardService(
            repository, null, ingestionRunStore, freshness, alertDashboardService, CLOCK, cache, cacheProperties
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new StatusDashboardService(
            repository, alertRepository, null, freshness, alertDashboardService, CLOCK, cache, cacheProperties
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new StatusDashboardService(
            repository, alertRepository, ingestionRunStore, null, alertDashboardService, CLOCK, cache, cacheProperties
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new StatusDashboardService(
            repository, alertRepository, ingestionRunStore, freshness, null, CLOCK, cache, cacheProperties
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new StatusDashboardService(
            repository, alertRepository, ingestionRunStore, freshness, alertDashboardService, null, cache, cacheProperties
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new StatusDashboardService(
            repository, alertRepository, ingestionRunStore, freshness, alertDashboardService, CLOCK, null, cacheProperties
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new StatusDashboardService(
            repository, alertRepository, ingestionRunStore, freshness, alertDashboardService, CLOCK, cache, null
        )).isInstanceOf(NullPointerException.class);
    }

    private AlertEntity alert(
            String lineId,
            String severity,
            String title,
            String sourceUpdatedAt
    ) {
        AlertEntity alert = newAlertEntity();
        org.springframework.test.util.ReflectionTestUtils.setField(alert, "id", "ttc-route-test");
        org.springframework.test.util.ReflectionTestUtils.setField(alert, "line", new TransitLineEntity(
                lineId,
                lineId.replace("line-", ""),
                "Test Line",
                "#fff",
                1
        ));
        org.springframework.test.util.ReflectionTestUtils.setField(alert, "severity", severity);
        org.springframework.test.util.ReflectionTestUtils.setField(alert, "impactKind", severity.equals("suspension") ? "suspension" : "delay");
        org.springframework.test.util.ReflectionTestUtils.setField(alert, "title", title);
        org.springframework.test.util.ReflectionTestUtils.setField(alert, "sourceUpdatedAt", OffsetDateTime.parse(sourceUpdatedAt));
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
