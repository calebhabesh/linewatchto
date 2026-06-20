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
    void importsOnlyRapidTransitRoutesAndResolvesStationAliases() throws Exception {
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

        // Prove that the first pass ignores surface stop times
        assertThat(prepared.getValue().stops())
            .extracting(GtfsImportModels.StopRow::stopId)
            .doesNotContain("QUEEN_SURFACE");
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
                QUEEN_1,09:01:00,09:01:00,QUEEN_SURFACE,1
                """);
        }
    }

    private void entry(ZipOutputStream output, String name, String body) throws IOException {
        output.putNextEntry(new ZipEntry(name));
        output.write(body.getBytes(StandardCharsets.UTF_8));
        output.closeEntry();
    }
}
