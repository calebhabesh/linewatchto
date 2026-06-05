package com.calebhabesh.linewatch.arrival.schedule;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class GtfsScheduleImportRunnerTest {

    @Test
    void doesNotImportWhenDisabled() throws Exception {
        ArrivalProperties properties = new ArrivalProperties();
        properties.setGtfsImportEnabled(false);
        GtfsScheduleImportService service = mock(GtfsScheduleImportService.class);

        new GtfsScheduleImportRunner(properties, service).run(null);

        verify(service, never()).importZip(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void importsConfiguredZipWhenEnabled() throws Exception {
        ArrivalProperties properties = new ArrivalProperties();
        properties.setGtfsImportEnabled(true);
        properties.setGtfsZipPath("/tmp/ttc-gtfs.zip");
        GtfsScheduleImportService service = mock(GtfsScheduleImportService.class);

        new GtfsScheduleImportRunner(properties, service).run(null);

        verify(service).importZip(Path.of("/tmp/ttc-gtfs.zip"), properties.getScheduledSourceUrl().toString());
    }
}
