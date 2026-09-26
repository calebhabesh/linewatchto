package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
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
                route_id,service_id,trip_id,trip_headsign,trip_short_name
                MI,WKD,MI100,Union Station,681
                BUS,WKD,BUS100,Union Station,21B
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
        when(repository.beginReplacementImport(any(), any(), any(), any(), any())).thenReturn(53L);
        RegionalGtfsScheduleImportService service = new RegionalGtfsScheduleImportService(
            repository, Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC)
        );

        RegionalGtfsScheduleImportService.ImportSummary summary =
            service.importZip(zip, "go", "https://example.test/go.zip");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<RegionalGtfsScheduleImport.Departure>> captured =
            ArgumentCaptor.forClass(List.class);
        verify(repository).insertDepartures(eq(53L), captured.capture());
        assertThat(summary.importId()).isEqualTo(53L);
        assertThat(summary.departures()).isEqualTo(2);
        assertThat(captured.getValue())
            .extracting(RegionalGtfsScheduleImport.Departure::stationId)
            .containsExactly("milton", "kipling");
        assertThat(captured.getValue())
            .extracting(RegionalGtfsScheduleImport.Departure::lineId)
            .containsOnly("regional-mi");
        assertThat(captured.getValue())
            .extracting(RegionalGtfsScheduleImport.Departure::tripShortName)
            .containsOnly("681");
        assertThat(captured.getValue())
            .extracting(RegionalGtfsScheduleImport.Departure::stopSequence)
            .containsExactly(1, 2);
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
                route_id,service_id,trip_id,trip_headsign,direction_id,trip_short_name
                UP,DAILY,UP100,Union Pearson Express,0,100
                UP,DAILY,UP200,Union Pearson Express,1,200
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
        when(repository.beginReplacementImport(any(), any(), any(), any(), any())).thenReturn(54L);
        RegionalGtfsScheduleImportService service = new RegionalGtfsScheduleImportService(
            repository, Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC)
        );

        service.importZip(zip, "up", "https://example.test/up.zip");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<RegionalGtfsScheduleImport.Departure>> captured =
            ArgumentCaptor.forClass(List.class);
        verify(repository).insertDepartures(eq(54L), captured.capture());
        assertThat(captured.getValue())
            .extracting(RegionalGtfsScheduleImport.Departure::tripId, RegionalGtfsScheduleImport.Departure::direction)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("UP100", "Pearson Airport"),
                org.assertj.core.groups.Tuple.tuple("UP100", "Pearson Airport"),
                org.assertj.core.groups.Tuple.tuple("UP200", "Union Station"),
                org.assertj.core.groups.Tuple.tuple("UP200", "Union Station")
            );
    }

    @Test
    void handlesAfterMidnightDepartures() throws Exception {
        Path zip = tempDir.resolve("after_midnight.zip");
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,route_short_name,route_long_name,route_type
                LW,LW,Lakeshore West,2
                """);
            entry(output, "trips.txt", """
                route_id,service_id,trip_id,trip_headsign,trip_short_name
                LW,DAILY,LW999,Aldershot,999
                """);
            entry(output, "stops.txt", """
                stop_id,stop_code,stop_name,parent_station,platform_code
                UN,UN,Union Station,,3
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                DAILY,1,1,1,1,1,1,1,20260701,20260901
                """);
            entry(output, "stop_times.txt", """
                trip_id,arrival_time,departure_time,stop_id,stop_sequence
                LW999,25:30:15,25:30:15,UN,1
                """);
        }
        RegionalGtfsScheduleRepository repository = mock(RegionalGtfsScheduleRepository.class);
        when(repository.beginReplacementImport(any(), any(), any(), any(), any())).thenReturn(55L);
        RegionalGtfsScheduleImportService service = new RegionalGtfsScheduleImportService(
            repository, Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC)
        );

        service.importZip(zip, "go", "https://example.test/go.zip");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<RegionalGtfsScheduleImport.Departure>> captured =
            ArgumentCaptor.forClass(List.class);
        verify(repository).insertDepartures(eq(55L), captured.capture());
        assertThat(captured.getValue()).singleElement().satisfies(departure -> {
            assertThat(departure.stationId()).isEqualTo("union");
            assertThat(departure.lineId()).isEqualTo("regional-lw");
            assertThat(departure.departureSeconds()).isEqualTo(25 * 3600 + 30 * 60 + 15);
        });
    }

    @Test
    void handlesParentStopsAndServiceExceptions() throws Exception {
        Path zip = tempDir.resolve("parent_stops.zip");
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,route_short_name,route_long_name,route_type
                LE,LE,Lakeshore East,2
                """);
            entry(output, "trips.txt", """
                route_id,service_id,trip_id,trip_headsign,trip_short_name
                LE,WKD,LE100,Oshawa,100
                """);
            entry(output, "stops.txt", """
                stop_id,stop_code,stop_name,parent_station,platform_code
                PARENT_UN,UN,Union Station Parent,,
                CHILD_UN_1,,,PARENT_UN,1
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                WKD,1,1,1,1,1,0,0,20260701,20260901
                """);
            entry(output, "calendar_dates.txt", """
                service_id,date,exception_type
                WKD,20260803,2
                WKD,20260804,1
                """);
            entry(output, "stop_times.txt", """
                trip_id,arrival_time,departure_time,stop_id,stop_sequence
                LE100,08:00:00,08:00:00,CHILD_UN_1,1
                """);
        }
        RegionalGtfsScheduleRepository repository = mock(RegionalGtfsScheduleRepository.class);
        when(repository.beginReplacementImport(any(), any(), any(), any(), any())).thenReturn(56L);
        RegionalGtfsScheduleImportService service = new RegionalGtfsScheduleImportService(
            repository, Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC)
        );

        service.importZip(zip, "go", "https://example.test/go.zip");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<RegionalGtfsScheduleImport.ServiceException>> exceptions =
            ArgumentCaptor.forClass(List.class);
        verify(repository).insertServiceExceptions(eq(56L), exceptions.capture());
        assertThat(exceptions.getValue())
            .extracting(RegionalGtfsScheduleImport.ServiceException::serviceDate, RegionalGtfsScheduleImport.ServiceException::exceptionType)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple(LocalDate.parse("2026-08-03"), 2),
                org.assertj.core.groups.Tuple.tuple(LocalDate.parse("2026-08-04"), 1)
            );

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<RegionalGtfsScheduleImport.Departure>> captured =
            ArgumentCaptor.forClass(List.class);
        verify(repository).insertDepartures(eq(56L), captured.capture());
        assertThat(captured.getValue()).singleElement().satisfies(departure -> {
            assertThat(departure.stationId()).isEqualTo("union");
            assertThat(departure.platform()).isEqualTo("1");
        });
    }

    @Test
    void generatedFixtureWithOver2000DeparturesMaintainsOutputEquivalence() throws Exception {
        Path zip = tempDir.resolve("large_fixture.zip");
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,route_short_name,route_long_name,route_type
                MI,MI,Milton,2
                """);
            entry(output, "trips.txt", """
                route_id,service_id,trip_id,trip_headsign,trip_short_name
                MI,WKD,MI_TRIP,Union Station,681
                """);
            entry(output, "stops.txt", """
                stop_id,stop_code,stop_name,parent_station,platform_code
                ML,ML,Milton GO,,1
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                WKD,1,1,1,1,1,0,0,20260701,20260901
                """);

            output.putNextEntry(new ZipEntry("stop_times.txt"));
            StringBuilder sb = new StringBuilder();
            sb.append("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n");
            for (int i = 0; i < 2200; i++) {
                int hour = (i / 3600) % 24;
                int min = (i / 60) % 60;
                int sec = i % 60;
                String time = String.format("%02d:%02d:%02d", hour, min, sec);
                sb.append(String.format("MI_TRIP,%s,%s,ML,%d\n", time, time, i + 1));
            }
            output.write(sb.toString().getBytes(StandardCharsets.UTF_8));
            output.closeEntry();
        }

        RegionalGtfsScheduleRepository repository = mock(RegionalGtfsScheduleRepository.class);
        when(repository.beginReplacementImport(any(), any(), any(), any(), any())).thenReturn(57L);
        RegionalGtfsScheduleImportService service = new RegionalGtfsScheduleImportService(
            repository, Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC)
        );

        RegionalGtfsScheduleImportService.ImportSummary summary =
            service.importZip(zip, "go", "https://example.test/go.zip");

        assertThat(summary.importId()).isEqualTo(57L);
        assertThat(summary.departures()).isEqualTo(2200);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<RegionalGtfsScheduleImport.Departure>> captured =
            ArgumentCaptor.forClass(List.class);
        verify(repository, org.mockito.Mockito.times(3)).insertDepartures(eq(57L), captured.capture());

        List<List<RegionalGtfsScheduleImport.Departure>> allBatches = captured.getAllValues();
        assertThat(allBatches).extracting(List::size).containsExactly(1000, 1000, 200);

        int totalDepartures = allBatches.stream().mapToInt(List::size).sum();
        assertThat(totalDepartures).isEqualTo(2200);
    }

    private void entry(ZipOutputStream output, String name, String body) throws Exception {
        output.putNextEntry(new ZipEntry(name));
        output.write(body.getBytes(StandardCharsets.UTF_8));
        output.closeEntry();
    }
}
