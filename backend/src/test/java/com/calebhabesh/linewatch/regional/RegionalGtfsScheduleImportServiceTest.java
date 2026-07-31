package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

class RegionalGtfsScheduleImportServiceTest {
    @TempDir Path tempDir;

    @Test
    void importsMappedGoRailDeparturesAndIgnoresBusRoutes() throws Exception {
        Path zip = tempDir.resolve("go.zip");
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,route_short_name,route_long_name,route_type
                MI,MI,Milton,2
                BUS,21,Milton Bus,3
                """);
            entry(output, "trips.txt", """
                route_id,service_id,trip_id,trip_headsign
                MI,WKD,MI100,Union Station
                BUS,WKD,BUS100,Union Station
                """);
            entry(output, "stops.txt", """
                stop_id,stop_code,stop_name,parent_station,platform_code
                ML,ML,Milton GO,,1
                KP,KP,Kipling GO,,2
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                WKD,1,1,1,1,1,0,0,20260701,20260901
                """);
            entry(output, "calendar_dates.txt", "service_id,date,exception_type\nWKD,20260803,2\n");
            entry(output, "stop_times.txt", """
                trip_id,arrival_time,departure_time,stop_id,stop_sequence
                MI100,06:30:00,06:30:00,ML,1
                MI100,07:20:00,07:20:00,KP,2
                """);
        }
        RegionalGtfsScheduleRepository repository = mock(RegionalGtfsScheduleRepository.class);
        when(repository.replace(any(), any())).thenReturn(53L);
        RegionalGtfsScheduleImportService service = new RegionalGtfsScheduleImportService(
            repository, Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC)
        );

        RegionalGtfsScheduleImportService.ImportSummary summary =
            service.importZip(zip, "go", "https://example.test/go.zip");

        ArgumentCaptor<RegionalGtfsScheduleImport> captured =
            ArgumentCaptor.forClass(RegionalGtfsScheduleImport.class);
        verify(repository).replace(captured.capture(), any());
        assertThat(summary.importId()).isEqualTo(53L);
        assertThat(captured.getValue().departures())
            .extracting(RegionalGtfsScheduleImport.Departure::stationId)
            .containsExactly("milton", "kipling");
        assertThat(captured.getValue().departures())
            .extracting(RegionalGtfsScheduleImport.Departure::lineId)
            .containsOnly("regional-mi");
    }

    @Test
    void derivesUpTerminalHeadsignsFromDirectionIdsWhenThePublishedHeadsignIsGeneric() throws Exception {
        Path zip = tempDir.resolve("up.zip");
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,route_short_name,route_long_name,route_type
                UP,UP,Union Pearson Express,2
                """);
            entry(output, "trips.txt", """
                route_id,service_id,trip_id,trip_headsign,direction_id
                UP,DAILY,UP100,Union Pearson Express,0
                UP,DAILY,UP200,Union Pearson Express,1
                """);
            entry(output, "stops.txt", """
                stop_id,stop_code,stop_name,parent_station,platform_code
                UNI,UN,Union,,1
                YYZ,PA,Pearson Airport,,1
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                DAILY,1,1,1,1,1,1,1,20260701,20260901
                """);
            entry(output, "stop_times.txt", """
                trip_id,arrival_time,departure_time,stop_id,stop_sequence
                UP100,09:00:00,09:00:00,YYZ,1
                UP100,09:25:00,09:25:00,UNI,2
                UP200,09:30:00,09:30:00,UNI,1
                UP200,09:55:00,09:55:00,YYZ,2
                """);
        }
        RegionalGtfsScheduleRepository repository = mock(RegionalGtfsScheduleRepository.class);
        when(repository.replace(any(), any())).thenReturn(54L);
        RegionalGtfsScheduleImportService service = new RegionalGtfsScheduleImportService(
            repository, Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC)
        );

        service.importZip(zip, "up", "https://example.test/up.zip");

        ArgumentCaptor<RegionalGtfsScheduleImport> captured =
            ArgumentCaptor.forClass(RegionalGtfsScheduleImport.class);
        verify(repository).replace(captured.capture(), any());
        assertThat(captured.getValue().departures())
            .extracting(RegionalGtfsScheduleImport.Departure::tripId, RegionalGtfsScheduleImport.Departure::direction)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("UP100", "Union Station"),
                org.assertj.core.groups.Tuple.tuple("UP100", "Union Station"),
                org.assertj.core.groups.Tuple.tuple("UP200", "Pearson Airport"),
                org.assertj.core.groups.Tuple.tuple("UP200", "Pearson Airport")
            );
    }

    private void entry(ZipOutputStream output, String name, String body) throws Exception {
        output.putNextEntry(new ZipEntry(name));
        output.write(body.getBytes(StandardCharsets.UTF_8));
        output.closeEntry();
    }
}
