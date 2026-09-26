package com.calebhabesh.linewatch.dashboard;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.alert.TtcDashboardReadModel;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.map.MapDashboardService;
import com.calebhabesh.linewatch.performance.TtcPerformanceResponses;
import com.calebhabesh.linewatch.performance.TtcPerformanceService;
import com.calebhabesh.linewatch.status.StatusController;
import com.calebhabesh.linewatch.status.StatusDashboardService;
import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class TtcDashboardService {

    private final Function<Supplier<TtcDashboardReadModel>, MapController.MapResponse> mapFunction;
    private final Function<Supplier<TtcDashboardReadModel>, StatusController.StatusResponse> statusFunction;
    private final AlertDashboardService alertDashboardService;
    private final Supplier<TtcPerformanceResponses.SnapshotResponse> performanceSupplier;
    private final IngestionFreshness ingestionFreshness;
    private final IngestionRunStore ingestionRunStore;

    @Autowired
    public TtcDashboardService(
        MapDashboardService mapDashboardService,
        StatusDashboardService statusDashboardService,
        AlertDashboardService alertDashboardService,
        TtcPerformanceService performanceService,
        IngestionFreshness ingestionFreshness,
        IngestionRunStore ingestionRunStore
    ) {
        this(
            mapDashboardService != null ? mapDashboardService::getMap : supplier -> null,
            statusDashboardService != null ? statusDashboardService::getStatus : supplier -> null,
            alertDashboardService,
            performanceService != null ? performanceService::performance : () -> null,
            ingestionFreshness,
            ingestionRunStore
        );
    }

    public TtcDashboardService(
        Supplier<MapController.MapResponse> mapSupplier,
        Supplier<StatusController.StatusResponse> statusSupplier,
        AlertDashboardService alertDashboardService,
        Supplier<TtcPerformanceResponses.SnapshotResponse> performanceSupplier,
        IngestionFreshness ingestionFreshness,
        IngestionRunStore ingestionRunStore
    ) {
        this(
            toFunction(Objects.requireNonNull(mapSupplier, "mapSupplier must not be null")),
            toFunction(Objects.requireNonNull(statusSupplier, "statusSupplier must not be null")),
            alertDashboardService,
            performanceSupplier,
            ingestionFreshness,
            ingestionRunStore
        );
    }

    private static <T> Function<Supplier<TtcDashboardReadModel>, T> toFunction(Supplier<T> supplier) {
        return ignored -> supplier.get();
    }

    public TtcDashboardService(
        Function<Supplier<TtcDashboardReadModel>, MapController.MapResponse> mapFunction,
        Function<Supplier<TtcDashboardReadModel>, StatusController.StatusResponse> statusFunction,
        AlertDashboardService alertDashboardService,
        Supplier<TtcPerformanceResponses.SnapshotResponse> performanceSupplier,
        IngestionFreshness ingestionFreshness,
        IngestionRunStore ingestionRunStore
    ) {
        this.mapFunction = Objects.requireNonNull(mapFunction, "mapFunction must not be null");
        this.statusFunction = Objects.requireNonNull(statusFunction, "statusFunction must not be null");
        this.alertDashboardService = Objects.requireNonNull(alertDashboardService, "alertDashboardService must not be null");
        this.performanceSupplier = Objects.requireNonNull(performanceSupplier, "performanceSupplier must not be null");
        this.ingestionFreshness = Objects.requireNonNull(ingestionFreshness, "ingestionFreshness must not be null");
        this.ingestionRunStore = Objects.requireNonNull(ingestionRunStore, "ingestionRunStore must not be null");
    }

    public Optional<Duration> remainingFreshness() {
        return ingestionFreshness.remainingFreshness(ingestionRunStore.findLatestSuccessful());
    }

    public DashboardResponses.DashboardResponse dashboard() {
        Optional<IngestionRunSnapshot> latestSuccessful = ingestionRunStore.findLatestSuccessful();
        Supplier<TtcDashboardReadModel> readModelSupplier = memoize(() -> alertDashboardService.createReadModel(latestSuccessful));

        StatusController.StatusResponse status = statusFunction.apply(readModelSupplier);
        boolean live = status != null && status.generatedAt() != null && status.generatedAt().live();
        String availability = live ? ttcAvailability() : "unavailable";
        MapController.MapResponse map = mapFunction.apply(readModelSupplier);

        TtcDashboardReadModel readModel = readModelSupplier.get();
        List<AlertDashboardService.ActiveAlertDto> activeAlerts = readModel != null
            ? alertDashboardService.activeAlerts(readModel)
            : alertDashboardService.activeAlerts();
        List<AlertDashboardService.DelayAlertDto> delays = readModel != null
            ? alertDashboardService.delays(readModel)
            : alertDashboardService.delays();
        List<AlertDashboardService.ReducedSpeedZoneDto> reducedSpeedZones = readModel != null
            ? alertDashboardService.reducedSpeedZones(readModel)
            : alertDashboardService.reducedSpeedZones();
        List<AlertDashboardService.PlannedClosureDto> plannedClosures = readModel != null
            ? alertDashboardService.plannedClosures(readModel)
            : alertDashboardService.plannedClosures();

        return new DashboardResponses.DashboardResponse(
            "ttc",
            availability,
            List.of("ttc-live-alerts", "ttc-scheduled-service"),
            ttcMessage(availability),
            map,
            status,
            activeAlerts,
            delays,
            reducedSpeedZones,
            plannedClosures,
            performanceSupplier.get()
        );
    }

    public String ttcAvailability() {
        return ingestionRunStore.findLatest()
            .filter(run -> "failed".equalsIgnoreCase(run.status()))
            .map(ignored -> "degraded")
            .orElse("available");
    }

    public String ttcMessage(String availability) {
        return switch (availability) {
            case "degraded" -> "The latest TTC refresh failed; LineWatchTO is retaining the last successful fresh snapshot.";
            case "unavailable" -> "TTC service-alert data is unavailable because the last successful snapshot is missing or stale.";
            default -> "Fresh TTC dashboard data loaded from the last successful ingestion snapshot.";
        };
    }

    private static <T> Supplier<T> memoize(Supplier<T> delegate) {
        return new Supplier<>() {
            private volatile boolean initialized;
            private T value;

            @Override
            public T get() {
                if (!initialized) {
                    synchronized (this) {
                        if (!initialized) {
                            value = delegate.get();
                            initialized = true;
                        }
                    }
                }
                return value;
            }
        };
    }
}
