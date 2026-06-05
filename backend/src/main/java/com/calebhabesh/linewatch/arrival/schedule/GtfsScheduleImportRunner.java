package com.calebhabesh.linewatch.arrival.schedule;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import java.nio.file.Path;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class GtfsScheduleImportRunner implements ApplicationRunner {
    private final ArrivalProperties properties;
    private final GtfsScheduleImportService importService;

    public GtfsScheduleImportRunner(ArrivalProperties properties, GtfsScheduleImportService importService) {
        this.properties = properties;
        this.importService = importService;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!properties.isGtfsImportEnabled()) {
            return;
        }
        String zipPath = properties.getGtfsZipPath();
        if (zipPath == null || zipPath.isBlank()) {
            throw new IllegalStateException("GTFS import is enabled but linewatch.arrivals.gtfs-zip-path is blank");
        }
        importService.importZip(Path.of(zipPath), properties.getScheduledSourceUrl().toString());
    }
}
