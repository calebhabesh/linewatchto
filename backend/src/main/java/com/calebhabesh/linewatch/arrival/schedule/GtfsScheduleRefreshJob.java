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
    private final GtfsScheduleImportRepository importRepository;
    private final GtfsScheduleDownloadClient downloadClient;
    private final GtfsScheduleImportService importService;
    private final GtfsScheduleRefreshRunService runService;
    private final Clock clock;

    public GtfsScheduleRefreshJob(
        ArrivalProperties properties,
        GtfsScheduleReadRepository readRepository,
        GtfsScheduleImportRepository importRepository,
        GtfsScheduleDownloadClient downloadClient,
        GtfsScheduleImportService importService,
        GtfsScheduleRefreshRunService runService,
        Clock clock
    ) {
        this.properties = properties;
        this.readRepository = readRepository;
        this.importRepository = importRepository;
        this.downloadClient = downloadClient;
        this.importService = importService;
        this.runService = runService;
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
        importRepository.activateLatestImportCoveringDate(LocalDate.now(clock.withZone(TORONTO_ZONE)));
        Optional<GtfsScheduleReadRepository.ActiveScheduleImport> activeImport = readRepository.findActiveImport();
        Optional<GtfsScheduleReadRepository.ScheduleImport> latestImport = readRepository.findLatestImport();
        if (!shouldRefresh(activeImport, latestImport)) {
            return;
        }

        long runId = runService.start();
        GtfsScheduleDownloadClient.DownloadedGtfs download = null;
        try {
            download = downloadClient.downloadCurrentZip();
            GtfsScheduleImportService.ImportSummary summary = importService.importZip(
                download.zipPath(),
                download.sourceUrl()
            );
            runService.succeed(runId, summary);
            log.info(
                "Imported TTC GTFS schedule importId={} routes={} trips={} stopTimes={} stationStops={}",
                summary.importId(),
                summary.routes(),
                summary.trips(),
                summary.stopTimes(),
                summary.stationStops()
            );
        } catch (Exception exception) {
            runService.fail(runId, exception);
            log.error("TTC GTFS schedule refresh failed", exception);
        } catch (Error error) {
            try {
                runService.fail(runId, error);
            } catch (RuntimeException recordingFailure) {
                error.addSuppressed(recordingFailure);
            }
            log.error("TTC GTFS schedule refresh failed with an unrecoverable error", error);
            throw error;
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

    private boolean shouldRefresh(
        Optional<GtfsScheduleReadRepository.ActiveScheduleImport> activeImport,
        Optional<GtfsScheduleReadRepository.ScheduleImport> latestImport
    ) {
        LocalDate today = LocalDate.now(clock.withZone(TORONTO_ZONE));
        if (activeImport.isEmpty()) {
            return latestImport
                .map(latest -> latest.serviceEnd() == null || latest.serviceEnd().isBefore(today))
                .orElse(true);
        }
        if (!readRepository.hasSurfaceCatalog(activeImport.get().id())) {
            log.info(
                "Refreshing TTC GTFS schedule because active import {} predates or lacks the full surface stop catalog",
                activeImport.get().id()
            );
            return true;
        }
        LocalDate serviceEnd = activeImport.get().serviceEnd();
        if (serviceEnd == null) {
            return true;
        }
        if (latestImportExtendsCoverageBeyondThreshold(latestImport, serviceEnd, today)) {
            return false;
        }
        long daysRemaining = ChronoUnit.DAYS.between(today, serviceEnd);
        return daysRemaining <= properties.getGtfsRefreshMinServiceDaysRemaining();
    }

    private boolean latestImportExtendsCoverageBeyondThreshold(
        Optional<GtfsScheduleReadRepository.ScheduleImport> latestImport,
        LocalDate activeServiceEnd,
        LocalDate today
    ) {
        return latestImport
            .map(GtfsScheduleReadRepository.ScheduleImport::serviceEnd)
            .filter(latestServiceEnd -> latestServiceEnd.isAfter(activeServiceEnd))
            .map(latestServiceEnd -> ChronoUnit.DAYS.between(today, latestServiceEnd))
            .map(daysRemaining -> daysRemaining > properties.getGtfsRefreshMinServiceDaysRemaining())
            .orElse(false);
    }
}
