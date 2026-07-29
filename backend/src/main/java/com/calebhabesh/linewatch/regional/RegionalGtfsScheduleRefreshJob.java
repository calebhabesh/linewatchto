package com.calebhabesh.linewatch.regional;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class RegionalGtfsScheduleRefreshJob implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(RegionalGtfsScheduleRefreshJob.class);

    private final RegionalArrivalProperties properties;
    private final RegionalGtfsScheduleImportService importService;
    private final HttpClient httpClient;

    public RegionalGtfsScheduleRefreshJob(
        RegionalArrivalProperties properties,
        RegionalGtfsScheduleImportService importService,
        @Qualifier("regionalScheduleHttpClient") HttpClient httpClient
    ) {
        this.properties = properties;
        this.importService = importService;
        this.httpClient = httpClient;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!properties.isScheduleEnabled()) return;
        importConfiguredPath("go", properties.getGoScheduleZipPath(), properties.getGoScheduleUrl());
        importConfiguredPath("up", properties.getUpScheduleZipPath(), properties.getUpScheduleUrl());
    }

    @Scheduled(
        initialDelayString = "${linewatch.regional.arrivals.schedule-refresh-initial-delay:PT45S}",
        fixedDelayString = "${linewatch.regional.arrivals.schedule-refresh-fixed-delay:PT24H}"
    )
    public void refresh() {
        if (!properties.isScheduleEnabled() || !properties.isScheduleRefreshEnabled()) return;
        downloadAndImport("go", properties.getGoScheduleUrl());
        downloadAndImport("up", properties.getUpScheduleUrl());
    }

    private void importConfiguredPath(String source, String configuredPath, URI sourceUrl) {
        if (configuredPath == null || configuredPath.isBlank()) return;
        try {
            importService.importZip(Path.of(configuredPath), source, sourceUrl.toString());
        } catch (Exception exception) {
            log.warn("Regional {} GTFS schedule import failed; retaining the active last-good import", source, exception);
        }
    }

    private void downloadAndImport(String source, URI sourceUrl) {
        Path temporary = null;
        try {
            temporary = Files.createTempFile("linewatch-" + source + "-gtfs-", ".zip");
            Path destination = temporary;
            URI targetUri = normalizeSourceUri(sourceUrl);
            HttpRequest request = HttpRequest.newBuilder(targetUri)
                .timeout(properties.getScheduleReadTimeout())
                .GET()
                .build();
            HttpResponse<InputStream> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IOException("Regional GTFS download for " + sourceUrl + " returned HTTP " + response.statusCode());
            }
            try (InputStream is = response.body()) {
                Files.copy(is, destination, StandardCopyOption.REPLACE_EXISTING);
            }
            if (Files.size(temporary) == 0) throw new IOException("Downloaded GTFS zip was empty");
            RegionalGtfsScheduleImportService.ImportSummary summary =
                importService.importZip(temporary, source, sourceUrl.toString());
            log.info(
                "Imported regional {} GTFS schedule: {} departures covering {} through {}",
                source, summary.departures(), summary.serviceStart(), summary.serviceEnd()
            );
        } catch (Exception exception) {
            log.warn("Regional {} GTFS schedule refresh failed; retaining the active last-good import", source, exception);
        } finally {
            if (temporary != null) {
                try {
                    Files.deleteIfExists(temporary);
                } catch (IOException exception) {
                    log.debug("Could not remove temporary regional GTFS file {}", temporary, exception);
                }
            }
        }
    }

    static URI normalizeSourceUri(URI sourceUrl) {
        return URI.create(sourceUrl.toString().replace("%2520", "%20"));
    }
}
