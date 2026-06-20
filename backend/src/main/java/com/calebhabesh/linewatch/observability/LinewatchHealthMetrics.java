package com.calebhabesh.linewatch.observability;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleRefreshRunService;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleRefreshRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

@Component
public class LinewatchHealthMetrics implements MeterBinder {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private final IngestionRunStore ingestionRunStore;
    private final IngestionFreshness ingestionFreshness;
    private final GtfsScheduleReadRepository scheduleReadRepository;
    private final GtfsScheduleRefreshRunService scheduleRefreshRunService;
    private final ArrivalProperties arrivalProperties;
    private final Clock clock;

    public LinewatchHealthMetrics(
            IngestionRunStore ingestionRunStore,
            IngestionFreshness ingestionFreshness,
            GtfsScheduleReadRepository scheduleReadRepository,
            GtfsScheduleRefreshRunService scheduleRefreshRunService,
            ArrivalProperties arrivalProperties,
            Clock clock
    ) {
        this.ingestionRunStore = ingestionRunStore;
        this.ingestionFreshness = ingestionFreshness;
        this.scheduleReadRepository = scheduleReadRepository;
        this.scheduleRefreshRunService = scheduleRefreshRunService;
        this.arrivalProperties = arrivalProperties;
        this.clock = clock;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        // Ingestion metrics
        Gauge.builder("linewatch_ingestion_dashboard_live", this, LinewatchHealthMetrics::getDashboardLive)
                .description("Whether the dashboard has a fresh successful ingestion run")
                .register(registry);

        Gauge.builder("linewatch_ingestion_run_age_seconds", this, LinewatchHealthMetrics::getIngestionRunAgeSeconds)
                .description("Age of the latest ingestion run in seconds")
                .register(registry);

        Gauge.builder("linewatch_ingestion_records_fetched", this, LinewatchHealthMetrics::getIngestionRecordsFetched)
                .description("Number of records fetched in the latest ingestion run")
                .register(registry);

        Gauge.builder("linewatch_ingestion_records_staged", this, LinewatchHealthMetrics::getIngestionRecordsStaged)
                .description("Number of records staged in the latest ingestion run")
                .register(registry);

        Gauge.builder("linewatch_ingestion_records_normalized", this, LinewatchHealthMetrics::getIngestionRecordsNormalized)
                .description("Number of records normalized in the latest ingestion run")
                .register(registry);

        Gauge.builder("linewatch_ingestion_records_unmatched", this, LinewatchHealthMetrics::getIngestionRecordsUnmatched)
                .description("Number of records unmatched in the latest ingestion run")
                .register(registry);

        for (String status : List.of("success", "failed", "running", "not-run")) {
            Gauge.builder("linewatch_ingestion_latest_status", () -> getIngestionStatusGauge(status))
                    .tag("status", status)
                    .description("The status of the latest ingestion run")
                    .register(registry);
        }

        // Schedule metrics
        Gauge.builder("linewatch_schedule_active", this, LinewatchHealthMetrics::getScheduleActive)
                .description("Whether a GTFS schedule import is active and not expired")
                .register(registry);

        Gauge.builder("linewatch_schedule_service_days_remaining", this, LinewatchHealthMetrics::getScheduleServiceDaysRemaining)
                .description("Number of days remaining in the active GTFS schedule import")
                .register(registry);

        Gauge.builder("linewatch_schedule_refresh_age_seconds", this, LinewatchHealthMetrics::getScheduleRefreshAgeSeconds)
                .description("Age of the latest schedule refresh run in seconds")
                .register(registry);

        Gauge.builder("linewatch_schedule_refresh_records_processed", this, LinewatchHealthMetrics::getScheduleRefreshRecordsProcessed)
                .description("Number of records processed in the latest schedule refresh run")
                .register(registry);

        for (String status : List.of("success", "failed", "running", "never-run")) {
            Gauge.builder("linewatch_schedule_refresh_status", () -> getScheduleRefreshStatusGauge(status))
                    .tag("status", status)
                    .description("The status of the latest schedule refresh run")
                    .register(registry);
        }
    }

    private double getDashboardLive() {
        Optional<IngestionRunSnapshot> run = ingestionRunStore.findLatest();
        return ingestionFreshness.isFresh(run) ? 1.0 : 0.0;
    }

    private double getIngestionRunAgeSeconds() {
        return ingestionRunStore.findLatest()
                .map(run -> (double) ChronoUnit.SECONDS.between(run.startedAt(), OffsetDateTime.now(clock)))
                .orElse(Double.NaN);
    }

    private double getIngestionRecordsFetched() {
        return ingestionRunStore.findLatest()
                .map(run -> (double) run.recordsFetched())
                .orElse(Double.NaN);
    }

    private double getIngestionRecordsStaged() {
        return ingestionRunStore.findLatest()
                .map(run -> (double) run.recordsStaged())
                .orElse(Double.NaN);
    }

    private double getIngestionRecordsNormalized() {
        return ingestionRunStore.findLatest()
                .map(run -> (double) run.recordsNormalized())
                .orElse(Double.NaN);
    }

    private double getIngestionRecordsUnmatched() {
        return ingestionRunStore.findLatest()
                .map(run -> (double) run.recordsUnmatched())
                .orElse(Double.NaN);
    }

    private double getIngestionStatusGauge(String targetStatus) {
        Optional<IngestionRunSnapshot> latest = ingestionRunStore.findLatest();
        String currentStatus = latest.map(IngestionRunSnapshot::status).orElse("not-run");
        return currentStatus.equals(targetStatus) ? 1.0 : 0.0;
    }

    private double getScheduleActive() {
        return scheduleReadRepository.findActiveImport()
                .map(activeImport -> {
                    LocalDate serviceEnd = activeImport.serviceEnd();
                    if (serviceEnd == null) {
                        return 0.0;
                    }
                    long days = ChronoUnit.DAYS.between(LocalDate.now(clock.withZone(TORONTO_ZONE)), serviceEnd);
                    return days >= 0 ? 1.0 : 0.0;
                })
                .orElse(0.0);
    }

    private double getScheduleServiceDaysRemaining() {
        return scheduleReadRepository.findActiveImport()
                .map(activeImport -> {
                    LocalDate serviceEnd = activeImport.serviceEnd();
                    if (serviceEnd == null) {
                        return Double.NaN;
                    }
                    long days = ChronoUnit.DAYS.between(LocalDate.now(clock.withZone(TORONTO_ZONE)), serviceEnd);
                    return (double) days;
                })
                .orElse(Double.NaN);
    }

    private double getScheduleRefreshAgeSeconds() {
        return scheduleRefreshRunService.latest()
                .map(run -> (double) ChronoUnit.SECONDS.between(run.startedAt(), OffsetDateTime.now(clock)))
                .orElse(Double.NaN);
    }

    private double getScheduleRefreshRecordsProcessed() {
        return scheduleRefreshRunService.latest()
                .map(run -> (double) run.recordsProcessed())
                .orElse(Double.NaN);
    }

    private double getScheduleRefreshStatusGauge(String targetStatus) {
        Optional<GtfsScheduleRefreshRunSnapshot> latest = scheduleRefreshRunService.latest();
        String currentStatus = latest.map(GtfsScheduleRefreshRunSnapshot::status).orElse("never-run");
        return currentStatus.equals(targetStatus) ? 1.0 : 0.0;
    }
}
