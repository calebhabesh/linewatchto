package com.calebhabesh.linewatch.arrival.schedule;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    prefix = "linewatch.arrivals",
    name = "gtfs-refresh-enabled",
    havingValue = "true"
)
public class GtfsScheduleActivationJob {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private final ArrivalProperties properties;
    private final GtfsScheduleImportRepository repository;
    private final Clock clock;

    public GtfsScheduleActivationJob(
        ArrivalProperties properties,
        GtfsScheduleImportRepository repository,
        Clock clock
    ) {
        this.properties = properties;
        this.repository = repository;
        this.clock = clock;
    }

    @Scheduled(
        initialDelayString = "${linewatch.arrivals.gtfs-promotion-initial-delay:PT30S}",
        fixedDelayString = "${linewatch.arrivals.gtfs-promotion-fixed-delay:PT5M}"
    )
    public void promoteReadyImport() {
        if (!properties.isGtfsRefreshEnabled()) {
            return;
        }
        repository.activateLatestImportCoveringDate(LocalDate.now(clock.withZone(TORONTO_ZONE)));
    }
}
