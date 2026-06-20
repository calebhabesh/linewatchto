package com.calebhabesh.linewatch.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleRefreshRunService;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleRefreshRunSnapshot;
import com.calebhabesh.linewatch.ingestion.AlertIngestionProperties;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LinewatchHealthMetricsTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-20T19:00:00Z"), ZoneOffset.UTC);

    private IngestionRunStore ingestionRunStore;
    private IngestionFreshness ingestionFreshness;
    private GtfsScheduleReadRepository scheduleReadRepository;
    private GtfsScheduleRefreshRunService scheduleRefreshRunService;
    private ArrivalProperties arrivalProperties;
    private SimpleMeterRegistry registry;
    private LinewatchHealthMetrics metrics;

    @BeforeEach
    void setUp() {
        ingestionRunStore = mock(IngestionRunStore.class);

        AlertIngestionProperties alertProperties = new AlertIngestionProperties();
        alertProperties.setMaxDashboardAge(Duration.ofMinutes(10));
        ingestionFreshness = new IngestionFreshness(ingestionRunStore, alertProperties, CLOCK);

        scheduleReadRepository = mock(GtfsScheduleReadRepository.class);
        scheduleRefreshRunService = mock(GtfsScheduleRefreshRunService.class);
        arrivalProperties = new ArrivalProperties();
        arrivalProperties.setGtfsRefreshMinServiceDaysRemaining(14);

        metrics = new LinewatchHealthMetrics(
            ingestionRunStore,
            ingestionFreshness,
            scheduleReadRepository,
            scheduleRefreshRunService,
            arrivalProperties,
            CLOCK
        );

        registry = new SimpleMeterRegistry();
        metrics.bindTo(registry);
    }

    @Test
    void reportsNoIngestionRun() {
        when(ingestionRunStore.findLatest()).thenReturn(Optional.empty());

        assertThat(registry.get("linewatch_ingestion_dashboard_live").gauge().value()).isEqualTo(0.0);
        assertThat(registry.get("linewatch_ingestion_run_age_seconds").gauge().value()).isNaN();
        assertThat(registry.get("linewatch_ingestion_records_fetched").gauge().value()).isNaN();

        // Status checks
        assertThat(registry.get("linewatch_ingestion_latest_status").tag("status", "not-run").gauge().value()).isEqualTo(1.0);
        assertThat(registry.get("linewatch_ingestion_latest_status").tag("status", "success").gauge().value()).isEqualTo(0.0);
        assertThat(registry.get("linewatch_ingestion_latest_status").tag("status", "failed").gauge().value()).isEqualTo(0.0);
        assertThat(registry.get("linewatch_ingestion_latest_status").tag("status", "running").gauge().value()).isEqualTo(0.0);
    }

    @Test
    void reportsSuccessfulFreshIngestion() {
        IngestionRunSnapshot run = new IngestionRunSnapshot(
            42L,
            "success",
            OffsetDateTime.parse("2026-06-20T18:55:00Z"),
            OffsetDateTime.parse("2026-06-20T18:56:00Z"),
            100,
            80,
            75,
            5,
            OffsetDateTime.parse("2026-06-20T18:54:00Z"),
            null
        );
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(run));

        assertThat(registry.get("linewatch_ingestion_dashboard_live").gauge().value()).isEqualTo(1.0);
        // 19:00:00Z - 18:55:00Z = 5 minutes = 300 seconds
        assertThat(registry.get("linewatch_ingestion_run_age_seconds").gauge().value()).isEqualTo(300.0);
        assertThat(registry.get("linewatch_ingestion_records_fetched").gauge().value()).isEqualTo(100.0);
        assertThat(registry.get("linewatch_ingestion_records_staged").gauge().value()).isEqualTo(80.0);
        assertThat(registry.get("linewatch_ingestion_records_normalized").gauge().value()).isEqualTo(75.0);
        assertThat(registry.get("linewatch_ingestion_records_unmatched").gauge().value()).isEqualTo(5.0);

        assertThat(registry.get("linewatch_ingestion_latest_status").tag("status", "success").gauge().value()).isEqualTo(1.0);
        assertThat(registry.get("linewatch_ingestion_latest_status").tag("status", "not-run").gauge().value()).isEqualTo(0.0);
    }

    @Test
    void reportsSuccessfulStaleIngestion() {
        IngestionRunSnapshot run = new IngestionRunSnapshot(
            42L,
            "success",
            OffsetDateTime.parse("2026-06-20T18:45:00Z"),
            OffsetDateTime.parse("2026-06-20T18:46:00Z"),
            100,
            80,
            75,
            5,
            OffsetDateTime.parse("2026-06-20T18:44:00Z"),
            null
        );
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(run));

        assertThat(registry.get("linewatch_ingestion_dashboard_live").gauge().value()).isEqualTo(0.0);
        assertThat(registry.get("linewatch_ingestion_run_age_seconds").gauge().value()).isEqualTo(900.0);
    }

    @Test
    void reportsActiveScheduleAndRefreshSuccess() {
        LocalDate serviceEnd = LocalDate.parse("2026-07-20"); // 30 days from 2026-06-20
        GtfsScheduleReadRepository.ActiveScheduleImport activeImport = new GtfsScheduleReadRepository.ActiveScheduleImport(
            1L,
            "TTC merged GTFS schedule",
            "https://example.test/source",
            OffsetDateTime.parse("2026-06-19T00:00:00Z"),
            LocalDate.parse("2026-06-19"),
            serviceEnd
        );
        when(scheduleReadRepository.findActiveImport()).thenReturn(Optional.of(activeImport));

        GtfsScheduleRefreshRunSnapshot refreshRun = new GtfsScheduleRefreshRunSnapshot(
            10L,
            "success",
            OffsetDateTime.parse("2026-06-20T18:50:00Z"),
            OffsetDateTime.parse("2026-06-20T18:52:00Z"),
            5000,
            null
        );
        when(scheduleRefreshRunService.latest()).thenReturn(Optional.of(refreshRun));

        assertThat(registry.get("linewatch_schedule_active").gauge().value()).isEqualTo(1.0);
        assertThat(registry.get("linewatch_schedule_service_days_remaining").gauge().value()).isEqualTo(30.0);
        // 19:00:00Z - 18:50:00Z = 10 minutes = 600 seconds
        assertThat(registry.get("linewatch_schedule_refresh_age_seconds").gauge().value()).isEqualTo(600.0);
        assertThat(registry.get("linewatch_schedule_refresh_records_processed").gauge().value()).isEqualTo(5000.0);

        assertThat(registry.get("linewatch_schedule_refresh_status").tag("status", "success").gauge().value()).isEqualTo(1.0);
        assertThat(registry.get("linewatch_schedule_refresh_status").tag("status", "never-run").gauge().value()).isEqualTo(0.0);
    }

    @Test
    void reportsActiveScheduleWithFailedLatestRefresh() {
        LocalDate serviceEnd = LocalDate.parse("2026-07-20");
        GtfsScheduleReadRepository.ActiveScheduleImport activeImport = new GtfsScheduleReadRepository.ActiveScheduleImport(
            1L,
            "TTC merged GTFS schedule",
            "https://example.test/source",
            OffsetDateTime.parse("2026-06-19T00:00:00Z"),
            LocalDate.parse("2026-06-19"),
            serviceEnd
        );
        when(scheduleReadRepository.findActiveImport()).thenReturn(Optional.of(activeImport));

        GtfsScheduleRefreshRunSnapshot refreshRun = new GtfsScheduleRefreshRunSnapshot(
            11L,
            "failed",
            OffsetDateTime.parse("2026-06-20T18:50:00Z"),
            OffsetDateTime.parse("2026-06-20T18:51:00Z"),
            0,
            "Disk space full"
        );
        when(scheduleRefreshRunService.latest()).thenReturn(Optional.of(refreshRun));

        // Active schedule remains reported independently of failed refresh
        assertThat(registry.get("linewatch_schedule_active").gauge().value()).isEqualTo(1.0);
        assertThat(registry.get("linewatch_schedule_service_days_remaining").gauge().value()).isEqualTo(30.0);

        assertThat(registry.get("linewatch_schedule_refresh_status").tag("status", "failed").gauge().value()).isEqualTo(1.0);
    }
}
