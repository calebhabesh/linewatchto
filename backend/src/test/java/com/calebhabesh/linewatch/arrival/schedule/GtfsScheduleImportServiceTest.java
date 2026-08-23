package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

class GtfsScheduleImportServiceTest {
    @TempDir
    Path tempDir;

    @Test
    void importsRapidTransitScheduleAndParentLinkedSurfaceCatalog() throws Exception {
        Path zip = tempDir.resolve("gtfs.zip");
        writeZip(zip);

        GtfsScheduleImportWriter writer = mock(GtfsScheduleImportWriter.class);
        when(writer.write(eq(zip), eq("test-source"), any()))
            .thenReturn(new GtfsScheduleImportService.ImportSummary(42L, 1, 3, 1, 1, 1, 2, 2));

        GtfsScheduleImportService service = new GtfsScheduleImportService(writer);

        GtfsScheduleImportService.ImportSummary summary = service.importZip(zip, "test-source");

        ArgumentCaptor<GtfsSchedulePreparedImport> prepared =
            ArgumentCaptor.forClass(GtfsSchedulePreparedImport.class);
        verify(writer).write(eq(zip), eq("test-source"), prepared.capture());

        assertThat(prepared.getValue().routes())
            .extracting(GtfsImportModels.RouteRow::lineId)
            .containsExactly("line-1");
        assertThat(prepared.getValue().trips())
            .extracting(GtfsImportModels.TripRow::tripId)
            .containsExactly("L1_N_1");
        assertThat(prepared.getValue().rapidTransitTripIds()).containsExactly("L1_N_1");
        assertThat(prepared.getValue().stops())
            .extracting(GtfsImportModels.StopRow::stopId)
            .containsExactlyInAnyOrder("UNION", "UNION_N", "UNION_S");
        assertThat(summary.stopTimes()).isEqualTo(2);

        assertThat(prepared.getValue().surfaceRoutes())
            .extracting(GtfsImportModels.SurfaceRouteRow::shortName, GtfsImportModels.SurfaceRouteRow::mode)
            .containsExactly(org.assertj.core.groups.Tuple.tuple("501", "streetcar"));
        assertThat(prepared.getValue().surfaceStationStops())
            .filteredOn(row -> row.stopId().equals("UNION_STREETCAR"))
            .singleElement()
            .satisfies(row -> {
                assertThat(row.stationId()).isEqualTo("union");
                assertThat(row.bayPlatform()).isEqualTo("Streetcar Platform");
            });
        assertThat(prepared.getValue().surfaceTrips())
            .extracting(GtfsImportModels.SurfaceTripRow::tripId)
            .containsExactly("QUEEN_1");

        // Prove that the first pass ignores surface stop times
        assertThat(prepared.getValue().stops())
            .extracting(GtfsImportModels.StopRow::stopId)
            .doesNotContain("QUEEN_SURFACE");
    }

