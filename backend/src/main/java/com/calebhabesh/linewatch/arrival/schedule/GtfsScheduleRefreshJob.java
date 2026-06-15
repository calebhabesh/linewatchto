package com.calebhabesh.linewatch.arrival.schedule;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import java.nio.file.Files;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    prefix = "linewatch.arrivals",
    name = "gtfs-refresh-enabled",
    havingValue = "true"
)
public class GtfsScheduleRefreshJob {
    private static final Logger log = LoggerFactory.getLogger(GtfsScheduleRefreshJob.class);
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private final ArrivalProperties properties;
    private final GtfsScheduleReadRepository readRepository;
    private final GtfsScheduleDownloadClient downloadClient;
    private final GtfsScheduleImportService importService;
    private final Clock clock;

    public GtfsScheduleRefreshJob(
        ArrivalProperties properties,
        GtfsScheduleReadRepository readRepository,
        GtfsScheduleDownloadClient downloadClient,
        GtfsScheduleImportService importService,
        Clock clock
    ) {
        this.properties = properties;
        this.readRepository = readRepository;
        this.downloadClient = downloadClient;
        this.importService = importService;
        this.clock = clock;
    }

    @Scheduled(
        initialDelayString = "${linewatch.arrivals.gtfs-refresh-initial-delay:PT30S}",
        fixedDelayString = "${linewatch.arrivals.gtfs-refresh-fixed-delay:PT24H}"
    )
    public void refresh() {
        if (!properties.isGtfsRefreshEnabled()) {
            return;
        }
        Optional<GtfsScheduleReadRepository.ActiveScheduleImport> activeImport = readRepository.findActiveImport();
        if (!shouldRefresh(activeImport)) {
            return;
        }

        GtfsScheduleDownloadClient.DownloadedGtfs download = null;
        try {
            download = downloadClient.downloadCurrentZip();
            GtfsScheduleImportService.ImportSummary summary = importService.importZip(
                download.zipPath(),
                download.sourceUrl()
            );
            log.info(
                "Imported TTC GTFS schedule importId={} routes={} trips={} stopTimes={} stationStops={}",
                summary.importId(),
                summary.routes(),
                summary.trips(),
                summary.stopTimes(),
                summary.stationStops()
            );
        } catch (Exception exception) {
            log.error("TTC GTFS schedule refresh failed", exception);
        } finally {
            if (download != null) {
                try {
                    Files.deleteIfExists(download.zipPath());
                } catch (Exception exception) {
                    log.warn("Failed to delete temporary TTC GTFS zip {}", download.zipPath(), exception);
                }
            }
        }
    }

    private boolean shouldRefresh(Optional<GtfsScheduleReadRepository.ActiveScheduleImport> activeImport) {
        if (activeImport.isEmpty()) {
            return true;
        }
        LocalDate serviceEnd = activeImport.get().serviceEnd();
        if (serviceEnd == null) {
            return true;
        }
        LocalDate today = LocalDate.now(clock.withZone(TORONTO_ZONE));
        long daysRemaining = ChronoUnit.DAYS.between(today, serviceEnd);
        return daysRemaining <= properties.getGtfsRefreshMinServiceDaysRemaining();
    }
}
