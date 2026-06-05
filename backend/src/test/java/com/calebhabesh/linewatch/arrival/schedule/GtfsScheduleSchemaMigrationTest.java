package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class GtfsScheduleSchemaMigrationTest {

    @Test
    void v16CreatesRapidTransitScheduleTablesAndIndexes() throws IOException {
        String sql = migrationSql("/db/migration/V16__gtfs_schedule_arrivals.sql");

        assertThat(sql).contains("create table gtfs_schedule_imports");
        assertThat(sql).contains("create table gtfs_routes");
        assertThat(sql).contains("create table gtfs_stops");
        assertThat(sql).contains("create table gtfs_services");
        assertThat(sql).contains("create table gtfs_service_exceptions");
        assertThat(sql).contains("create table gtfs_trips");
        assertThat(sql).contains("create table gtfs_stop_times");
        assertThat(sql).contains("create table gtfs_station_stops");
        assertThat(sql).contains("idx_gtfs_stop_times_station_lookup");
        assertThat(sql).contains("idx_gtfs_trips_service_lookup");
        assertThat(sql).contains("idx_gtfs_station_stops_station_line");
        assertThat(sql).contains("route_short_name in ('1', '2', '4', '5', '6')");
    }

    private String migrationSql(String path) throws IOException {
        try (var input = getClass().getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