    @Test
    void importsOnStreetNightRoutesAndSurfaceConnectionsWithoutParentStation() throws Exception {
        Path zip = tempDir.resolve("gtfs-night.zip");
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,agency_id,route_short_name,route_long_name,route_type
                1,TTC,1,Yonge-University,1
                304,TTC,304,King,0
                320,TTC,320,Yonge,3
                """);
            entry(output, "stops.txt", """
                stop_id,stop_name,parent_station
                KING_PLATFORM,King Station - Northbound Platform,
                11177,King St West at Yonge St East Side - King Station,
                957,Yonge St at King St West - King Station,
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                NIGHT,1,1,1,1,1,1,1,20260601,20261231
                """);
            entry(output, "trips.txt", """
                route_id,service_id,trip_id,trip_headsign,direction_id
                1,NIGHT,L1_1,Northbound to Finch,0
                304,NIGHT,TRIP_304,East - 304 King towards Broadview Station,0
                320,NIGHT,TRIP_320,South - 320 Yonge towards Queens Quay,1
                """);
            entry(output, "stop_times.txt", """
                trip_id,arrival_time,departure_time,stop_id,stop_sequence
                L1_1,03:00:00,03:00:00,KING_PLATFORM,1
                TRIP_304,03:05:00,03:05:00,11177,1
                TRIP_320,03:10:00,03:10:00,957,1
                """);
        }

        GtfsScheduleImportWriter writer = mock(GtfsScheduleImportWriter.class);
        when(writer.write(eq(zip), eq("test-night"), any()))
            .thenReturn(new GtfsScheduleImportService.ImportSummary(43L, 1, 1, 1, 0, 1, 1, 1));

        GtfsScheduleImportService service = new GtfsScheduleImportService(writer);
        service.importZip(zip, "test-night");

        ArgumentCaptor<GtfsSchedulePreparedImport> prepared =
            ArgumentCaptor.forClass(GtfsSchedulePreparedImport.class);
        verify(writer).write(eq(zip), eq("test-night"), prepared.capture());

        assertThat(prepared.getValue().surfaceRoutes())
            .extracting(GtfsImportModels.SurfaceRouteRow::shortName, GtfsImportModels.SurfaceRouteRow::mode)
            .containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple("304", "streetcar"),
                org.assertj.core.groups.Tuple.tuple("320", "bus")
            );

        assertThat(prepared.getValue().surfaceStationStops())
            .extracting(GtfsImportModels.SurfaceStationStopRow::stopId, GtfsImportModels.SurfaceStationStopRow::stationId)
            .containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple("11177", "king"),
                org.assertj.core.groups.Tuple.tuple("957", "king")
            );

        assertThat(prepared.getValue().surfaceStationConnections())
            .extracting(
                GtfsImportModels.SurfaceStationConnectionRow::stationId,
                GtfsImportModels.SurfaceStationConnectionRow::stopId,
                GtfsImportModels.SurfaceStationConnectionRow::routeShortName,
                GtfsImportModels.SurfaceStationConnectionRow::destination
            )
            .containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple("king", "11177", "304", "East - 304 King towards Broadview Station"),
                org.assertj.core.groups.Tuple.tuple("king", "957", "320", "South - 320 Yonge towards Queens Quay")
            );
    }

    @Test
    void mapsAmpersandStationNameToReviewedAndAlias() throws Exception {
        Path zip = tempDir.resolve("gtfs-aga-khan.zip");
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,agency_id,route_short_name,route_long_name,route_type
                5,TTC,5,Eglinton Crosstown,1
                """);
            entry(output, "stops.txt", """
                stop_id,stop_name,parent_station
                99924,Aga Khan Park & Museum,
                16218,Aga Khan Park & Museum Station - Eastbound Platform,99924
                16219,Aga Khan Park & Museum Station - Westbound Platform,99924
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                DAILY,1,1,1,1,1,1,1,20260726,20260905
                """);
            entry(output, "trips.txt", """
                route_id,service_id,trip_id,trip_headsign,direction_id
                5,DAILY,L5_E_1,Eastbound to Kennedy,0
                5,DAILY,L5_W_1,Westbound to Mount Dennis,1
                """);
            entry(output, "stop_times.txt", """
                trip_id,arrival_time,departure_time,stop_id,stop_sequence
                L5_E_1,09:00:00,09:00:00,16218,1
                L5_W_1,09:05:00,09:05:00,16219,1
                """);
        }

        GtfsScheduleImportWriter writer = mock(GtfsScheduleImportWriter.class);
        when(writer.write(eq(zip), eq("test-aga-khan"), any()))
            .thenReturn(new GtfsScheduleImportService.ImportSummary(44L, 1, 3, 1, 0, 2, 2, 2));

        new GtfsScheduleImportService(writer).importZip(zip, "test-aga-khan");

        ArgumentCaptor<GtfsSchedulePreparedImport> prepared =
            ArgumentCaptor.forClass(GtfsSchedulePreparedImport.class);
        verify(writer).write(eq(zip), eq("test-aga-khan"), prepared.capture());
        assertThat(prepared.getValue().stationStops())
            .extracting(
                GtfsImportModels.StationStopRow::stationId,
                GtfsImportModels.StationStopRow::lineId,
                GtfsImportModels.StationStopRow::stopId
            )
            .containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple("aga-khan-park-and-museum", "line-5", "16218"),
                org.assertj.core.groups.Tuple.tuple("aga-khan-park-and-museum", "line-5", "16219")
            );
    }

    private void writeZip(Path zip) throws IOException {
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,agency_id,route_short_name,route_long_name,route_type
                1,TTC,1,Yonge-University,1
                501,TTC,501,Queen,0
                """);
            entry(output, "stops.txt", """
                stop_id,stop_name,parent_station
                UNION,Union Station,
                UNION_N,Union Station,UNION
                UNION_S,Union Station,UNION
                UNION_STREETCAR,Union Station Streetcar Platform,UNION
                QUEEN_SURFACE,Queen St West,
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                WEEKDAY,1,1,1,1,1,0,0,20260601,20261231
                """);
            entry(output, "calendar_dates.txt", """
                service_id,date,exception_type
                WEEKDAY,20260701,2
                """);
            entry(output, "trips.txt", """
                route_id,service_id,trip_id,trip_headsign,direction_id
                1,WEEKDAY,L1_N_1,Northbound to Finch,0
                501,WEEKDAY,QUEEN_1,Eastbound to Neville Park,0
                """);
            entry(output, "stop_times.txt", """
                trip_id,arrival_time,departure_time,stop_id,stop_sequence
                L1_N_1,09:00:00,09:00:00,UNION_N,10
                L1_N_1,09:05:00,09:05:00,UNION_S,11
                QUEEN_1,09:01:00,09:01:00,UNION_STREETCAR,1
                """);
        }
    }

    private void entry(ZipOutputStream output, String name, String body) throws IOException {
        output.putNextEntry(new ZipEntry(name));
        output.write(body.getBytes(StandardCharsets.UTF_8));
        output.closeEntry();
    }
}
